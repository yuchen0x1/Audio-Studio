package com.audiostudio.app.engine

import android.content.Context
import androidx.annotation.StringRes
import com.audiostudio.app.R

/**
 * 编码参数模型 —— 与 packages/shared/src/params.ts 语义一致的 Kotlin 移植。
 */

data class EncodeParams(
    val format: String,
    /** CBR 比特率 kbps；supportsBitrate 时生效，与 vbrQuality 互斥 */
    val bitrateKbps: Int? = null,
    /** VBR 质量 */
    val vbrQuality: Double? = null,
    val useVbr: Boolean = false,
    /** 0 = 保持源采样率 */
    val sampleRate: Int = 0,
    /** 0 = 保持源声道数 */
    val channels: Int = 0,
    /** 16 / 24 / 32 / "f32" */
    val bitDepth: Any? = null,
    /** 编码器覆盖（留空自动选首个可用候选） */
    val encoder: String? = null,
    val compressionLevelId: String? = null,
    /** 音量增益 dB，0 = 不调整（-60 ~ +20） */
    val gainDb: Double = 0.0,
    val fadeInMs: Int = 0,
    val fadeOutMs: Int = 0,
    /** 输出文件名模板，见 Naming.kt */
    val filenameTemplate: String = DEFAULT_FILENAME_TEMPLATE,
)

const val DEFAULT_FILENAME_TEMPLATE = "{name}_{format}"

data class ParamAvailability(
    val bitrate: Boolean,
    val vbr: Boolean,
    val sampleRate: Boolean,
    val channels: Boolean,
    val bitDepth: Boolean,
    val compression: Boolean,
)

/** 根据目标格式计算哪些参数可用 —— 不适用的参数必须禁用/隐藏 */
fun paramAvailability(formatId: String): ParamAvailability {
    val f = Formats.get(formatId)
        ?: return ParamAvailability(false, false, false, false, false, false)
    return ParamAvailability(
        bitrate = f.supportsBitrate,
        vbr = f.supportsVbrQuality,
        sampleRate = f.sampleRates.isNotEmpty(),
        channels = f.channels.isNotEmpty(),
        bitDepth = f.supportsBitDepth,
        compression = !f.compressionLevels.isNullOrEmpty(),
    )
}

/** 生成目标格式的默认参数：尽可能保持源参数，只做必要约束 */
fun defaultParamsFor(formatId: String, template: String = DEFAULT_FILENAME_TEMPLATE): EncodeParams {
    val f = Formats.get(formatId) ?: error("unknown target format: $formatId")
    val builder = EncodeParams(format = formatId, filenameTemplate = template)
    return builder.copy(
        bitrateKbps = if (f.supportsBitrate) f.defaultBitrateKbps else null,
        useVbr = false,
        vbrQuality = null,
        bitDepth = if (f.supportsBitDepth) f.bitDepths?.firstOrNull() else null,
        compressionLevelId = f.compressionLevels?.let {
            f.defaultCompressionLevelId ?: it.first().id
        },
    )
}

fun closestNumber(list: List<Int>, target: Int): Int {
    return list.minByOrNull { kotlin.math.abs(it - target) } ?: list.first()
}

/** 参数校验错误：携带字符串资源与占位符参数，在 UI/Context 边界本地化解析 */
data class ParamError(@StringRes val resId: Int, val args: List<Any> = emptyList()) {
    fun resolve(context: Context): String =
        if (args.isEmpty()) context.getString(resId) else context.getString(resId, *args.toTypedArray())
}

/** 参数合法性校验（引擎入口强制执行），返回可本地化的错误列表 */
fun validateParams(params: EncodeParams): List<ParamError> {
    val errors = mutableListOf<ParamError>()
    val f = Formats.get(params.format)
    if (f == null) {
        errors.add(ParamError(R.string.error_param_format, listOf(params.format)))
        return errors
    }
    if (f.supportsBitrate) {
        val opts = f.bitrateOptionsKbps
        val br = params.bitrateKbps
        if (br != null && !opts.isNullOrEmpty() && br !in opts) {
            errors.add(ParamError(R.string.error_param_bitrate, listOf(br, f.label)))
        }
    }
    if (params.sampleRate != 0 && params.sampleRate !in f.sampleRates) {
        errors.add(ParamError(R.string.error_param_sample_rate, listOf(params.sampleRate, f.label)))
    }
    if (params.channels != 0 && params.channels !in f.channels) {
        errors.add(ParamError(R.string.error_param_channels, listOf(params.channels, f.label)))
    }
    if (f.supportsBitDepth && params.bitDepth != null) {
        val bds = f.bitDepths
        if (bds != null && params.bitDepth !in bds) {
            errors.add(ParamError(R.string.error_param_bit_depth, listOf(params.bitDepth.toString(), f.label)))
        }
    }
    if (params.gainDb < -60 || params.gainDb > 20) {
        errors.add(ParamError(R.string.error_param_gain))
    }
    if (params.fadeInMs < 0 || params.fadeOutMs < 0) {
        errors.add(ParamError(R.string.error_param_fade))
    }
    if (params.bitrateKbps != null && params.bitrateKbps <= 0) {
        errors.add(ParamError(R.string.error_param_bitrate_positive))
    }
    return errors
}
