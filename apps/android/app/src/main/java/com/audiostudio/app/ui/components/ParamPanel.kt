package com.audiostudio.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.audiostudio.app.R
import com.audiostudio.app.engine.Formats
import com.audiostudio.app.engine.paramAvailability
import com.audiostudio.app.ui.MainViewModel
import java.util.Locale

/** 横向滚动的胶囊选择行 */
@Composable
fun ScrollChips(
    options: List<Pair<String, String>>, // label to value
    selected: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { (label, value) ->
            val isSel = value == selected
            Column(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(
                        if (isSel) MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
                        else MaterialTheme.colorScheme.surfaceVariant,
                    )
                    .border(
                        1.dp,
                        if (isSel) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                        RoundedCornerShape(999.dp),
                    )
                    .clickable { onSelect(value) }
                    .padding(horizontal = 12.dp, vertical = 7.dp),
            ) {
                Text(
                    label,
                    color = if (isSel) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun Label(text: String) {
    Text(
        text,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontSize = 12.sp,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.padding(bottom = 6.dp),
    )
}

/**
 * 编码参数面板（转换/剪辑/合并共用）。
 * 只展示当前目标格式可用的参数（不可用的直接隐藏，杜绝假参数）。
 */
@Composable
fun ParamPanel(vm: MainViewModel, modifier: Modifier = Modifier) {
    val params by vm.params.collectAsState()
    val caps by vm.capabilities.collectAsState()
    val engineError by vm.engineError.collectAsState()
    val f = Formats.get(params.format) ?: return
    val avail = paramAvailability(f.id)

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        // ---- 目标格式（能力检测过滤） ----
        Column {
            Label(stringResource(R.string.param_target_format))
            val capsFormats = caps?.formats
            when {
                engineError != null -> Text(
                    stringResource(R.string.param_engine_unavailable, engineError ?: ""),
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 13.sp,
                )
                capsFormats == null -> Text(
                    stringResource(R.string.param_detecting),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp,
                )
                else -> {
                    val encodable = capsFormats.filter { it.canEncode }
                    ScrollChips(
                        options = encodable.map {
                            val fm = Formats.get(it.id)
                            (fm?.label ?: it.id.uppercase()) to it.id
                        },
                        selected = params.format,
                        onSelect = { vm.setFormat(it) },
                    )
                    val cur = encodable.firstOrNull { it.id == params.format }
                    if (cur != null && cur.encoder != null) {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            stringResource(R.string.param_encoder, cur.encoder) +
                                (f.noteRes?.let { " · " + stringResource(it) } ?: ""),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 12.sp,
                        )
                    }
                }
            }
        }

        // ---- 比特率 / VBR ----
        if (avail.bitrate) {
            Column {
                Label(
                    if (params.useVbr && avail.vbr) stringResource(R.string.param_vbr_quality, f.label)
                    else stringResource(R.string.param_bitrate),
                )
                if (avail.vbr) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(bottom = 6.dp),
                    ) {
                        Text(
                            stringResource(R.string.param_use_vbr),
                            color = MaterialTheme.colorScheme.onSurface,
                            fontSize = 13.sp,
                        )
                        Spacer(Modifier.height(0.dp))
                        Switch(
                            checked = params.useVbr,
                            onCheckedChange = { v ->
                                vm.updateParams { it.copy(useVbr = v, vbrQuality = if (v) (f.vbrQualityRange?.endInclusive ?: 5.0) * 0.5 else null) }
                            },
                        )
                    }
                }
                if (params.useVbr && avail.vbr && f.vbrQualityRange != null) {
                    val range = f.vbrQualityRange
                    val q = (params.vbrQuality ?: (range.endInclusive + range.start) / 2)
                        .coerceIn(range.start, range.endInclusive)
                    Slider(
                        value = q.toFloat(),
                        onValueChange = { vm.updateParams { p -> p.copy(vbrQuality = it.toDouble()) } },
                        valueRange = range.start.toFloat()..range.endInclusive.toFloat(),
                    )
                    Text(
                        stringResource(R.string.param_quality, formatQ(q), vbrLabel(f.id, q)),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp,
                    )
                } else {
                    val opts = f.bitrateOptionsKbps ?: emptyList()
                    ScrollChips(
                        options = opts.map { "$it" to "$it" },
                        selected = (params.bitrateKbps ?: f.defaultBitrateKbps)?.toString() ?: "",
                        onSelect = { vm.updateParams { p -> p.copy(bitrateKbps = it.toInt()) } },
                    )
                }
            }
        }

        // ---- 采样率 ----
        if (avail.sampleRate) {
            Column {
                Label(stringResource(R.string.param_sample_rate))
                ScrollChips(
                    options = listOf(stringResource(R.string.param_keep_source) to "0") + f.sampleRates.map { "$it" to "$it" },
                    selected = params.sampleRate.toString(),
                    onSelect = { vm.updateParams { p -> p.copy(sampleRate = it.toInt()) } },
                )
            }
        }

        // ---- 声道 ----
        if (avail.channels) {
            Column {
                Label(stringResource(R.string.param_channels))
                ScrollChips(
                    options = listOf(stringResource(R.string.param_keep_source) to "0") +
                        f.channels.map { c -> (if (c == 1) stringResource(R.string.param_mono) else stringResource(R.string.param_channels_count, c)) to "$c" },
                    selected = params.channels.toString(),
                    onSelect = { vm.updateParams { p -> p.copy(channels = it.toInt()) } },
                )
            }
        }

        // ---- 位深度 ----
        if (avail.bitDepth && f.bitDepths != null) {
            Column {
                Label(stringResource(R.string.param_bit_depth))
                ScrollChips(
                    options = f.bitDepths!!.map { d -> (if (d == "f32") "32bit float" else "${d}bit") to d.toString() },
                    selected = params.bitDepth?.toString() ?: "",
                    onSelect = { v ->
                        vm.updateParams { p ->
                            p.copy(bitDepth = if (v == "f32") "f32" else v.toInt())
                        }
                    },
                )
            }
        }

        // ---- 压缩等级 ----
        if (avail.compression && f.compressionLevels != null) {
            Column {
                Label(stringResource(R.string.param_compression))
                ScrollChips(
                    options = f.compressionLevels.map { stringResource(it.labelRes) to it.id },
                    selected = params.compressionLevelId ?: "",
                    onSelect = { vm.updateParams { p -> p.copy(compressionLevelId = it) } },
                )
            }
        }

        // ---- 音量增益 ----
        Column {
            Label(stringResource(R.string.param_gain, String.format(Locale.US, "%+.0f dB", params.gainDb)))
            Slider(
                value = params.gainDb.toFloat(),
                onValueChange = { v -> vm.updateParams { p -> p.copy(gainDb = v.toDouble()) } },
                valueRange = -60f..20f,
            )
        }

        // ---- 淡入 / 淡出 ----
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Column(Modifier.weight(1f)) {
                Label(stringResource(R.string.param_fade_in, "${params.fadeInMs / 1000.0}s"))
                Slider(
                    value = params.fadeInMs.toFloat(),
                    onValueChange = { v -> vm.updateParams { p -> p.copy(fadeInMs = v.toInt()) } },
                    valueRange = 0f..10000f,
                )
            }
            Column(Modifier.weight(1f)) {
                Label(stringResource(R.string.param_fade_out, "${params.fadeOutMs / 1000.0}s"))
                Slider(
                    value = params.fadeOutMs.toFloat(),
                    onValueChange = { v -> vm.updateParams { p -> p.copy(fadeOutMs = v.toInt()) } },
                    valueRange = 0f..10000f,
                )
            }
        }
    }
}

