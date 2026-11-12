package com.audiostudio.app.engine

import androidx.annotation.StringRes
import com.audiostudio.app.R

/**
 * 音频格式注册表 —— 与 packages/shared/src/formats.ts 语义保持一致的 Kotlin 移植。
 * 界面只能展示运行时能力检测（ffmpeg -encoders）通过的格式。
 */

data class CompressionLevel(val id: String, @StringRes val labelRes: Int, val value: Int)

enum class FormatKind { LOSSY, LOSSLESS, COMPRESSIVE_LOSSLESS }

data class FormatDef(
    val id: String,
    val label: String,
    /** 主扩展名在前，其余为别名 */
    val extensions: List<String>,
    val mimeTypes: List<String>,
    val kind: FormatKind,
    val lossless: Boolean,
    /** FFmpeg 编码器候选，按优先级排列 */
    val encoderCandidates: List<String>,
    /** 显式 muxer（-f 参数）；空串表示按扩展名推断 */
    val muxer: String,
    val demuxer: String,
    val supportsBitrate: Boolean,
    val supportsBitDepth: Boolean,
    val supportsVbrQuality: Boolean,
    val vbrQualityRange: ClosedRange<Double>? = null,
    val bitDepths: List<Any>? = null,
    val sampleRates: List<Int>,
    val channels: List<Int>,
    val defaultBitrateKbps: Int? = null,
    val bitrateOptionsKbps: List<Int>? = null,
    val compressionLevels: List<CompressionLevel>? = null,
    val defaultCompressionLevelId: String? = null,
    @StringRes val noteRes: Int? = null,
)

private val STD_RATES_LOW = listOf(8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000)
private val STD_RATES_WIDE = listOf(
    8000, 11025, 16000, 22050, 24000, 32000, 44100, 48000,
    88200, 96000, 176400, 192000,
)
private val CH_STEREO = listOf(1, 2)

