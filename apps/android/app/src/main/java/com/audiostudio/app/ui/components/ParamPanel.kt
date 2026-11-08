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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
            Label("目标格式")
            val capsFormats = caps?.formats
            when {
                engineError != null -> Text(
                    "引擎不可用：$engineError",
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 13.sp,
                )
                capsFormats == null -> Text(
                    "正在检测引擎能力…",
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
                            "编码器 ${cur.encoder}${f.note?.let { " · $it" } ?: ""}",
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
                    if (params.useVbr && avail.vbr) "VBR 质量（${f.label}）" else "比特率（kbps）",
                )
                if (avail.vbr) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(bottom = 6.dp),
                    ) {
                        Text(
                            "VBR 可变码率",
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
                        "质量 ${formatQ(q)} · ${vbrLabel(f.id, q)}",
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
                Label("采样率（Hz）")
                ScrollChips(
                    options = listOf("保持源" to "0") + f.sampleRates.map { "$it" to "$it" },
                    selected = params.sampleRate.toString(),
                    onSelect = { vm.updateParams { p -> p.copy(sampleRate = it.toInt()) } },
                )
            }
        }

        // ---- 声道 ----
        if (avail.channels) {
            Column {
                Label("声道")
                ScrollChips(
                    options = listOf("保持源" to "0") +
                        f.channels.map { c -> (if (c == 1) "单声道" else "${c} 声道") to "$c" },
                    selected = params.channels.toString(),
                    onSelect = { vm.updateParams { p -> p.copy(channels = it.toInt()) } },
                )
            }
        }

        // ---- 位深度 ----
        if (avail.bitDepth && f.bitDepths != null) {
            Column {
                Label("位深度")
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
                Label("压缩等级")
                ScrollChips(
                    options = f.compressionLevels!!.map { it.label to it.id },
                    selected = params.compressionLevelId ?: "",
                    onSelect = { vm.updateParams { p -> p.copy(compressionLevelId = it) } },
                )
            }
        }

        // ---- 音量增益 ----
        Column {
            Label("音量增益 ${String.format(Locale.US, "%+.0f dB", params.gainDb)}")
            Slider(
                value = params.gainDb.toFloat(),
                onValueChange = { v -> vm.updateParams { p -> p.copy(gainDb = v.toDouble()) } },
                valueRange = -60f..20f,
            )
        }

        // ---- 淡入 / 淡出 ----
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Column(Modifier.weight(1f)) {
                Label("淡入 ${params.fadeInMs / 1000.0}s")
                Slider(
                    value = params.fadeInMs.toFloat(),
                    onValueChange = { v -> vm.updateParams { p -> p.copy(fadeInMs = v.toInt()) } },
                    valueRange = 0f..10000f,
                )
            }
            Column(Modifier.weight(1f)) {
                Label("淡出 ${params.fadeOutMs / 1000.0}s")
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

private fun vbrLabel(formatId: String, q: Double): String {
    val labels = when (formatId) {
        "mp3" -> mapOf(
            0.0 to "最高 (~245k)", 2.0 to "极高 (~190k)", 4.0 to "高 (~165k)",
            5.0 to "中高 (~130k)", 6.0 to "中 (~115k)", 9.0 to "最低 (~65k)",
        )
        "ogg" -> mapOf(0.0 to "极低", 3.0 to "低", 5.0 to "中", 7.0 to "高", 10.0 to "极高")
        else -> emptyMap()
    }
    return labels[q] ?: when {
        formatId == "mp3" -> if (q <= 3) "高质量" else if (q <= 6) "中质量" else "低质量"
        else -> "质量 ${formatQ(q)}"
    }
}
