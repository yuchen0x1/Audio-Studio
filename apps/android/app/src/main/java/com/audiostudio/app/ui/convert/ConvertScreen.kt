package com.audiostudio.app.ui.convert

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import com.audiostudio.app.data.TaskStatus
import com.audiostudio.app.engine.ConvertManager
import com.audiostudio.app.ui.MainViewModel
import com.audiostudio.app.ui.components.Hint
import com.audiostudio.app.ui.components.ParamPanel
import com.audiostudio.app.ui.components.SectionCard
import com.audiostudio.app.ui.components.TaskRow
import com.audiostudio.app.ui.components.formatBytes
import com.audiostudio.app.ui.components.formatDuration
import com.audiostudio.app.ui.theme.WarningOrange

@Composable
fun ConvertScreen(vm: MainViewModel, modifier: Modifier = Modifier) {
    val selection by vm.convertSelection.collectAsState()
    val tasks by vm.tasks.collectAsState()
    val engineError by vm.engineError.collectAsState()
    val waitProbeMsg = stringResource(R.string.convert_wait_probe)

    var paramError by remember { mutableStateOf<String?>(null) }
    var showLargeDialog by remember { mutableStateOf(false) }

    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments(),
    ) { uris ->
        if (uris.isNotEmpty()) vm.importFiles(com.audiostudio.app.ui.SelectionTarget.CONVERT, uris)
    }

    fun startNow() {
        val errors = vm.paramErrors()
        if (errors.isNotEmpty()) {
            paramError = errors.first()
            return
        }
        val sel = vm.selection(com.audiostudio.app.ui.SelectionTarget.CONVERT)
        if (sel.none { it.ready }) {
            paramError = waitProbeMsg
            return
        }
        if (sel.any { it.largeFile }) {
            showLargeDialog = true
            return
        }
        paramError = null
        vm.startConvert()
    }

    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(stringResource(R.string.convert_title), fontSize = 22.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)

        engineError?.let {
            Text(stringResource(R.string.convert_engine_error, it), color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
        }

        // ---- 文件选择 ----
        SectionCard(title = stringResource(R.string.convert_source_title)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { picker.launch(arrayOf("audio/*")) }, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.convert_select_audio))
                }
                if (selection.isNotEmpty()) {
                    OutlinedButton(onClick = { vm.clearSelection(com.audiostudio.app.ui.SelectionTarget.CONVERT) }) {
                        Text(stringResource(R.string.common_clear))
                    }
                }
            }
            if (selection.isEmpty()) {
                Spacer(Modifier.height(8.dp))
                Hint(stringResource(R.string.convert_select_hint))
            } else {
                selection.forEach { s ->
                    Spacer(Modifier.height(10.dp))
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    s.name,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    fontSize = 14.sp,
                                    maxLines = 1,
                                    modifier = Modifier.weight(1f, fill = false),
                                )
                                if (s.largeFile) {
                                    Spacer(Modifier.width(6.dp))
                                    Text("⚠ >500MB", color = WarningOrange, fontSize = 11.sp)
                                }
                            }
                            when (s.state) {
                                com.audiostudio.app.ui.ImportState.IMPORTING ->
                                    Text(stringResource(R.string.convert_importing), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                                com.audiostudio.app.ui.ImportState.FAILED ->
                                    Text(stringResource(R.string.common_read_failed, s.error ?: ""), color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                                com.audiostudio.app.ui.ImportState.READY -> {
                                    val p = s.probe
                                    val info = buildList {
                                        add(formatBytes(s.size))
                                        p?.durationMs?.let { add(formatDuration(it)) }
                                        p?.codec?.let { add(it) }
                                        p?.sampleRate?.let { add("${it}Hz") }
                                        p?.channels?.let { add("${it}ch") }
                                        p?.bitrateKbps?.let { add("${it}kbps") }
                                    }.joinToString(" · ")
                                    Text(
                                        info,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        fontSize = 12.sp,
                                    )
                                    p?.warnings?.firstOrNull()?.let {
                                        Text(stringResource(it), color = WarningOrange, fontSize = 11.sp)
                                    }
                                }
                            }
                        }
                        TextButton(onClick = { vm.removeSelection(com.audiostudio.app.ui.SelectionTarget.CONVERT, s.uri) }) {
                            Text(stringResource(R.string.common_remove), fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }

        // ---- 参数 ----
        SectionCard(title = stringResource(R.string.common_output_params)) {
            ParamPanel(vm)
        }

        paramError?.let {
            Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
        }

        val readyCount = selection.count { it.ready }
        Button(
            onClick = { startNow() },
            modifier = Modifier.fillMaxWidth(),
            enabled = selection.isNotEmpty() && selection.all { it.state != com.audiostudio.app.ui.ImportState.IMPORTING },
        ) {
            Text(if (selection.isEmpty()) stringResource(R.string.common_select_files_first) else stringResource(R.string.convert_start_count, readyCount))
        }

        // ---- 进行中的任务 ----
        val active = tasks.filter { it.status.isActive }
        if (active.isNotEmpty()) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(stringResource(R.string.common_active_count, active.size), fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)
                TextButton(onClick = { vm.cancelAll() }) {
                    Text(stringResource(R.string.convert_cancel_all), fontSize = 13.sp, color = MaterialTheme.colorScheme.error)
                }
            }
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

    if (showLargeDialog) {
        AlertDialog(
            onDismissRequest = { showLargeDialog = false },
            title = { Text(stringResource(R.string.convert_large_title)) },
            text = {
                Text(stringResource(R.string.convert_large_body))
            },
            confirmButton = {
                TextButton(onClick = {
                    showLargeDialog = false
                    paramError = null
                    vm.startConvert()
                }) { Text(stringResource(R.string.convert_large_continue)) }
            },
            dismissButton = {
                TextButton(onClick = { showLargeDialog = false }) { Text(stringResource(R.string.common_cancel)) }
            },
        )
    }
}