object Formats {
    val ALL: List<FormatDef> = listOf(
        FormatDef(
            id = "mp3", label = "MP3",
            extensions = listOf("mp3"), mimeTypes = listOf("audio/mpeg", "audio/mp3"),
            kind = FormatKind.LOSSY, lossless = false,
            encoderCandidates = listOf("libmp3lame"), muxer = "mp3", demuxer = "mp3",
            supportsBitrate = true, supportsBitDepth = false, supportsVbrQuality = true,
            vbrQualityRange = 0.0..9.0,
            sampleRates = listOf(8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000),
            channels = CH_STEREO,
            defaultBitrateKbps = 192,
            bitrateOptionsKbps = listOf(96, 112, 128, 160, 192, 224, 256, 320),
            noteRes = R.string.format_note_mp3,
        ),
        FormatDef(
            id = "wav", label = "WAV",
            extensions = listOf("wav"), mimeTypes = listOf("audio/wav", "audio/x-wav", "audio/wave"),
            kind = FormatKind.LOSSLESS, lossless = true,
            encoderCandidates = listOf("pcm_s16le", "pcm_s24le", "pcm_s32le", "pcm_f32le"),
            muxer = "wav", demuxer = "wav",
            supportsBitrate = false, supportsBitDepth = true, supportsVbrQuality = false,
            bitDepths = listOf(16, 24, 32, "f32"),
            sampleRates = STD_RATES_WIDE, channels = CH_STEREO,
            noteRes = R.string.format_note_wav,
        ),
        FormatDef(
            id = "flac", label = "FLAC",
            extensions = listOf("flac"), mimeTypes = listOf("audio/flac", "audio/x-flac"),
            kind = FormatKind.LOSSLESS, lossless = true,
            encoderCandidates = listOf("flac"), muxer = "flac", demuxer = "flac",
            supportsBitrate = false, supportsBitDepth = true, supportsVbrQuality = false,
            bitDepths = listOf(16, 24),
            sampleRates = STD_RATES_WIDE, channels = CH_STEREO,
            compressionLevels = listOf(
                CompressionLevel("fast", R.string.compression_fast, 0),
                CompressionLevel("default", R.string.compression_default, 5),
                CompressionLevel("high", R.string.compression_high, 8),
            ),
            defaultCompressionLevelId = "default",
            noteRes = R.string.format_note_flac,
        ),
        FormatDef(
            id = "aac", label = "AAC (.aac)",
            extensions = listOf("aac"), mimeTypes = listOf("audio/aac", "audio/aacp", "audio/mp4a-latm"),
            kind = FormatKind.LOSSY, lossless = false,
            encoderCandidates = listOf("aac"), muxer = "adts", demuxer = "aac",
            supportsBitrate = true, supportsBitDepth = false, supportsVbrQuality = true,
            vbrQualityRange = 0.1..1.0,
            sampleRates = STD_RATES_LOW, channels = CH_STEREO,
            defaultBitrateKbps = 192,
            bitrateOptionsKbps = listOf(64, 96, 128, 160, 192, 256, 320),
            noteRes = R.string.format_note_aac,
        ),
        FormatDef(
            id = "m4a", label = "M4A",
            extensions = listOf("m4a"), mimeTypes = listOf("audio/mp4", "audio/x-m4a", "audio/m4a"),
            kind = FormatKind.LOSSY, lossless = false,
            encoderCandidates = listOf("aac"), muxer = "ipod", demuxer = "mov",
            supportsBitrate = true, supportsBitDepth = false, supportsVbrQuality = true,
            vbrQualityRange = 0.1..1.0,
            sampleRates = STD_RATES_LOW, channels = CH_STEREO,
            defaultBitrateKbps = 192,
            bitrateOptionsKbps = listOf(64, 96, 128, 160, 192, 256, 320),
            noteRes = R.string.format_note_m4a,
        ),
        FormatDef(
            id = "ogg", label = "OGG Vorbis",
            extensions = listOf("ogg", "oga"), mimeTypes = listOf("audio/ogg", "audio/vorbis"),
            kind = FormatKind.LOSSY, lossless = false,
            encoderCandidates = listOf("libvorbis", "vorbis"), muxer = "ogg", demuxer = "ogg",
            supportsBitrate = true, supportsBitDepth = false, supportsVbrQuality = true,
            vbrQualityRange = 0.0..10.0,
            sampleRates = listOf(6000, 8000, 11025, 16000, 22050, 24000, 32000, 44100, 48000),
            channels = CH_STEREO,
            defaultBitrateKbps = 160,
            bitrateOptionsKbps = listOf(64, 96, 128, 160, 192, 224, 256, 320),
        ),
        FormatDef(
            id = "opus", label = "OPUS",
            extensions = listOf("opus"), mimeTypes = listOf("audio/opus"),
            kind = FormatKind.LOSSY, lossless = false,
            encoderCandidates = listOf("libopus", "opus"), muxer = "opus", demuxer = "ogg",
            supportsBitrate = true, supportsBitDepth = false, supportsVbrQuality = false,
            sampleRates = listOf(48000), channels = listOf(1, 2),
            defaultBitrateKbps = 128,
            bitrateOptionsKbps = listOf(32, 64, 96, 128, 160, 192, 256, 320, 510),
            noteRes = R.string.format_note_opus,
        ),
        FormatDef(
            id = "wma", label = "WMA",
            extensions = listOf("wma"), mimeTypes = listOf("audio/x-ms-wma"),
            kind = FormatKind.LOSSY, lossless = false,
            encoderCandidates = listOf("wmav2", "wmav1"), muxer = "asf", demuxer = "asf",
            supportsBitrate = true, supportsBitDepth = false, supportsVbrQuality = false,
            sampleRates = listOf(8000, 11025, 16000, 22050, 44100, 48000),
            channels = CH_STEREO,
            defaultBitrateKbps = 128,
            bitrateOptionsKbps = listOf(48, 64, 128, 192, 320),
            noteRes = R.string.format_note_wma,
        ),
        FormatDef(
            id = "aiff", label = "AIFF",
            extensions = listOf("aiff", "aif"), mimeTypes = listOf("audio/aiff", "audio/x-aiff"),
            kind = FormatKind.LOSSLESS, lossless = true,
            encoderCandidates = listOf("pcm_s16be", "pcm_s24be", "pcm_s32be"),
            muxer = "aiff", demuxer = "aiff",
            supportsBitrate = false, supportsBitDepth = true, supportsVbrQuality = false,
            bitDepths = listOf(16, 24, 32),
            sampleRates = STD_RATES_WIDE, channels = CH_STEREO,
            noteRes = R.string.format_note_aiff,
        ),
        FormatDef(
            id = "ape", label = "APE (Monkey's Audio)",
            extensions = listOf("ape"), mimeTypes = listOf("audio/x-ape"),
            kind = FormatKind.COMPRESSIVE_LOSSLESS, lossless = true,
            encoderCandidates = listOf("ape"), muxer = "ape", demuxer = "ape",
            supportsBitrate = false, supportsBitDepth = true, supportsVbrQuality = false,
            bitDepths = listOf(16, 24),
            sampleRates = listOf(8000, 11025, 16000, 22050, 24000, 32000, 44100, 48000),
            channels = CH_STEREO,
            noteRes = R.string.format_note_ape,
        ),
        FormatDef(
            id = "ac3", label = "AC3 (Dolby Digital)",
            extensions = listOf("ac3"), mimeTypes = listOf("audio/ac3"),
            kind = FormatKind.LOSSY, lossless = false,
            encoderCandidates = listOf("ac3"), muxer = "ac3", demuxer = "ac3",
            supportsBitrate = true, supportsBitDepth = false, supportsVbrQuality = false,
            sampleRates = listOf(32000, 44100, 48000),
            channels = listOf(1, 2, 6),
            defaultBitrateKbps = 448,
            bitrateOptionsKbps = listOf(128, 192, 256, 320, 384, 448, 640),
            noteRes = R.string.format_note_ac3,
        ),
        FormatDef(
            id = "amr", label = "AMR-NB",
            extensions = listOf("amr"), mimeTypes = listOf("audio/amr", "audio/3gpp"),
            kind = FormatKind.LOSSY, lossless = false,
            encoderCandidates = listOf("libopencore_amrnb"), muxer = "amr", demuxer = "amr",
            supportsBitrate = false, supportsBitDepth = false, supportsVbrQuality = false,
            sampleRates = listOf(8000), channels = listOf(1),
            noteRes = R.string.format_note_amr,
        ),
        FormatDef(
            id = "alac", label = "ALAC (Apple Lossless)",
            extensions = listOf("m4a"), mimeTypes = listOf("audio/alac", "audio/mp4"),
            kind = FormatKind.COMPRESSIVE_LOSSLESS, lossless = true,
            encoderCandidates = listOf("alac"), muxer = "ipod", demuxer = "mov",
            supportsBitrate = false, supportsBitDepth = true, supportsVbrQuality = false,
            bitDepths = listOf(16, 24),
            sampleRates = listOf(8000, 11025, 16000, 22050, 24000, 32000, 44100, 48000),
            channels = CH_STEREO,
            noteRes = R.string.format_note_alac,
        ),
    )

    private val byId: Map<String, FormatDef> = ALL.associateBy { it.id }

    fun get(id: String?): FormatDef? = id?.let { byId[it] }

    /** 由文件扩展名推断格式（仅作提示，真实格式以探测为准） */
    fun fromExtension(fileName: String): FormatDef? {
        val ext = fileName.trim().substringAfterLast('.', "").lowercase()
        if (ext.isEmpty()) return null
        return ALL.firstOrNull { f ->
            f.extensions.contains(ext) && !(ext == "m4a" && f.id == "alac")
        }
    }
}
