package com.audiostudio.app.engine

import com.arthenica.ffmpegkit.FFmpegKit
import com.arthenica.ffmpegkit.FFmpegKitConfig
import com.arthenica.ffmpegkit.FFmpegSession
import com.arthenica.ffmpegkit.FFprobeKit
import com.arthenica.ffmpegkit.Statistics
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.resume

/** 单个格式的能力检测结果 */
data class FormatCapability(
    val id: String,
    val canEncode: Boolean,
    val encoder: String? = null,
    /** 不能编码的原因（展示在 UI 上，杜绝"假支持"） */
    val reason: String? = null,
)

data class EngineCapabilities(
    val ffmpegVersion: String,
    val encoders: Set<String>,
    val muxers: Set<String>,
    val formats: List<FormatCapability>,
)

/** 一次执行的结果 */
data class RunOutcome(
    val returnCode: Int,
    val output: String,
    val failStackTrace: String?,
    /** 会话被取消（用户取消或暂停引发的中止） */
    val cancelled: Boolean,
)

/**
 * 运行中的会话句柄（取消）。
 * 注意：本 fork（dev.ffmpegkit-maintained 8.1.9）不提供 suspendAsync/resumeAsync，
 * 暂停由 ConvertManager 以「取消 + 记录偏移 + 重排队带 -ss 续跑」实现。
 */
class RunningSession internal constructor(
    val taskId: String,
    val sessionId: Long,
    private val session: FFmpegSession,
    private val engine: FfmpegEngine,
) {
    fun cancel() {
        engine.markCancelled(taskId)
        try {
            session.cancel()
        } catch (_: Throwable) {
        }
    }

    /** 暂停：中止当前会话（由队列负责按偏移续跑），不标记用户取消 */
    fun abortForPause() {
        engine.markCancelled(taskId)
        try {
            session.cancel()
        } catch (_: Throwable) {
        }
    }
}

/**
 * FFmpeg 引擎：能力检测 / 真实探测 / 参数数组执行。
 * 进度通过 FFmpegKitConfig.enableStatisticsCallback 的 statistics.time 上报（真实进度，禁止伪造）。
 */
class FfmpegEngine {

    private val initMutex = Mutex()
    @Volatile private var cachedCapabilities: EngineCapabilities? = null

    /** sessionId → 进度监听（全局 statistics 回调按 sessionId 路由） */
    private val statListeners = ConcurrentHashMap<Long, (Statistics) -> Unit>()

    /** 取消/暂停标记 */
    private val cancelledTasks = ConcurrentHashMap.newKeySet<String>()

    /** taskId → 运行中的会话（供队列做取消） */
    private val sessionsByTask = ConcurrentHashMap<String, FFmpegSession>()

    private var globalStatsInstalled = false

    private fun installGlobalStats() {
        if (globalStatsInstalled) return
        synchronized(this) {
            if (globalStatsInstalled) return
            FFmpegKitConfig.enableStatisticsCallback { st ->
                statListeners[st.sessionId]?.invoke(st)
            }
            globalStatsInstalled = true
        }
    }

    suspend fun ensureInit(): EngineCapabilities = initMutex.withLock {
        cachedCapabilities ?: withContext(Dispatchers.IO) {
            installGlobalStats()
            val encoders = parseNameSet(runFfmpeg(listOf("-hide_banner", "-encoders")))
            val muxers = parseNameSet(runFfmpeg(listOf("-hide_banner", "-muxers")))
            val version = try {
                FFmpegKitConfig.getFFmpegVersion() ?: "unknown"
            } catch (t: Throwable) {
                "unknown"
            }
            val formats = Formats.ALL.map { f ->
                val hit = f.encoderCandidates.firstOrNull { it in encoders }
                if (hit != null) {
                    FormatCapability(f.id, true, hit)
                } else {
                    FormatCapability(
                        f.id, false, null,
                        "当前引擎缺少编码器：${f.encoderCandidates.joinToString("/")}",
                    )
                }
            }
            EngineCapabilities(version, encoders, muxers, formats).also { cachedCapabilities = it }
        }
    }

    /** 已缓存的能力（未初始化时为 null） */
    val capabilities: EngineCapabilities? get() = cachedCapabilities

