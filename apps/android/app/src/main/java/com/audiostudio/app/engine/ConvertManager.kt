package com.audiostudio.app.engine

import android.content.Context
import android.content.Intent
import com.audiostudio.app.data.AppSettings
import com.audiostudio.app.data.TaskKind
import com.audiostudio.app.data.TaskRecord
import com.audiostudio.app.data.TaskRepository
import com.audiostudio.app.data.TaskStatus
import com.audiostudio.app.data.SettingsStore
import com.audiostudio.app.data.encodeParams
import com.audiostudio.app.service.ConvertService
import com.audiostudio.app.util.MediaStoreWriter
import com.audiostudio.app.util.SafUtils
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * 任务队列与状态机：
 * queued → preparing → running ⇄ paused → completed / failed / cancelled
 *
 * - 并发数来自设置（默认 2）
 * - 进度 = FFmpegKit 统计回调 statistics.time ÷ 探测时长（真实 ratio）
 * - 暂停：本 fork 无 suspendAsync/resumeAsync，采用「中止会话 + 记录偏移 +
 *   重新排队并注入输出侧 -ss 续跑」实现（状态机与交互与规格一致）
 * - 取消：session.cancel()
 */
class ConvertManager(
    private val appContext: Context,
    private val repo: TaskRepository,
    private val settingsStore: SettingsStore,
    val engine: FfmpegEngine,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var workerJob: Job? = null
    private val runningIds = ConcurrentHashMap.newKeySet<String>()
    private val runningSessions = ConcurrentHashMap<String, RunningSession>()

    // ---------- 入队 ----------

    /** 批量转换入队 */
    fun enqueueConvert(
        sources: List<Pair<String, String>>, // uri to displayName
        params: EncodeParams,
        probes: Map<String, ProbeResult> = emptyMap(),
    ): List<String> {
        val now = System.currentTimeMillis()
        val records = sources.mapIndexed { i, (uri, name) ->
            val probe = probes[uri]
            TaskRecord(
                id = UUID.randomUUID().toString(),
                kind = TaskKind.CONVERT,
                status = TaskStatus.QUEUED,
                createdAt = now + i,
                updatedAt = now,
                index = i + 1,
                sourceUri = uri,
                sourceName = name,
                sourceSize = probe?.fileSizeBytes ?: 0L,
                durationMs = probe?.durationMs,
                codec = probe?.codec,
                sampleRate = probe?.sampleRate,
                channels = probe?.channels,
                bitrateKbps = probe?.bitrateKbps,
                targetFormat = params.format,
                paramsJson = encodeParams(params),
            )
        }
        enqueueAll(records)
        return records.map { it.id }
    }

    /** 剪辑入队 */
    fun enqueueTrim(
        uri: String,
        name: String,
        startMs: Long,
        endMs: Long,
        params: EncodeParams,
        probe: ProbeResult?,
    ): String {
        val now = System.currentTimeMillis()
        val record = TaskRecord(
            id = UUID.randomUUID().toString(),
            kind = TaskKind.TRIM,
            status = TaskStatus.QUEUED,
            createdAt = now,
            updatedAt = now,
            index = 1,
            sourceUri = uri,
            sourceName = name,
            sourceSize = probe?.fileSizeBytes ?: 0L,
            durationMs = probe?.durationMs,
            codec = probe?.codec,
            sampleRate = probe?.sampleRate,
            channels = probe?.channels,
            bitrateKbps = probe?.bitrateKbps,
            targetFormat = params.format,
            paramsJson = encodeParams(params),
            startMs = startMs,
            endMs = endMs,
        )
        enqueueAll(listOf(record))
        return record.id
    }

    /** 合并入队 */
    fun enqueueMerge(
        sources: List<Pair<String, String>>,
        gapMs: Int,
        params: EncodeParams,
        probes: Map<String, ProbeResult> = emptyMap(),
    ): String {
        val now = System.currentTimeMillis()
        val first = sources.firstOrNull()
        val totalMs = sources.mapNotNull { (uri, _) -> probes[uri]?.durationMs }
            .takeIf { it.size == sources.size }
            ?.sum()
            ?.let { it + gapMs.toLong() * (sources.size - 1) }
        val firstProbe = first?.let { probes[it.first] }
        val record = TaskRecord(
            id = UUID.randomUUID().toString(),
            kind = TaskKind.MERGE,
            status = TaskStatus.QUEUED,
            createdAt = now,
            updatedAt = now,
            index = 1,
            sourceUri = first?.first,
            sourceName = first?.second ?: "merged",
            sourceSize = sources.sumOf { probes[it.first]?.fileSizeBytes ?: 0L },
            durationMs = totalMs,
            codec = firstProbe?.codec,
            sampleRate = firstProbe?.sampleRate,
            channels = firstProbe?.channels,
            bitrateKbps = firstProbe?.bitrateKbps,
            targetFormat = params.format,
            paramsJson = encodeParams(params),
            mergeUris = sources.map { it.first },
            mergeNames = sources.map { it.second },
            gapMs = gapMs,
        )
        enqueueAll(listOf(record))
        return record.id
    }

    /** 重新执行历史任务（新建记录） */
    fun retry(task: TaskRecord): String? {
        if (task.sourceUri == null && task.sourcePath == null) return null
        val now = System.currentTimeMillis()
        val newTask = task.copy(
            id = UUID.randomUUID().toString(),
            status = TaskStatus.QUEUED,
            createdAt = now,
            updatedAt = now,
            finishedAt = null,
            progress = 0f,
            processedMs = 0,
            resumeOffsetMs = 0,
            speed = null,
            outputUri = null,
            outputPath = null,
            outputName = null,
            outputSize = null,
            errorCode = null,
            errorMessage = null,
            errorDetail = null,
            sourcePath = null, // 重新物化
        )
        enqueueAll(listOf(newTask))
        return newTask.id
    }

    private fun enqueueAll(records: List<TaskRecord>) {
        scope.launch {
            repo.load()
            repo.upsertAll(records)
            ensureWorkers()
            startService()
        }
    }

    // ---------- 服务 ----------

    fun startService() {
        try {
            val intent = Intent(appContext, ConvertService::class.java)
            appContext.startForegroundService(intent)
        } catch (t: Throwable) {
            try {
                appContext.startService(Intent(appContext, ConvertService::class.java))
            } catch (_: Throwable) {
            }
        }
    }

    fun stopServiceIfIdle() {
        if (repo.activeCount() == 0) {
            try {
                appContext.stopService(Intent(appContext, ConvertService::class.java))
            } catch (_: Throwable) {
            }
        }
    }

    // ---------- 工作协程 ----------

    fun ensureWorkers() {
        if (workerJob?.isActive == true) return
        workerJob = scope.launch {
            while (isActive) {
                try {
                    val conc = settingsStore.current().concurrency
                    while (runningIds.size < conc) {
                        val next = repo.nextQueued() ?: break
                        if (!runningIds.add(next.id)) break
                        val id = next.id
                        launch { runTask(id) }
                    }
                } catch (t: Throwable) {
                    // 保持存活
                }
                delay(300)
            }
        }
    }

    private fun sourcesDir(taskId: String): File =
        File(appContext.cacheDir, "sources/$taskId").apply { mkdirs() }

    private fun outputsDir(taskId: String): File =
        File(appContext.cacheDir, "outputs/$taskId").apply { mkdirs() }

    /** 中止检查：用户取消或暂停都应停止当前执行 */
    private fun abortState(taskId: String): TaskStatus? {
        val s = repo.get(taskId)?.status
        return if (s == TaskStatus.CANCELLED || s == TaskStatus.PAUSED) s else null
    }

    private suspend fun runTask(taskId: String) {
        try {
            val initial = repo.get(taskId) ?: return
            if (initial.status != TaskStatus.QUEUED) return
            repo.mutate(taskId) { it.copy(status = TaskStatus.PREPARING, updatedAt = now()) }

            val settings = settingsStore.current()
            var task = repo.get(taskId) ?: return

            // ---- 1. 物化源文件（复制到 cache，失败不破坏源） ----
            val inputPaths = try {
                materializeSources(task)
            } catch (t: Throwable) {
                fail(taskId, t)
                return
            }
            abortState(taskId)?.let { st ->
                if (st == TaskStatus.CANCELLED) finishCancelled(taskId)
                return
            }

            // ---- 2. 探测真实信息 ----
            if (task.durationMs == null || task.kind == TaskKind.MERGE) {
                try {
                    val probes = inputPaths.map { engine.probe(it) }
                    val first = probes.firstOrNull()
                    val totalMs = when (task.kind) {
                        TaskKind.MERGE -> probes.mapNotNull { it.durationMs }
                            .takeIf { it.size == probes.size }
                            ?.let { it.sum() + task.gapMs.toLong() * (inputPaths.size - 1) }
                            ?: probes.firstOrNull()?.durationMs
                        TaskKind.TRIM -> (task.endMs ?: 0L) - (task.startMs ?: 0L)
                        TaskKind.CONVERT -> first?.durationMs
                    }
                    repo.mutate(taskId) {
                        it.copy(
                            durationMs = totalMs ?: it.durationMs,
                            codec = first?.codec ?: it.codec,
                            sampleRate = first?.sampleRate ?: it.sampleRate,
                            channels = first?.channels ?: it.channels,
                            bitrateKbps = first?.bitrateKbps ?: it.bitrateKbps,
                            sourceSize = if (it.sourceSize <= 0) first?.fileSizeBytes ?: 0 else it.sourceSize,
                            updatedAt = now(),
                        )
                    }
                    task = repo.get(taskId) ?: return
                } catch (t: Throwable) {
                    fail(taskId, t)
                    return
                }
            }
            abortState(taskId)?.let { st ->
                if (st == TaskStatus.CANCELLED) finishCancelled(taskId)
                return
            }

            // ---- 3. 资源预检（低内存保护） ----
            val memError = memoryCheck(task)
            if (memError != null) {
                repo.mutate(taskId) {
                    it.copy(
                        status = TaskStatus.FAILED,
                        updatedAt = now(),
                        finishedAt = now(),
                        errorCode = memError.code.name,
                        errorMessage = memError.message,
                        errorDetail = memError.detail,
                    )
                }
                return
            }

            // ---- 4. 构建参数 + 输出名 ----
            val params = task.params
            val paramErrors = validateParams(params)
            if (paramErrors.isNotEmpty()) {
                repo.mutate(taskId) {
                    it.copy(
                        status = TaskStatus.FAILED,
                        updatedAt = now(),
                        finishedAt = now(),
                        errorCode = EngineErrorCode.E_INVALID_PARAM.name,
                        errorMessage = paramErrors.first(),
                    )
                }
                return
            }

            val format = Formats.get(params.format) ?: run {
                fail(taskId, IllegalStateException("未知目标格式"))
                return
            }
            if (!engine.canEncode(format.id)) {
                repo.mutate(taskId) {
                    it.copy(
                        status = TaskStatus.FAILED,
                        updatedAt = now(),
                        finishedAt = now(),
                        errorCode = EngineErrorCode.E_ENCODER_UNAVAILABLE.name,
                        errorMessage = EngineErrorCode.E_ENCODER_UNAVAILABLE.zhMessage,
                    )
                }
                return
            }

            val outDir = outputsDir(taskId)
            val outName = buildOutputFileName(
                params.filenameTemplate,
                NamingContext(
                    sourceName = stemOf(task.sourceName),
                    sourceFormat = task.codec ?: Formats.fromExtension(task.sourceName)?.id,
                    format = format,
                    index = task.index,
                    tags = emptyMap(),
                ),
            )
            if (!isOutputNameSafe(outName)) {
                repo.mutate(taskId) {
                    it.copy(
                        status = TaskStatus.FAILED,
                        updatedAt = now(),
                        finishedAt = now(),
                        errorCode = EngineErrorCode.E_PATH_UNSAFE.name,
                        errorMessage = EngineErrorCode.E_PATH_UNSAFE.zhMessage,
                    )
                }
                return
            }

            val offset = task.resumeOffsetMs
            val ctx = BuildContext(
                durationMs = task.totalMs(),
                resolvedSampleRate = task.sampleRate,
                resolvedChannels = task.channels,
            )
            val args = try {
                when (task.kind) {
                    TaskKind.CONVERT -> withOutputSeek(
                        buildConvertArgs(inputPaths.first(), params, outDir.absolutePath, outName, ctx),
                        offset,
                    )
                    TaskKind.TRIM -> {
                        val start = (task.startMs ?: 0) + offset
                        val end = task.endMs ?: (task.durationMs ?: 0)
                        if (end <= start) {
                            // 偏移已覆盖整个区间 → 视为完成
                            repo.mutate(taskId) {
                                it.copy(
                                    status = TaskStatus.COMPLETED,
                                    updatedAt = now(),
                                    finishedAt = now(),
                                    progress = 1f,
                                    resumeOffsetMs = 0,
                                )
                            }
                            return
                        }
                        buildTrimArgs(inputPaths.first(), start, end, params, outDir.absolutePath, outName, ctx)
                    }
                    TaskKind.MERGE -> withOutputSeek(
                        buildMergeArgs(
                            inputPaths.map { MergeItemArgs(it) },
                            task.gapMs,
                            params,
                            outDir.absolutePath,
                            outName,
                            ctx,
                        ),
                        offset,
                    )
                }
            } catch (t: Throwable) {
                repo.mutate(taskId) {
                    it.copy(
                        status = TaskStatus.FAILED,
                        updatedAt = now(),
                        finishedAt = now(),
                        errorCode = EngineErrorCode.E_INVALID_PARAM.name,
                        errorMessage = t.message ?: EngineErrorCode.E_INVALID_PARAM.zhMessage,
                        errorDetail = t.toString(),
                    )
                }
                return
            }

            // ---- 5. 运行 ----
            abortState(taskId)?.let { st ->
                if (st == TaskStatus.CANCELLED) finishCancelled(taskId)
                return
            }
            repo.mutate(taskId) { it.copy(status = TaskStatus.RUNNING, updatedAt = now()) }

            val total = task.totalMs() ?: 0L
            val baseOffset = offset.toDouble()
            val outcome = engine.run(
                taskId = taskId,
                args = args,
                onSession = { s -> runningSessions[taskId] = s },
                onProgress = { processedInRun, speed ->
                    val processed = baseOffset + processedInRun
                    val ratio = if (total > 0) (processed / total).toFloat().coerceIn(0f, 1f) else 0f
                    repo.updateProgress(taskId, ratio, processed.toLong(), speed)
                },
            )
            runningSessions.remove(taskId)

            // ---- 6. 结果处理 ----
            val currentStatus = repo.get(taskId)?.status
            when {
                // 暂停引发的中止：保持 PAUSED（偏移已由 processedMs 记录）
                currentStatus == TaskStatus.PAUSED -> Unit
                outcome.cancelled || currentStatus == TaskStatus.CANCELLED -> finishCancelled(taskId)
                outcome.returnCode != 0 -> {
                    val code = classifyEngineOutput(outcome.output + "\n" + (outcome.failStackTrace ?: ""))
                    repo.mutate(taskId) {
                        it.copy(
                            status = TaskStatus.FAILED,
                            updatedAt = now(),
                            finishedAt = now(),
                            errorCode = code.name,
                            errorMessage = code.zhMessage,
                            errorDetail = tailOf(outcome.output, 800),
                        )
                    }
                }
                else -> {
                    val outFile = File(outDir, outName)
                    if (!outFile.exists() || outFile.length() == 0L) {
                        repo.mutate(taskId) {
                            it.copy(
                                status = TaskStatus.FAILED,
                                updatedAt = now(),
                                finishedAt = now(),
                                errorCode = EngineErrorCode.E_UNKNOWN.name,
                                errorMessage = "转换完成但未产生输出文件",
                                errorDetail = tailOf(outcome.output, 800),
                            )
                        }
                    } else {
                        publish(taskId, outFile, outName, settings)
                    }
                }
            }
        } catch (t: Throwable) {
            fail(taskId, t)
        } finally {
            runningIds.remove(taskId)
            runningSessions.remove(taskId)
        }
    }

    /** 续跑：在输出文件名之前注入输出侧 -ss（采样级准确，与共享层输出侧 seek 语义一致） */
    private fun withOutputSeek(args: List<String>, offsetMs: Long): List<String> {
        if (offsetMs <= 0) return args
        val seek = listOf(
            "-ss",
            String.format(java.util.Locale.US, "%.3f", offsetMs / 1000.0),
        )
        val out = args.toMutableList()
        out.addAll(out.size - 1, seek)
        return out
    }

    private suspend fun publish(taskId: String, outFile: File, outName: String, settings: AppSettings) {
        val sizeBeforeDelete = outFile.length()
        try {
            val uri = MediaStoreWriter.publish(appContext, outFile, outName, settings.outputMode, settings.outputTreeUri)
            val displayPath = if (settings.outputMode == "tree" && settings.outputTreeUri.isNotEmpty()) {
                "选定目录/$outName"
            } else {
                "Download/AudioStudio/$outName"
            }
            runCatching { outFile.delete() }
            repo.mutate(taskId) {
                it.copy(
                    status = TaskStatus.COMPLETED,
                    updatedAt = now(),
                    finishedAt = now(),
                    progress = 1f,
                    resumeOffsetMs = 0,
                    outputUri = uri.toString(),
                    outputPath = displayPath,
                    outputName = outName,
                    outputSize = sizeBeforeDelete.takeIf { l -> l > 0 } ?: it.outputSize,
                )
            }
        } catch (t: Throwable) {
            val code = classifyEngineOutput(t.message ?: "")
            repo.mutate(taskId) {
                it.copy(
                    status = TaskStatus.FAILED,
                    updatedAt = now(),
                    finishedAt = now(),
                    errorCode = if (code == EngineErrorCode.E_UNKNOWN) EngineErrorCode.E_DISK_FULL.name else code.name,
                    errorMessage = t.message ?: code.zhMessage,
                    errorDetail = "输出文件保留在应用缓存: ${outFile.absolutePath}",
                )
            }
        }
    }

    private suspend fun materializeSources(task: TaskRecord): List<String> {
        when (task.kind) {
            TaskKind.MERGE -> {
                val dir = sourcesDir(task.id)
                val paths = mutableListOf<String>()
                task.mergeUris.forEachIndexed { i, uriString ->
                    val name = sanitizeFileName(task.mergeNames.getOrElse(i) { "input_$i" })
                    val dest = File(dir, "${i}_$name")
                    if (!dest.exists() || dest.length() == 0L) {
                        checkDiskSpace(task)
                        SafUtils.copyTo(appContext, android.net.Uri.parse(uriString), dest)
                    }
                    paths.add(dest.absolutePath)
                }
                if (paths.isEmpty()) throw IllegalStateException("合并至少需要一个输入")
                return paths
            }
            else -> {
                val uriString = task.sourceUri
                val existing = task.sourcePath?.let { File(it) }
                if (existing != null && existing.exists() && existing.length() > 0) {
                    return listOf(existing.absolutePath)
                }
                if (uriString == null) {
                    val p = task.sourcePath
                    if (p != null && File(p).exists()) return listOf(p)
                    throw IllegalStateException("找不到源文件")
                }
                val dir = sourcesDir(task.id)
                val dest = File(dir, sanitizeFileName(task.sourceName).ifEmpty { "input" })
                if (!dest.exists() || dest.length() == 0L) {
                    checkDiskSpace(task)
                    SafUtils.copyTo(appContext, android.net.Uri.parse(uriString), dest)
                }
                repo.mutate(task.id) {
                    it.copy(sourcePath = dest.absolutePath, sourceSize = dest.length())
                }
                return listOf(dest.absolutePath)
            }
        }
    }

    private fun checkDiskSpace(task: TaskRecord) {
        val need = (task.sourceSize * 2).coerceAtLeast(64L * 1024 * 1024)
        val free = appContext.cacheDir.usableSpace
        if (free in 1 until need) {
            throw DiskSpaceException()
        }
    }

    private class DiskSpaceException : Exception(EngineErrorCode.E_NO_SPACE_CHECK.zhMessage)

    private data class MemError(val code: EngineErrorCode, val message: String, val detail: String?)

    private fun memoryCheck(task: TaskRecord): MemError? {
        val rt = Runtime.getRuntime()
        val used = rt.totalMemory() - rt.freeMemory()
        val free = rt.maxMemory() - used
        if (task.sourceSize > LARGE_FILE_WARN_BYTES && task.sourceSize > free) {
            return MemError(
                EngineErrorCode.E_OUT_OF_MEMORY,
                "文件 ${formatSize(task.sourceSize)} 较大，当前可用内存不足（${formatSize(free)}），请先释放内存后重试",
                "source=${task.sourceSize}, freeHeap=$free, max=${rt.maxMemory()}",
            )
        }
        return null
    }

    private suspend fun fail(taskId: String, t: Throwable) {
        // 若已被取消/暂停，不覆盖状态
        val st = repo.get(taskId)?.status
        if (st == TaskStatus.CANCELLED || st == TaskStatus.PAUSED || st == TaskStatus.COMPLETED) return
        val code = when (t) {
            is DiskSpaceException -> EngineErrorCode.E_NO_SPACE_CHECK
            is SecurityException -> EngineErrorCode.E_PERMISSION
            is java.io.FileNotFoundException -> EngineErrorCode.E_SOURCE_MISSING
            is IllegalStateException -> {
                if ((t.message ?: "").contains("找不到")) EngineErrorCode.E_SOURCE_MISSING else EngineErrorCode.E_UNKNOWN
            }
            else -> classifyEngineOutput(t.message ?: "")
        }
        repo.mutate(taskId) {
            it.copy(
                status = TaskStatus.FAILED,
                updatedAt = now(),
                finishedAt = now(),
                errorCode = code.name,
                errorMessage = t.message?.takeIf { m -> m.isNotBlank() && !m.startsWith("java.") } ?: code.zhMessage,
                errorDetail = t.toString(),
            )
        }
    }

    private suspend fun finishCancelled(taskId: String) {
        repo.mutate(taskId) {
            if (it.status.isTerminal && it.status != TaskStatus.PAUSED) it else it.copy(
                status = TaskStatus.CANCELLED,
                updatedAt = now(),
                finishedAt = now(),
                errorMessage = EngineErrorCode.E_CANCELLED.zhMessage,
                errorCode = EngineErrorCode.E_CANCELLED.name,
            )
        }
    }

    // ---------- 控制 ----------

    /** 暂停：先置 PAUSED（保证结果回调不误判为取消），再中止会话 */
    fun pause(taskId: String) {
        scope.launch {
            val task = repo.get(taskId) ?: return@launch
            when (task.status) {
                TaskStatus.RUNNING -> {
                    repo.mutate(taskId) { it.copy(status = TaskStatus.PAUSED, updatedAt = now()) }
                    runningSessions[taskId]?.abortForPause()
                }
                TaskStatus.PREPARING, TaskStatus.QUEUED -> {
                    repo.mutate(taskId) { it.copy(status = TaskStatus.PAUSED, updatedAt = now()) }
                }
                else -> Unit
            }
        }
    }

    /** 继续：重新排队，带 processedMs 作为续跑偏移 */
    fun resume(taskId: String) {
        scope.launch {
            val task = repo.get(taskId) ?: return@launch
            if (task.status != TaskStatus.PAUSED) return@launch
            repo.mutate(taskId) {
                it.copy(
                    status = TaskStatus.QUEUED,
                    resumeOffsetMs = it.processedMs,
                    updatedAt = now(),
                )
            }
            ensureWorkers()
            startService()
        }
    }

    fun cancel(taskId: String) {
        scope.launch {
            val task = repo.get(taskId) ?: return@launch
            when (task.status) {
                TaskStatus.QUEUED, TaskStatus.PREPARING, TaskStatus.PAUSED -> {
                    engine.markCancelled(taskId)
                    finishCancelled(taskId)
                }
                TaskStatus.RUNNING -> {
                    // 先置终态，再中止会话，避免与结果回调竞态
                    finishCancelled(taskId)
                    runningSessions[taskId]?.cancel()
                }
                else -> Unit
            }
        }
    }

    fun cancelAllActive() {
        val active = repo.tasks.value.filter { it.status.isActive }
        active.forEach { cancel(it.id) }
    }

    fun deleteTask(taskId: String) {
        scope.launch {
            cancel(taskId)
            val task = repo.get(taskId)
            runCatching { sourcesDir(taskId).deleteRecursively() }
            runCatching { outputsDir(taskId).deleteRecursively() }
            // 清理导入缓存
            task?.sourcePath?.let { p ->
                if (p.contains(File.separator + "imports" + File.separator)) {
                    runCatching { File(p).parentFile?.deleteRecursively() }
                }
            }
            repo.delete(taskId)
            stopServiceIfIdle()
        }
    }

    companion object {
        fun now() = System.currentTimeMillis()

        fun stemOf(name: String): String =
            if (name.contains('.')) name.substringBeforeLast('.') else name

        fun formatSize(bytes: Long): String = when {
            bytes >= 1024L * 1024 * 1024 -> String.format(java.util.Locale.US, "%.2f GB", bytes / 1024.0 / 1024 / 1024)
            bytes >= 1024L * 1024 -> String.format(java.util.Locale.US, "%.1f MB", bytes / 1024.0 / 1024)
            bytes >= 1024 -> String.format(java.util.Locale.US, "%.1f KB", bytes / 1024.0)
            else -> "$bytes B"
        }

        fun tailOf(s: String, n: Int): String = if (s.length <= n) s else "…" + s.takeLast(n)
    }
}