private fun formatQ(q: Double): String =
    if (q % 1.0 == 0.0) q.toInt().toString() else String.format(Locale.US, "%.1f", q)

@Composable
private fun vbrLabel(formatId: String, q: Double): String {
    val res: Int? = when (formatId) {
        "mp3" -> when (q) {
            0.0 -> R.string.vbr_mp3_0
            2.0 -> R.string.vbr_mp3_2
            4.0 -> R.string.vbr_mp3_4
            5.0 -> R.string.vbr_mp3_5
            6.0 -> R.string.vbr_mp3_6
            9.0 -> R.string.vbr_mp3_9
            else -> null
        }
        "ogg" -> when (q) {
            0.0 -> R.string.vbr_ogg_0
            3.0 -> R.string.vbr_ogg_3
            5.0 -> R.string.vbr_ogg_5
            7.0 -> R.string.vbr_ogg_7
            10.0 -> R.string.vbr_ogg_10
            else -> null
        }
        else -> null
    }
    if (res != null) return stringResource(res)
    return when {
        formatId == "mp3" -> stringResource(
            if (q <= 3) R.string.vbr_high_quality else if (q <= 6) R.string.vbr_medium_quality else R.string.vbr_low_quality,
        )
        else -> stringResource(R.string.vbr_quality_fallback, formatQ(q))
    }
}
