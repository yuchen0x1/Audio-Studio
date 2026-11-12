package com.audiostudio.app.engine

import kotlin.math.max

/**
 * FFmpeg 参数向量构建器 —— 与 packages/shared/src/args.ts 语义一致的 Kotlin 移植。
 *
 * 安全约定：
 * - 永远返回 List<String>，由引擎以参数数组方式传递（不经过 shell，天然免疫命令注入）。
 * - 所有来自用户输入的路径/文件名在此之前已通过 Validation.kt 清洗。
 * - 过滤器数值全部经过数值归一化，杜绝过滤器语法注入。
 */

data class BuildContext(
    /** 源时长（毫秒）；fadeOut / trim 基准 */
    val durationMs: Long? = null,
    /** 合并时解析出的目标采样率/声道（params 为 0=keep 时填充） */
    val resolvedSampleRate: Int? = null,
    val resolvedChannels: Int? = null,
)

private fun ffmpegBase(): List<String> = listOf("-hide_banner", "-nostdin", "-y")

private fun sec(ms: Long): String = String.format(java.util.Locale.US, "%.3f", max(0L, ms) / 1000.0)

private fun secD(ms: Double): String = String.format(java.util.Locale.US, "%.3f", max(0.0, ms) / 1000.0)

private fun num(v: Double): String = String.format(java.util.Locale.US, "%.2f", v)

/** 根据格式 + 位深度选择具体 PCM 编码器 */
data class SelectedEncoder(val encoder: String, val explicit: Boolean)

fun selectEncoder(formatId: String, params: EncodeParams): SelectedEncoder {
    val f = Formats.get(formatId) ?: error("unknown target format: $formatId")
    params.encoder?.let { return SelectedEncoder(it, true) }
    val byDepth: Map<String, Map<String, String>> = mapOf(
        "wav" to mapOf("16" to "pcm_s16le", "24" to "pcm_s24le", "32" to "pcm_s32le", "f32" to "pcm_f32le"),
        "aiff" to mapOf("16" to "pcm_s16be", "24" to "pcm_s24be", "32" to "pcm_s32be"),
    )
    val depthMap = byDepth[formatId]
    if (depthMap != null && params.bitDepth != null) {
        depthMap[params.bitDepth.toString()]?.let { return SelectedEncoder(it, false) }
    }
    return SelectedEncoder(f.encoderCandidates.first(), false)
}

/** 音频滤镜链：增益 / 淡入淡出（数值均经归一化） */
fun buildAudioFilters(params: EncodeParams, ctx: BuildContext): List<String> {
    val filters = mutableListOf<String>()

    val gainDb = params.gainDb
    if (gainDb != 0.0) {
        filters.add("volume=${num(gainDb)}dB")
    }

    val fadeIn = params.fadeInMs
    val fadeOut = params.fadeOutMs
    if (fadeIn > 0) {
        filters.add("afade=t=in:st=0:d=${sec(fadeIn.toLong())}")
    }
    if (fadeOut > 0) {
        val dur = ctx.durationMs
            ?: throw IllegalArgumentException("fade-out requires source duration (missing durationMs)")
        val start = max(0.0, (dur - fadeOut) / 1000.0)
        filters.add("afade=t=out:st=${String.format(java.util.Locale.US, "%.3f", start)}:d=${sec(fadeOut.toLong())}")
    }
    return filters
}

