package com.audiostudio.app.engine

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
    val f = Formats.get(formatId) ?: error("未知目标格式: $formatId")
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

/** 参数合法性校验（引擎入口强制执行），返回中文错误列表 */
fun validateParams(params: EncodeParams): List<String> {
    val errors = mutableListOf<String>()
    val f = Formats.get(params.format)
    if (f == null) {
        errors.add("不支持的目标格式: ${params.format}")
        return errors
    }
    if (f.supportsBitrate) {
        val opts = f.bitrateOptionsKbps
        val br = params.bitrateKbps
        if (br != null && !opts.isNullOrEmpty() && br !in opts) {
            errors.add("比特率 ${br}kbps 不在 ${f.label} 支持范围内")
        }
    }
    if (params.sampleRate != 0 && params.sampleRate !in f.sampleRates) {
        errors.add("采样率 ${params.sampleRate}Hz 不受 ${f.label} 支持")
    }
    if (params.channels != 0 && params.channels !in f.channels) {
        errors.add("声道数 ${params.channels} 不受 ${f.label} 支持")
    }
    if (f.supportsBitDepth && params.bitDepth != null) {
        val bds = f.bitDepths
        if (bds != null && params.bitDepth !in bds) {
            errors.add("位深度 ${params.bitDepth} 不受 ${f.label} 支持")
        }
    }
    if (params.gainDb < -60 || params.gainDb > 20) {
        errors.add("音量增益需在 -60 ~ +20 dB 之间")
    }
    if (params.fadeInMs < 0 || params.fadeOutMs < 0) {
        errors.add("淡入淡出时长不能为负数")
    }
    if (params.bitrateKbps != null && params.bitrateKbps <= 0) {
        errors.add("比特率必须大于 0")
    }
    return errors
}
