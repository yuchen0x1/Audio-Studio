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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
            paramError = "请先选择并等待文件探测完成"
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
        Text("批量转换", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)

        engineError?.let {
            Text("引擎错误：$it", color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
        }

        // ---- 文件选择 ----
        SectionCard(title = "源文件") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { picker.launch(arrayOf("audio/*")) }, modifier = Modifier.weight(1f)) {
                    Text("选择音频文件（可多选）")
                }
                if (selection.isNotEmpty()) {
                    OutlinedButton(onClick = { vm.clearSelection(com.audiostudio.app.ui.SelectionTarget.CONVERT) }) {
                        Text("清空")
                    }
                }
            }
            if (selection.isEmpty()) {
                Spacer(Modifier.height(8.dp))
                Hint("支持系统文件选择器能识别的音频（SAF audio/*），可一次多选。")
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
                                    Text("复制中并探测…", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                                com.audiostudio.app.ui.ImportState.FAILED ->
                                    Text("读取失败：${s.error}", color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
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
                                        Text(it, color = WarningOrange, fontSize = 11.sp)
                                    }
                                }
                            }
                        }
                        TextButton(onClick = { vm.removeSelection(com.audiostudio.app.ui.SelectionTarget.CONVERT, s.uri) }) {
                            Text("移除", fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }

        // ---- 参数 ----
        SectionCard(title = "输出参数") {
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
            Text(if (selection.isEmpty()) "请先选择文件" else "开始转换（$readyCount 个）")
        }

        // ---- 进行中的任务 ----
        val active = tasks.filter { it.status.isActive }
        if (active.isNotEmpty()) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("进行中（${active.size}）", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)
                TextButton(onClick = { vm.cancelAll() }) {
                    Text("全部取消", fontSize = 13.sp, color = MaterialTheme.colorScheme.error)
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
            title = { Text("包含大文件") },
            text = {
                Text(
                    "所选文件中有超过 500MB 的大文件，转换将占用较多内存与磁盘。\n" +
                        "已做本机内存/磁盘预检，若资源不足任务会失败并给出原因。\n" +
                        "确定要继续吗？",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    showLargeDialog = false
                    paramError = null
                    vm.startConvert()
                }) { Text("继续转换") }
            },
            dismissButton = {
                TextButton(onClick = { showLargeDialog = false }) { Text("取消") }
            },
        )
    }
}
