package com.audiostudio.app.engine

import androidx.annotation.StringRes
import com.audiostudio.app.R

/** 统一错误码与错误模型（与 packages/shared/src/errors.ts 一致） */

enum class EngineErrorCode(@StringRes val messageRes: Int, val retryable: Boolean) {
    E_ENGINE_INIT(R.string.error_engine_init, true),
    E_UNSUPPORTED_FORMAT(R.string.error_unsupported_format, false),
    E_CORRUPT_FILE(R.string.error_corrupt_file, false),
    E_ENCODER_UNAVAILABLE(R.string.error_encoder_unavailable, false),
    E_DECODER_UNAVAILABLE(R.string.error_decoder_unavailable, false),
    E_PERMISSION(R.string.error_permission, false),
    E_DISK_FULL(R.string.error_disk_full, true),
    E_OUTPUT_EXISTS(R.string.error_output_exists, false),
    E_PATH_UNSAFE(R.string.error_path_unsafe, false),
    E_CANCELLED(R.string.error_cancelled, false),
    E_TIMEOUT(R.string.error_timeout, true),
    E_OUT_OF_MEMORY(R.string.error_out_of_memory, true),
    E_NO_SPACE_CHECK(R.string.error_no_space_check, false),
    E_INVALID_PARAM(R.string.error_invalid_param, false),
    E_SOURCE_MISSING(R.string.error_source_missing, false),
    E_UNKNOWN(R.string.error_unknown, true),
}

data class EngineError(
    val code: EngineErrorCode,
    @StringRes val messageRes: Int = code.messageRes,
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
