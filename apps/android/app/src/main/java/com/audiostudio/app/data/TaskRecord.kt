package com.audiostudio.app.data

import androidx.annotation.StringRes
import com.audiostudio.app.R
import com.audiostudio.app.engine.EncodeParams
import com.audiostudio.app.engine.Formats
import org.json.JSONArray
import org.json.JSONObject

enum class TaskKind { CONVERT, TRIM, MERGE }

enum class TaskStatus(@StringRes val labelRes: Int) {
    QUEUED(R.string.status_queued),
    PREPARING(R.string.status_preparing),
    RUNNING(R.string.status_running),
    PAUSED(R.string.status_paused),
    COMPLETED(R.string.status_completed),
    FAILED(R.string.status_failed),
    CANCELLED(R.string.status_cancelled),
    ;

    val isActive: Boolean
        get() = this == QUEUED || this == PREPARING || this == RUNNING || this == PAUSED

    val isTerminal: Boolean
        get() = this == COMPLETED || this == FAILED || this == CANCELLED
}

/** 任务记录（持久化到 DataStore，进程被杀后可恢复展示） */
data class TaskRecord(
    val id: String,
    val kind: TaskKind,
    val status: TaskStatus,
    val createdAt: Long,
    val updatedAt: Long,
    val finishedAt: Long? = null,
    /** 批量序号（文件名模板 {index}） */
    val index: Int = 1,
    // ---- 源 ----
    /** SAF 原始 uri（重试用，已取持久化权限） */
    val sourceUri: String? = null,
    val sourceName: String,
    /** 已复制到 cache 的真实路径（执行用） */
    val sourcePath: String? = null,
    val sourceSize: Long = 0,
    // ---- 探测信息（真实 ffprobe 结果） ----
    val durationMs: Long? = null,
    val codec: String? = null,
    val sampleRate: Int? = null,
    val channels: Int? = null,
    val bitrateKbps: Int? = null,
    // ---- 作业参数 ----
    val targetFormat: String,
    val paramsJson: String,
    val startMs: Long? = null,
    val endMs: Long? = null,
    val mergeUris: List<String> = emptyList(),
    val mergeNames: List<String> = emptyList(),
    val gapMs: Int = 0,
    // ---- 进度（内存态，不逐帧持久化） ----
    val progress: Float = 0f,
    val processedMs: Long = 0,
    val speed: Double? = null,
    /** 暂停后续跑的输出侧偏移（毫秒） */
    val resumeOffsetMs: Long = 0,
    // ---- 结果 ----
    val outputUri: String? = null,
    val outputPath: String? = null,
    val outputName: String? = null,
    val outputSize: Long? = null,
    val errorCode: String? = null,
    val errorMessage: String? = null,
    val errorDetail: String? = null,
) {
    val params: EncodeParams get() = decodeParams(paramsJson)

    /** 进度分母：转换=源时长，裁剪=区间长度，合并=各段之和+间隔 */
    fun totalMs(): Long? = when (kind) {
        TaskKind.TRIM -> {
            val s = startMs ?: 0
            val e = endMs
            if (e != null && e > s) e - s else durationMs
        }
        TaskKind.MERGE -> {
            // 合并总时长在入队时估算（各段时长之和 + 间隔）
            durationMs
        }
        TaskKind.CONVERT -> durationMs
    }

    @StringRes
    fun kindLabelRes(): Int = when (kind) {
        TaskKind.CONVERT -> R.string.task_kind_convert
        TaskKind.TRIM -> R.string.task_kind_trim
        TaskKind.MERGE -> R.string.task_kind_merge
    }

    fun outputDisplayPath(): String? = outputPath ?: outputUri

    companion object {
        fun decodeParams(json: String): EncodeParams = try {
            val o = JSONObject(json)
            EncodeParams(
                format = o.optString("format", "mp3"),
                bitrateKbps = o.optInt("bitrateKbps", -1).takeIf { it > 0 },
                vbrQuality = o.optDouble("vbrQuality", Double.NaN).takeIf { !it.isNaN() },
                useVbr = o.optBoolean("useVbr", false),
                sampleRate = o.optInt("sampleRate", 0),
                channels = o.optInt("channels", 0),
                bitDepth = when {
                    o.has("bitDepth") && !o.isNull("bitDepth") -> {
                        val bd = o.opt("bitDepth")
                        if (bd is Int) bd else bd.toString()
                    }
                    else -> null
                },
                encoder = o.optString("encoder", "").ifEmpty { null },
                compressionLevelId = o.optString("compressionLevelId", "").ifEmpty { null },
                gainDb = o.optDouble("gainDb", 0.0),
                fadeInMs = o.optInt("fadeInMs", 0),
                fadeOutMs = o.optInt("fadeOutMs", 0),
                filenameTemplate = o.optString("filenameTemplate", "{name}_{format}"),
            )
        } catch (t: Throwable) {
            EncodeParams(format = "mp3")
        }
    }
}

fun encodeParams(p: EncodeParams): String = JSONObject().apply {
    put("format", p.format)
    p.bitrateKbps?.let { put("bitrateKbps", it) }
    p.vbrQuality?.let { put("vbrQuality", it) }
    put("useVbr", p.useVbr)
    put("sampleRate", p.sampleRate)
    put("channels", p.channels)
    p.bitDepth?.let { put("bitDepth", it.toString()) }
    p.encoder?.let { put("encoder", it) }
    p.compressionLevelId?.let { put("compressionLevelId", it) }
    put("gainDb", p.gainDb)
    put("fadeInMs", p.fadeInMs)
    put("fadeOutMs", p.fadeOutMs)
    put("filenameTemplate", p.filenameTemplate)
}.toString()

