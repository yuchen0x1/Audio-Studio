package com.audiostudio.app.engine

/** 统一错误码与错误模型（与 packages/shared/src/errors.ts 一致） */

enum class EngineErrorCode(val zhMessage: String, val retryable: Boolean) {
    E_ENGINE_INIT("音频引擎初始化失败，请检查引擎组件是否完整", true),
    E_UNSUPPORTED_FORMAT("不支持的音频格式", false),
    E_CORRUPT_FILE("音频文件已损坏或不是有效的音频数据", false),
    E_ENCODER_UNAVAILABLE("目标编码器在当前引擎中不可用", false),
    E_DECODER_UNAVAILABLE("无法解码该音频（引擎缺少对应解码器）", false),
    E_PERMISSION("文件访问被拒绝，请检查权限", false),
    E_DISK_FULL("磁盘空间不足，请清理后重试", true),
    E_OUTPUT_EXISTS("输出文件已存在", false),
    E_PATH_UNSAFE("文件路径不安全或包含非法字符", false),
    E_CANCELLED("任务已取消", false),
    E_TIMEOUT("处理超时，任务已中断", true),
    E_OUT_OF_MEMORY("内存不足，请关闭其他页面或减小文件后重试", true),
    E_NO_SPACE_CHECK("目标磁盘剩余空间不足", false),
    E_INVALID_PARAM("编码参数无效", false),
    E_SOURCE_MISSING("找不到源文件", false),
    E_UNKNOWN("处理失败", true),
}

data class EngineError(
    val code: EngineErrorCode,
    val message: String = code.zhMessage,
    val detail: String? = null,
    val retryable: Boolean = code.retryable,
)

/** 把 FFmpeg stderr 映射为统一错误码 */
fun classifyEngineOutput(stderrText: String, fallback: EngineErrorCode = EngineErrorCode.E_UNKNOWN): EngineErrorCode {
    val t = stderrText.lowercase()
    val patterns = listOf(
        Regex("invalid data found when processing input|could not find codec parameters|error while decoding|moov atom not found|truncat.*file|failed to read frame size|header missing") to EngineErrorCode.E_CORRUPT_FILE,
        Regex("unknown encoder|encoder .* not found") to EngineErrorCode.E_ENCODER_UNAVAILABLE,
        Regex("unknown decoder|decoder .* not found|no decoder") to EngineErrorCode.E_DECODER_UNAVAILABLE,
        Regex("unsupported codec|not supported|requested output format.*not|unable to find a suitable output format") to EngineErrorCode.E_UNSUPPORTED_FORMAT,
        Regex("no space left|disk (full|quota)") to EngineErrorCode.E_DISK_FULL,
        Regex("permission denied|operation not permitted|eacces") to EngineErrorCode.E_PERMISSION,
        Regex("no such file or directory|enoent") to EngineErrorCode.E_SOURCE_MISSING,
        Regex("cannot allocate memory|out of memory|std::bad_alloc|memoryerror") to EngineErrorCode.E_OUT_OF_MEMORY,
        Regex("killed|sigkill") to EngineErrorCode.E_TIMEOUT,
        Regex("error opening input") to EngineErrorCode.E_CORRUPT_FILE,
    )
    for ((re, code) in patterns) {
        if (re.containsMatchIn(t)) return code
    }
    return fallback
}