    /** 目标格式是否可编码（未初始化时默认允许，初始化后由 UI 过滤） */
    fun canEncode(formatId: String): Boolean {
        val caps = cachedCapabilities ?: return true
        return caps.formats.firstOrNull { it.id == formatId }?.canEncode ?: false
    }

    private fun runFfmpeg(args: List<String>): String = try {
        val session = FFmpegKit.executeWithArguments(args.toTypedArray())
        session.output ?: ""
    } catch (t: Throwable) {
        ""
    }

    /**
     * 解析 `ffmpeg -encoders` 输出的名称集合。
     * 真实行形如 `A....D libmp3lame  libmp3lame MP3 (codec mp3)`：
     * 6 位 flags = 类型(V/A/S) + 能力位(F/S/X/B/D/.)，随后是空格与编码器名。
     */
    internal fun parseNameSet(output: String): Set<String> {
        val names = mutableSetOf<String>()
        for (raw in output.lineSequence()) {
            val line = raw.trim()
            if (line.length < 8) continue
            val flags = line.substring(0, 6)
            if (flags[0] != 'V' && flags[0] != 'A' && flags[0] != 'S') continue
            if (!flags.all {
                    it == 'V' || it == 'A' || it == 'S' || it == 'F' ||
                        it == 'X' || it == 'B' || it == 'D' || it == '.'
                }
            ) continue
            if (line[6] != ' ') continue
            val name = line.substring(7).trim().substringBefore(' ')
            if (name.isNotEmpty() && !name.startsWith("=")) names.add(name)
        }
        return names
    }

    /** 真实探测（ffprobe，随 ffmpeg-kit 附带） */
    suspend fun probe(path: String): ProbeResult = withContext(Dispatchers.IO) {
        val session = FFprobeKit.executeWithArguments(
            arrayOf("-v", "error", "-print_format", "json", "-show_format", "-show_streams", path),
        )
        val out = session.output ?: ""
        parseProbeJson(out)
    }

    fun markCancelled(taskId: String) {
        cancelledTasks.add(taskId)
    }

    private fun clearTaskState(taskId: String, sessionId: Long) {
        cancelledTasks.remove(taskId)
        statListeners.remove(sessionId)
        sessionsByTask.remove(taskId)
    }

    /**
     * 以参数数组执行作业（不经过 shell）。
     * 进度：全局 FFmpegKitConfig.enableStatisticsCallback → statistics.time（毫秒）。
     * [onSession] 在会话创建后立即回调，供队列登记取消句柄。
     */
    suspend fun run(
        taskId: String,
        args: List<String>,
        onSession: (RunningSession) -> Unit,
        onProgress: (processedMs: Double, speed: Double?) -> Unit,
        onLog: (String) -> Unit = {},
    ): RunOutcome = withContext(Dispatchers.IO) {
        installGlobalStats()
        suspendCancellableCoroutine { cont ->
            val session: FFmpegSession = FFmpegKit.executeWithArgumentsAsync(
                args.toTypedArray(),
                { s ->
                    val userCancelled = cancelledTasks.contains(taskId)
                    val outcome = try {
                        val rc = s.returnCode
                        val rcValue = rc?.value ?: -1
                        RunOutcome(
                            returnCode = rcValue,
                            output = s.output ?: "",
                            failStackTrace = s.failStackTrace,
                            cancelled = userCancelled || rcValue == 255,
                        )
                    } catch (t: Throwable) {
                        RunOutcome(-1, s.output ?: "", t.toString(), userCancelled)
                    }
                    clearTaskState(taskId, s.sessionId)
                    if (cont.isActive) cont.resume(outcome)
                },
                { l -> onLog(l.message ?: "") },
                null,
            ).also { s ->
                statListeners[s.sessionId] = { st ->
                    onProgress(st.time, st.speed)
                }
                sessionsByTask[taskId] = s
                onSession(
                    RunningSession(
                        taskId = taskId,
                        sessionId = s.sessionId,
                        session = s,
                        engine = this@FfmpegEngine,
                    ),
                )
                // 竞态兜底：登记前已被取消/暂停
                if (cancelledTasks.contains(taskId)) {
                    try {
                        s.cancel()
                    } catch (_: Throwable) {
                    }
                }
            }
            cont.invokeOnCancellation { /* 会话由 manager 的 cancel/abort 主动停止 */ }
        }
    }

    fun sessionOf(taskId: String): FFmpegSession? = sessionsByTask[taskId]
}