fun taskToJson(t: TaskRecord): String = JSONObject().apply {
    put("id", t.id)
    put("kind", t.kind.name)
    put("status", t.status.name)
    put("createdAt", t.createdAt)
    put("updatedAt", t.updatedAt)
    t.finishedAt?.let { put("finishedAt", it) }
    put("index", t.index)
    t.sourceUri?.let { put("sourceUri", it) }
    put("sourceName", t.sourceName)
    t.sourcePath?.let { put("sourcePath", it) }
    put("sourceSize", t.sourceSize)
    t.durationMs?.let { put("durationMs", it) }
    t.codec?.let { put("codec", it) }
    t.sampleRate?.let { put("sampleRate", it) }
    t.channels?.let { put("channels", it) }
    t.bitrateKbps?.let { put("bitrateKbps", it) }
    put("targetFormat", t.targetFormat)
    put("paramsJson", t.paramsJson)
    t.startMs?.let { put("startMs", it) }
    t.endMs?.let { put("endMs", it) }
    if (t.mergeUris.isNotEmpty()) put("mergeUris", JSONArray(t.mergeUris))
    if (t.mergeNames.isNotEmpty()) put("mergeNames", JSONArray(t.mergeNames))
    put("gapMs", t.gapMs)
    put("progress", t.progress.toDouble())
    put("processedMs", t.processedMs)
    put("resumeOffsetMs", t.resumeOffsetMs)
    t.speed?.let { put("speed", it) }
    t.outputUri?.let { put("outputUri", it) }
    t.outputPath?.let { put("outputPath", it) }
    t.outputName?.let { put("outputName", it) }
    t.outputSize?.let { put("outputSize", it) }
    t.errorCode?.let { put("errorCode", it) }
    t.errorMessage?.let { put("errorMessage", it) }
    t.errorDetail?.let { put("errorDetail", it) }
}.toString()

fun taskFromJson(s: String): TaskRecord? = try {
    val o = JSONObject(s)
    fun strList(key: String): List<String> {
        val arr = o.optJSONArray(key) ?: return emptyList()
        return (0 until arr.length()).map { arr.getString(it) }
    }
    TaskRecord(
        id = o.getString("id"),
        kind = TaskKind.valueOf(o.getString("kind")),
        status = TaskStatus.valueOf(o.getString("status")),
        createdAt = o.getLong("createdAt"),
        updatedAt = o.getLong("updatedAt"),
        finishedAt = o.optLong("finishedAt", -1).takeIf { it > 0 },
        index = o.optInt("index", 1),
        sourceUri = o.optString("sourceUri", "").ifEmpty { null },
        sourceName = o.getString("sourceName"),
        sourcePath = o.optString("sourcePath", "").ifEmpty { null },
        sourceSize = o.optLong("sourceSize", 0),
        durationMs = o.optLong("durationMs", -1).takeIf { it >= 0 },
        codec = o.optString("codec", "").ifEmpty { null },
        sampleRate = o.optInt("sampleRate", -1).takeIf { it > 0 },
        channels = o.optInt("channels", -1).takeIf { it > 0 },
        bitrateKbps = o.optInt("bitrateKbps", -1).takeIf { it > 0 },
        targetFormat = o.getString("targetFormat"),
        paramsJson = o.getString("paramsJson"),
        startMs = o.optLong("startMs", -1).takeIf { it >= 0 },
        endMs = o.optLong("endMs", -1).takeIf { it >= 0 },
        mergeUris = strList("mergeUris"),
        mergeNames = strList("mergeNames"),
        gapMs = o.optInt("gapMs", 0),
        progress = o.optDouble("progress", 0.0).toFloat(),
        processedMs = o.optLong("processedMs", 0),
        resumeOffsetMs = o.optLong("resumeOffsetMs", 0),
        speed = o.optDouble("speed", Double.NaN).takeIf { !it.isNaN() },
        outputUri = o.optString("outputUri", "").ifEmpty { null },
        outputPath = o.optString("outputPath", "").ifEmpty { null },
        outputName = o.optString("outputName", "").ifEmpty { null },
        outputSize = o.optLong("outputSize", -1).takeIf { it >= 0 },
        errorCode = o.optString("errorCode", "").ifEmpty { null },
        errorMessage = o.optString("errorMessage", "").ifEmpty { null },
        errorDetail = o.optString("errorDetail", "").ifEmpty { null },
    )
} catch (t: Throwable) {
    null
}

fun tasksToJson(list: List<TaskRecord>): String =
    JSONArray(list.map { JSONObject(taskToJson(it)) }).toString()

fun tasksFromJson(s: String): List<TaskRecord> = try {
    val arr = JSONArray(s)
    (0 until arr.length()).mapNotNull { taskFromJson(arr.getString(it)) }
} catch (t: Throwable) {
    emptyList()
}

/** 供展示：目标格式标签 */
fun targetFormatLabel(task: TaskRecord): String =
    Formats.get(task.targetFormat)?.label ?: task.targetFormat.uppercase()
