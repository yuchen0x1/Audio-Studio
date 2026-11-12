package com.audiostudio.app.engine

import com.audiostudio.app.R

/** 输出文件名模板系统（与 packages/shared/src/naming.ts 一致的 Kotlin 移植） */

data class NamingContext(
    /** 源文件名（不含扩展名） */
    val sourceName: String,
    /** 源格式（展示用小写） */
    val sourceFormat: String? = null,
    /** 目标格式 */
    val format: FormatDef,
    /** 任务序号（批量时从 1 开始） */
    val index: Int? = null,
    /** 元数据标签 */
    val tags: Map<String, String> = emptyMap(),
    /** 运行时刻（毫秒） */
    val nowMs: Long = System.currentTimeMillis(),
)

val NAMING_TOKENS: List<Pair<String, Int>> = listOf(
    "{name}" to R.string.naming_token_name,
    "{format}" to R.string.naming_token_format,
    "{source_format}" to R.string.naming_token_source_format,
    "{date}" to R.string.naming_token_date,
    "{time}" to R.string.naming_token_time,
    "{index}" to R.string.naming_token_index,
    "{artist}" to R.string.naming_token_artist,
    "{title}" to R.string.naming_token_title,
    "{album}" to R.string.naming_token_album,
)

private fun pad(n: Int, len: Int = 2): String = n.toString().padStart(len, '0')

fun applyTemplate(template: String, ctx: NamingContext): String {
    val cal = java.util.Calendar.getInstance().apply {
        timeInMillis = ctx.nowMs
    }
    val map = mapOf(
        "name" to ctx.sourceName,
        "format" to ctx.format.extensions.first().lowercase(),
        "source_format" to (ctx.sourceFormat?.lowercase() ?: ""),
        "date" to "${cal.get(java.util.Calendar.YEAR)}${pad(cal.get(java.util.Calendar.MONTH) + 1)}${pad(cal.get(java.util.Calendar.DAY_OF_MONTH))}",
        "time" to "${pad(cal.get(java.util.Calendar.HOUR_OF_DAY))}${pad(cal.get(java.util.Calendar.MINUTE))}${pad(cal.get(java.util.Calendar.SECOND))}",
        "index" to (ctx.index?.toString() ?: ""),
        "artist" to (ctx.tags["artist"] ?: ctx.tags["ARTIST"] ?: ""),
        "title" to (ctx.tags["title"] ?: ctx.tags["TITLE"] ?: ""),
        "album" to (ctx.tags["album"] ?: ctx.tags["ALBUM"] ?: ""),
    )
    var out = template.replace(Regex("\\{([a-z_]+)\\}", RegexOption.IGNORE_CASE)) { m ->
        val key = m.groupValues[1].lowercase()
        map[key] ?: m.value
    }
    out = out.replace(Regex(" {2,}"), " ")
        .replace(Regex("_{2,}"), "_")
        .replace(Regex("^[ _-]+"), "")
        .replace(Regex("[ _]+$"), "")
    return out
}

private val KNOWN_AUDIO_EXTS = setOf(
    "mp3", "wav", "wave", "flac", "aac", "m4a", "m4b", "mp4", "ogg", "oga",
    "opus", "wma", "aiff", "aif", "ape", "ac3", "amr", "alac", "au", "voc",
    "mid", "midi", "mka", "mpc", "spx", "tta", "wv", "dsf", "dff",
)

fun isKnownAudioExt(ext: String): Boolean =
    KNOWN_AUDIO_EXTS.contains(ext.removePrefix(".").lowercase())

/**
 * 生成最终输出文件名：
 * 1) 应用模板 2) 清洗非法字符 3) 扩展名由目标格式决定（所选即所得）
 */
fun buildOutputFileName(template: String, ctx: NamingContext): String {
    var base = applyTemplate(template, ctx)
    base = sanitizeFileName(base)
    if (base.isEmpty()) base = "output_${ctx.index ?: 1}"
    val ext = ctx.format.extensions.first().lowercase()

    val m = Regex("\\.([a-z0-9]+)$", RegexOption.IGNORE_CASE).find(base)
    if (m != null) {
        val givenExt = m.groupValues[1].lowercase()
        val knownAudio = isKnownAudioExt(givenExt)
        return when {
            ctx.format.extensions.contains(givenExt) -> base
            knownAudio -> "${base.substring(0, m.range.first)}.$ext"
            else -> "$base.$ext"
        }
    }
    return "$base.$ext"
}
