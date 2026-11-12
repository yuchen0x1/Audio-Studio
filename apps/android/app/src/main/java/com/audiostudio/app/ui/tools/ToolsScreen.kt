package com.audiostudio.app.ui.tools

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.audiostudio.app.R
import com.audiostudio.app.ui.MainViewModel
import com.audiostudio.app.ui.SelectionTarget
import com.audiostudio.app.ui.components.Hint
import com.audiostudio.app.ui.components.ParamPanel
import com.audiostudio.app.ui.components.SectionCard
import com.audiostudio.app.ui.components.TaskRow
import com.audiostudio.app.ui.components.formatBytes
import com.audiostudio.app.ui.components.formatDuration

private enum class ToolMode(@StringRes val labelRes: Int) { TRIM(R.string.task_kind_trim), MERGE(R.string.task_kind_merge) }

@Composable
fun ToolsScreen(vm: MainViewModel, modifier: Modifier = Modifier) {
    var mode by remember { mutableStateOf(ToolMode.TRIM) }
    val tasks by vm.tasks.collectAsState()

    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(stringResource(R.string.tools_title), fontSize = 22.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)

        // 模式切换
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ToolMode.entries.forEach { m ->
                val sel = mode == m
                OutlinedButton(
                    onClick = { mode = m },
                    modifier = Modifier.weight(1f),
                ) {
                    Text(
                        stringResource(m.labelRes),
                        color = if (sel) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        when (mode) {
            ToolMode.TRIM -> TrimTool(vm)
            ToolMode.MERGE -> MergeTool(vm)
        }

        // 参数（输出格式等，与转换页共用当前参数）
        SectionCard(title = stringResource(R.string.common_output_params)) {
            ParamPanel(vm)
        }

        val active = tasks.filter { it.status.isActive }
        if (active.isNotEmpty()) {
            Text(stringResource(R.string.common_active_count, active.size), fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)
            active.forEach { t ->
                TaskRow(
                    task = t,
                    onPause = vm::pause,
                    onResume = vm::resume,
                    onCancel = vm::cancel,
                    onRetry = vm::retry,
                    onDelete = vm::deleteTask,
                )
            }
        }
    }
}

@Composable
private fun TrimTool(vm: MainViewModel) {
    val selection by vm.trimSelection.collectAsState()
    val file = selection.firstOrNull()
    val dur = file?.probe?.durationMs
    val endAfterStartMsg = stringResource(R.string.trim_end_after_start)
    val startFailedMsg = stringResource(R.string.common_start_failed)

    var startMs by remember { mutableStateOf(0L) }
    var endMs by remember { mutableStateOf<Long?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    // 文件就绪后初始化终点为整个时长
    LaunchedEffect(file?.uri, dur) {
        if (dur != null && dur > 0) {
            if (endMs == null || (endMs ?: 0) > dur) endMs = dur
            if (startMs >= dur) startMs = 0
        }
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            vm.clearSelection(SelectionTarget.TRIM)
            vm.importFiles(SelectionTarget.TRIM, listOf(uri))
            startMs = 0
            endMs = null
            error = null
        }
    }

    SectionCard(title = stringResource(R.string.trim_section_title)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { picker.launch(arrayOf("audio/*")) }, modifier = Modifier.weight(1f)) {
                Text(if (file == null) stringResource(R.string.common_select_audio) else stringResource(R.string.common_reselect))
            }
            if (file != null) {
                OutlinedButton(onClick = { vm.clearSelection(SelectionTarget.TRIM) }) { Text(stringResource(R.string.common_clear_selection)) }
            }
        }

        if (file == null) {
            Spacer(Modifier.height(8.dp))
            Hint(stringResource(R.string.trim_hint))
            return@SectionCard
        }

        Spacer(Modifier.height(8.dp))
        Text(file.name, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, maxLines = 1)
        when (file.state) {
            com.audiostudio.app.ui.ImportState.IMPORTING ->
                Text(stringResource(R.string.common_probing), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            com.audiostudio.app.ui.ImportState.FAILED ->
                Text(stringResource(R.string.common_read_failed, file.error ?: ""), color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
            com.audiostudio.app.ui.ImportState.READY -> {
                if (dur == null || dur <= 0) {
                    Text(stringResource(R.string.trim_no_duration), color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                } else {
                    val s = startMs.coerceIn(0, dur - 100)
                    val e = (endMs ?: dur).coerceIn(s + 100, dur)

                    Text(
                        stringResource(R.string.trim_range, formatDuration(s), formatDuration(e), formatDuration(e - s)),
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 13.sp,
                    )
                    Slider(
                        value = s.toFloat(),
                        onValueChange = { v -> startMs = v.toLong().coerceIn(0, e - 100) },
                        valueRange = 0f..dur.toFloat(),
                    )
                    Text(stringResource(R.string.trim_start_label), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    Slider(
                        value = e.toFloat(),
                        onValueChange = { v -> endMs = v.toLong().coerceIn(s + 100, dur) },
                        valueRange = 0f..dur.toFloat(),
                    )
                    Text(stringResource(R.string.trim_end_label), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)

                    error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }

                    Spacer(Modifier.height(6.dp))
                    Button(
                        onClick = {
                            if (e <= s) {
                                error = endAfterStartMsg
                            } else if (vm.startTrim(s, e)) {
                                error = null
                            } else {
                                error = startFailedMsg
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(stringResource(R.string.trim_export))
                    }
                }
            }
        }
    }
}

@Composable
private fun MergeTool(vm: MainViewModel) {
    val selection by vm.mergeSelection.collectAsState()
    val selectFilesFirstMsg = stringResource(R.string.common_select_files_first)
    val waitProbeMsg = stringResource(R.string.common_wait_probe)
    val startFailedMsg = stringResource(R.string.common_start_failed)
    var gapMs by remember { mutableStateOf(1000f) }
    var error by remember { mutableStateOf<String?>(null) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) vm.importFiles(SelectionTarget.MERGE, uris)
    }

    SectionCard(title = stringResource(R.string.merge_section_title)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { picker.launch(arrayOf("audio/*")) }, modifier = Modifier.weight(1f)) {
                Text(stringResource(R.string.common_select_files_multi))
            }
            if (selection.isNotEmpty()) {
                OutlinedButton(onClick = { vm.clearSelection(SelectionTarget.MERGE) }) { Text(stringResource(R.string.common_clear)) }
            }
        }

        if (selection.isEmpty()) {
            Spacer(Modifier.height(8.dp))
            Hint(stringResource(R.string.merge_hint))
            return@SectionCard
        }

        selection.forEachIndexed { i, s ->
            Spacer(Modifier.height(8.dp))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "${i + 1}. ${s.name}",
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 14.sp,
                        maxLines = 1,
                    )
                    val info = buildList {
                        add(formatBytes(s.size))
                        s.probe?.durationMs?.let { add(formatDuration(it)) }
                        s.probe?.codec?.let { add(it) }
                    }.joinToString(" · ")
                    when (s.state) {
                        com.audiostudio.app.ui.ImportState.IMPORTING -> Text(stringResource(R.string.common_probing), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                        com.audiostudio.app.ui.ImportState.FAILED -> Text(stringResource(R.string.common_read_failed, s.error ?: ""), color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                        else -> Text(info, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    }
                }
                TextButton(onClick = { vm.moveSelection(SelectionTarget.MERGE, i, -1) }, enabled = i > 0) {
                    Text(stringResource(R.string.common_move_up), fontSize = 12.sp)
                }
                TextButton(
                    onClick = { vm.moveSelection(SelectionTarget.MERGE, i, 1) },
                    enabled = i < selection.size - 1,
                ) {
                    Text(stringResource(R.string.common_move_down), fontSize = 12.sp)
                }
                TextButton(onClick = { vm.removeSelection(SelectionTarget.MERGE, s.uri) }) {
                    Text(stringResource(R.string.common_remove), fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
                }
            }
        }

        Spacer(Modifier.height(10.dp))
        Text(stringResource(R.string.merge_gap, (gapMs / 1000f).toString()), color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp)
        Slider(
            value = gapMs,
            onValueChange = { gapMs = it },
            valueRange = 0f..10000f,
        )

        error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }

        Spacer(Modifier.height(6.dp))
        Button(
            onClick = {
                val notReady = selection.any { it.state == com.audiostudio.app.ui.ImportState.IMPORTING }
                when {
                    selection.isEmpty() -> error = selectFilesFirstMsg
                    notReady -> error = waitProbeMsg
                    else -> {
                        if (vm.startMerge(gapMs.toInt())) error = null else error = startFailedMsg
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = selection.isNotEmpty(),
        ) {
            Text(stringResource(R.string.merge_start_count, selection.size))
        }
    }
}