/** 输出编码参数 */
fun buildCodecArgs(params: EncodeParams, f: FormatDef): List<String> {
    val encoder = selectEncoder(f.id, params).encoder
    val args = mutableListOf("-c:a", encoder)

    if (f.supportsBitrate) {
        when {
            params.useVbr && f.supportsVbrQuality && params.vbrQuality != null ->
                args.addAll(listOf("-q:a", params.vbrQuality.toString()))
            params.bitrateKbps != null ->
                args.addAll(listOf("-b:a", "${params.bitrateKbps}k"))
        }
    }
    if (f.supportsBitDepth && params.bitDepth != null) {
        when (f.id) {
            "flac" -> if (params.bitDepth == 16) {
                args.addAll(listOf("-sample_fmt", "s16"))
            } else {
                args.addAll(listOf("-sample_fmt", "s32", "-bits_per_raw_sample", params.bitDepth.toString()))
            }
            "alac" -> if (params.bitDepth == 16) {
                args.addAll(listOf("-sample_fmt", "s16p"))
            } else {
                args.addAll(listOf("-sample_fmt", "s32p"))
            }
            // wav/aiff 的位深度由所选 pcm 编码器决定，无需额外参数
        }
    }
    val levels = f.compressionLevels
    if (!levels.isNullOrEmpty() && params.compressionLevelId != null) {
        val level = levels.firstOrNull { it.id == params.compressionLevelId }
        if (level != null) {
            when (f.id) {
                "flac" -> args.addAll(listOf("-compression_level", level.value.toString()))
                "ape" -> args.addAll(listOf("-compression_a", level.value.toString()))
            }
        }
    }
    if (f.id == "m4a" || f.id == "alac") {
        args.addAll(listOf("-movflags", "+faststart"))
    }
    return args
}

private fun outputTail(params: EncodeParams, f: FormatDef, ctx: BuildContext, filters: List<String>): List<String> {
    val args = mutableListOf<String>()
    if (filters.isNotEmpty()) args.addAll(listOf("-af", filters.joinToString(",")))
    when {
        params.sampleRate != 0 -> args.addAll(listOf("-ar", params.sampleRate.toString()))
        ctx.resolvedSampleRate != null -> args.addAll(listOf("-ar", ctx.resolvedSampleRate.toString()))
    }
    when {
        params.channels != 0 -> args.addAll(listOf("-ac", params.channels.toString()))
        ctx.resolvedChannels != null -> args.addAll(listOf("-ac", ctx.resolvedChannels.toString()))
    }
    args.addAll(buildCodecArgs(params, f))
    args.addAll(listOf("-f", f.muxer))
    return args
}

/** 转换作业 → FFmpeg 参数向量 */
fun buildConvertArgs(sourcePath: String, params: EncodeParams, outputDir: String, outputFileName: String, ctx: BuildContext = BuildContext()): List<String> {
    val f = Formats.get(params.format) ?: error("unknown target format: ${params.format}")
    assertSafeArg(sourcePath, 0, "path")
    val out = "$outputDir/$outputFileName"
    assertSafeArg(out, 1, "path")

    val filters = buildAudioFilters(params, ctx)
    return buildList {
        addAll(ffmpegBase())
        addAll(listOf("-i", sourcePath))
        addAll(listOf("-map", "0:a:0", "-vn"))
        addAll(outputTail(params, f, ctx, filters))
        add(out)
    }
}

/** 裁剪作业 → FFmpeg 参数向量（输出侧 -ss/-t，采样级精确） */
fun buildTrimArgs(sourcePath: String, startMs: Long, endMs: Long, params: EncodeParams, outputDir: String, outputFileName: String, ctx: BuildContext = BuildContext()): List<String> {
    val f = Formats.get(params.format) ?: error("unknown target format: ${params.format}")
    assertSafeArg(sourcePath, 0, "path")
    val out = "$outputDir/$outputFileName"
    assertSafeArg(out, 1, "path")

    val s = max(0L, startMs)
    if (endMs <= s) throw IllegalArgumentException("invalid trim range: end must be greater than start")
    val durationMs = endMs - s

    // 淡入淡出以裁剪后的区间为基准
    val trimCtx = ctx.copy(durationMs = durationMs)
    val filters = buildAudioFilters(params, trimCtx)

    return buildList {
        addAll(ffmpegBase())
        addAll(listOf("-i", sourcePath))
        addAll(listOf("-ss", sec(s), "-t", sec(durationMs)))
        addAll(listOf("-map", "0:a:0", "-vn"))
        addAll(outputTail(params, f, ctx, filters))
        add(out)
    }
}

