package com.audiostudio.app.ui.components

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.audiostudio.app.R
import com.audiostudio.app.data.TaskRecord
import com.audiostudio.app.data.TaskStatus
import com.audiostudio.app.data.targetFormatLabel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val TIME_FMT = SimpleDateFormat("MM-dd HH:mm", Locale.getDefault())

/**
 * 任务行：状态 / 进度 / 操作（暂停、继续、取消、重试、分享、删除、详情）。
 * 所有按钮都接真实回调，无假按钮。
 */
@Composable
fun TaskRow(
    task: TaskRecord,
    onPause: (String) -> Unit,
    onResume: (String) -> Unit,
    onCancel: (String) -> Unit,
    onRetry: (TaskRecord) -> Unit,
    onDelete: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val shareAudioTitle = stringResource(R.string.task_share_audio)
    var expanded by remember(task.id) { mutableStateOf(false) }

    SectionCard(modifier = modifier) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                task.sourceName,
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(8.dp))
            StatusChip(task.status)
        }

        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                "${stringResource(task.kindLabelRes())} → ${targetFormatLabel(task)}",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
            )
            Text(
                TIME_FMT.format(Date(task.createdAt)),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
            )
            task.durationMs?.let {
                Text(
                    formatDuration(it),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                )
            }
        }

        if (task.status.isActive) {
            Spacer(Modifier.height(8.dp))
            LinearProgressIndicator(
                progress = { task.progress },
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colorScheme.primary,
                trackColor = MaterialTheme.colorScheme.outline,
            )
            Spacer(Modifier.height(4.dp))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    "${(task.progress * 100).toInt()}%" +
                        (task.speed?.let { " · ${"%.1f".format(Locale.US, it)}x" } ?: ""),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                )
                if (task.processedMs > 0) {
                    Text(
                        "${formatDuration(task.processedMs)} / ${formatDuration(task.totalMs())}",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp,
                    )
                }
            }
        }

        if (task.status == TaskStatus.FAILED && task.errorMessage != null) {
            Spacer(Modifier.height(6.dp))
            Text(
                task.errorMessage,
                color = MaterialTheme.colorScheme.error,
                fontSize = 12.sp,
                lineHeight = 16.sp,
            )
        }
        if (task.status == TaskStatus.COMPLETED && task.outputPath != null) {
            Spacer(Modifier.height(6.dp))
            Text(
                stringResource(R.string.task_output, task.outputPath),
                color = com.audiostudio.app.ui.theme.SuccessGreen,
                fontSize = 12.sp,
            )
        }

        // ---- 操作按钮 ----
        Spacer(Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            when (task.status) {
                TaskStatus.QUEUED, TaskStatus.PREPARING, TaskStatus.RUNNING -> {
                    OutlinedButton(onClick = { onPause(task.id) }, modifier = Modifier.weight(1f)) {
                        Text(stringResource(R.string.common_pause), fontSize = 13.sp)
                    }
                    OutlinedButton(onClick = { onCancel(task.id) }, modifier = Modifier.weight(1f)) {
                        Text(stringResource(R.string.common_cancel), fontSize = 13.sp, color = MaterialTheme.colorScheme.error)
                    }
                }
                TaskStatus.PAUSED -> {
                    OutlinedButton(onClick = { onResume(task.id) }, modifier = Modifier.weight(1f)) {
                        Text(stringResource(R.string.common_resume), fontSize = 13.sp)
                    }
                    OutlinedButton(onClick = { onCancel(task.id) }, modifier = Modifier.weight(1f)) {
                        Text(stringResource(R.string.common_cancel), fontSize = 13.sp, color = MaterialTheme.colorScheme.error)
                    }
                }
                TaskStatus.COMPLETED -> {
                    OutlinedButton(
                        onClick = {
                            val uri = task.outputUri ?: return@OutlinedButton
                            val send = Intent(Intent.ACTION_SEND).apply {
                                type = "audio/*"
                                putExtra(Intent.EXTRA_STREAM, android.net.Uri.parse(uri))
                                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            }
                            context.startActivity(Intent.createChooser(send, shareAudioTitle))
                        },
                        modifier = Modifier.weight(1f),
                        enabled = task.outputUri != null,
                    ) {
                        Text(stringResource(R.string.common_share), fontSize = 13.sp)
                    }
                    OutlinedButton(onClick = { onRetry(task) }, modifier = Modifier.weight(1f)) {
                        Text(stringResource(R.string.common_reexecute), fontSize = 13.sp)
                    }
                }
                TaskStatus.FAILED, TaskStatus.CANCELLED -> {
                    OutlinedButton(onClick = { onRetry(task) }, modifier = Modifier.weight(1f)) {
                        Text(stringResource(R.string.common_retry), fontSize = 13.sp)
                    }
                }
            }
            OutlinedButton(onClick = { onDelete(task.id) }) {
                Text(stringResource(R.string.common_delete), fontSize = 13.sp, color = MaterialTheme.colorScheme.error)
            }
        }

        TextButton(onClick = { expanded = !expanded }) {
            Text(if (expanded) stringResource(R.string.common_collapse_details) else stringResource(R.string.common_details), fontSize = 12.sp)
        }
        if (expanded) {
            DetailBlock(task)
        }
    }
}

@Composable
fun DetailBlock(task: TaskRecord) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        DetailLine(stringResource(R.string.detail_task_id), task.id)
        task.sourceUri?.let { DetailLine(stringResource(R.string.detail_source_uri), it) }
        task.sourcePath?.let { DetailLine(stringResource(R.string.detail_local_cache), it) }
        task.codec?.let { DetailLine(stringResource(R.string.detail_source_codec), it) }
        task.sampleRate?.let { DetailLine(stringResource(R.string.detail_sample_rate), "$it Hz") }
        task.channels?.let { DetailLine(stringResource(R.string.detail_channels), "$it") }
        task.bitrateKbps?.let { DetailLine(stringResource(R.string.detail_source_bitrate), "$it kbps") }
        task.startMs?.let { DetailLine(stringResource(R.string.detail_trim_start), "${it} ms") }
        task.endMs?.let { DetailLine(stringResource(R.string.detail_trim_end), "${it} ms") }
        if (task.gapMs > 0) DetailLine(stringResource(R.string.detail_merge_gap), "${task.gapMs} ms")
        if (task.mergeNames.isNotEmpty()) DetailLine(stringResource(R.string.detail_merge_files), task.mergeNames.joinToString(stringResource(R.string.list_separator)))
        DetailLine(stringResource(R.string.detail_params), prettyParams(task.paramsJson))
        task.outputUri?.let { DetailLine(stringResource(R.string.detail_output_uri), it) }
        task.errorCode?.let { DetailLine(stringResource(R.string.detail_error_code), it) }
        task.errorDetail?.let { DetailLine(stringResource(R.string.detail_error_detail), it) }
    }
}

@Composable
private fun DetailLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth()) {
        Text(
            stringResource(R.string.detail_label, label),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 12.sp,
            modifier = Modifier.width(76.dp),
        )
        Text(
            value,
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            modifier = Modifier.weight(1f),
        )
    }
}

/** 参数 JSON → 可读文本 */
fun prettyParams(json: String): String = try {
    val o = org.json.JSONObject(json)
    buildList {
        o.keys().forEach { k ->
            if (!o.isNull(k)) add("$k=${o.get(k)}")
        }
    }.joinToString(", ")
} catch (t: Throwable) {
    json
}
