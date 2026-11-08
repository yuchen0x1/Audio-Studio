package com.audiostudio.app.engine

import org.json.JSONObject

/** 真实文件探测结果（禁止写死数据） */
data class ProbeResult(
    /** 容器格式（ffprobe format_name，如 "mp3" / "wav,pcm"） */
    val container: String,
    /** 第一条音频流编码，如 "mp3" / "pcm_s16le" */
    val codec: String? = null,
    val codecLongName: String? = null,
    val durationMs: Long? = null,
    val bitrateKbps: Int? = null,
    val sampleRate: Int? = null,
    val channels: Int? = null,
    val channelLayout: String? = null,
    val bitDepth: Int? = null,
    val fileSizeBytes: Long? = null,
    val tags: Map<String, String> = emptyMap(),
    val warnings: List<String> = emptyList(),
) {
    /** 展示用：格式（由容器推断的小写标识） */
    val containerFormat: String
        get() = container.substringBefore(',').trim().lowercase()
}

/**
 * 解析 `ffprobe -print_format json -show_format -show_streams` 的 stdout。
 * 容错：字段缺失不抛异常，缺什么少显示什么。
 */
fun parseProbeJson(json: String, fileSizeBytes: Long? = null): ProbeResult {
    val root = JSONObject(json)
    val format = root.optJSONObject("format") ?: JSONObject()
    val streams = root.optJSONArray("streams")

    var codec: String? = null
    var codecLong: String? = null
    var sampleRate: Int? = null
    var channels: Int? = null
    var layout: String? = null
    var bitDepth: Int? = null
    var audioDurationMs: Long? = null
    val warnings = mutableListOf<String>()

    if (streams != null) {
        for (i in 0 until streams.length()) {
            val s = streams.getJSONObject(i)
            if (s.optString("codec_type") == "audio") {
                codec = s.optString("codec_name").ifEmpty { null }
                codecLong = s.optString("codec_long_name").ifEmpty { null }
                sampleRate = s.optInt("sample_rate", 0).takeIf { it > 0 }
                channels = s.optInt("channels", 0).takeIf { it > 0 }
                layout = s.optString("channel_layout").ifEmpty { null }
                bitDepth = s.optInt("bits_per_raw_sample", 0).takeIf { it > 0 }
                    ?: s.optInt("bits_per_sample", 0).takeIf { it > 0 }
                audioDurationMs = parseDurationMs(s.optString("duration"))
                break
            }
        }
    }

    val tags = mutableMapOf<String, String>()
    val tagObj = format.optJSONObject("tags")
    if (tagObj != null) {
        for (key in tagObj.keys()) {
            tags[key.lowercase()] = tagObj.optString(key)
        }
    }

    val formatDurationMs = parseDurationMs(format.optString("duration"))
    val durationMs = formatDurationMs ?: audioDurationMs
    if (durationMs == null) warnings.add("无法获取时长信息")

    val bitrate = format.optLong("bit_rate", 0).takeIf { it > 0 }?.toInt()?.div(1000)
        ?: run {
            // 部分格式 format 无 bit_rate，尝试流级
            null
        }

    val size = format.optLong("size", 0).takeIf { it > 0 } ?: fileSizeBytes

    return ProbeResult(
        container = format.optString("format_name").ifEmpty { "unknown" },
        codec = codec,
        codecLongName = codecLong,
        durationMs = durationMs,
        bitrateKbps = bitrate,
        sampleRate = sampleRate,
        channels = channels,
        channelLayout = layout,
        bitDepth = bitDepth,
        fileSizeBytes = size,
        tags = tags,
        warnings = warnings,
    )
}

private fun parseDurationMs(s: String?): Long? {
    if (s.isNullOrBlank()) return null
    val d = s.toDoubleOrNull() ?: return null
    if (!d.isFinite() || d < 0) return null
    return (d * 1000).toLong()
}