data class MergeItemArgs(
    val sourcePath: String,
    val gainDb: Double = 0.0,
    val fadeInMs: Int = 0,
    val fadeOutMs: Int = 0,
)

/** 合并作业 → FFmpeg 参数向量（concat 滤镜 + 间隔静音 + 每段增益/淡化） */
fun buildMergeArgs(items: List<MergeItemArgs>, gapMs: Int, params: EncodeParams, outputDir: String, outputFileName: String, ctx: BuildContext = BuildContext()): List<String> {
    val f = Formats.get(params.format) ?: error("unknown target format: ${params.format}")
    require(items.isNotEmpty()) { "merge requires at least one input" }

    val rate = (ctx.resolvedSampleRate ?: params.sampleRate).takeIf { it != 0 } ?: 44100
    val ch = (ctx.resolvedChannels ?: params.channels).takeIf { it != 0 } ?: 2
    val layout = when {
        ch == 1 -> "mono"
        ch >= 6 -> "5.1"
        else -> "stereo"
    }

    val args = mutableListOf<String>()
    args.addAll(ffmpegBase())
    items.forEachIndexed { i, item ->
        assertSafeArg(item.sourcePath, args.size, "path")
        args.addAll(listOf("-i", item.sourcePath))
    }
    val gapSec = max(0, gapMs) / 1000.0
    if (gapSec > 0 && items.size > 1) {
        for (i in 1 until items.size) {
            args.addAll(
                listOf(
                    "-f", "lavfi",
                    "-t", String.format(java.util.Locale.US, "%.3f", gapSec),
                    "-i", "anullsrc=r=$rate:cl=$layout",
                ),
            )
        }
    }

    val parts = mutableListOf<String>()
    val labels = mutableListOf<String>()
    items.forEachIndexed { i, item ->
        val chain = mutableListOf("aformat=sample_rates=$rate:channel_layouts=$layout")
        if (item.gainDb != 0.0) chain.add("volume=${num(item.gainDb)}dB")
        if (item.fadeInMs > 0) chain.add("afade=t=in:st=0:d=${sec(item.fadeInMs.toLong())}")
        if (item.fadeOutMs > 0) {
            // 片段自身时长未知时，淡出从 0 开始（与共享层语义一致）
            val segDur = if (ctx.durationMs != null && items.size == 1) ctx.durationMs else null
            val st = segDur?.let { max(0.0, (it - item.fadeOutMs) / 1000.0) } ?: 0.0
            chain.add("afade=t=out:st=${String.format(java.util.Locale.US, "%.3f", st)}:d=${sec(item.fadeOutMs.toLong())}")
        }
        val label = "a$i"
        parts.add("[$i:a]${chain.joinToString(",")}[$label]")
        labels.add("[$label]")
    }

    if (gapSec > 0 && items.size > 1) {
        for (i in 0 until items.size - 1) {
            val idx = items.size + i
            val label = "g$i"
            parts.add("[$idx:a]aformat=sample_rates=$rate:channel_layouts=$layout[$label]")
            labels.add("[$label]")
        }
    }

    val finalLabel: String
    if (labels.size == 1) {
        finalLabel = labels[0].removeSurrounding("[", "]")
    } else {
        parts.add("${labels.joinToString("")}concat=n=${labels.size}:v=0:a=1[cout]")
        finalLabel = "cout"
    }

    val filters = buildAudioFilters(params, ctx.copy(durationMs = ctx.durationMs))
    var fl = finalLabel
    if (filters.isNotEmpty()) {
        parts.add("[$fl]${filters.joinToString(",")}[cout2]")
        fl = "cout2"
    }

    args.addAll(listOf("-filter_complex", parts.joinToString(";"), "-map", "[$fl]", "-vn"))
    args.addAll(outputTail(params, f, ctx, emptyList()))
    val out = "$outputDir/$outputFileName"
    assertSafeArg(out, args.size, "path")
    args.add(out)
    return args
}
