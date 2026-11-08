package com.audiostudio.app.ui.tools

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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.audiostudio.app.ui.MainViewModel
import com.audiostudio.app.ui.SelectionTarget
import com.audiostudio.app.ui.components.Hint
import com.audiostudio.app.ui.components.ParamPanel
import com.audiostudio.app.ui.components.SectionCard
import com.audiostudio.app.ui.components.TaskRow
import com.audiostudio.app.ui.components.formatBytes
import com.audiostudio.app.ui.components.formatDuration

private enum class ToolMode(val zh: String) { TRIM("剪辑"), MERGE("合并") }

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
        Text("工具", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)

        // 模式切换
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ToolMode.entries.forEach { m ->
                val sel = mode == m
                OutlinedButton(
                    onClick = { mode = m },
                    modifier = Modifier.weight(1f),
                ) {
                    Text(
                        m.zh,
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
        SectionCard(title = "输出参数") {
            ParamPanel(vm)
        }

        val active = tasks.filter { it.status.isActive }
        if (active.isNotEmpty()) {
            Text("进行中（${active.size}）", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)
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

    SectionCard(title = "剪辑（选择起止时间导出）") {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { picker.launch(arrayOf("audio/*")) }, modifier = Modifier.weight(1f)) {
                Text(if (file == null) "选择音频文件" else "重新选择")
            }
            if (file != null) {
                OutlinedButton(onClick = { vm.clearSelection(SelectionTarget.TRIM) }) { Text("清除") }
            }
        }

        if (file == null) {
            Spacer(Modifier.height(8.dp))
            Hint("导出区间采用输出侧 -ss/-t（采样级精确），与 Web/桌面版语义一致。")
            return@SectionCard
        }

        Spacer(Modifier.height(8.dp))
        Text(file.name, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, maxLines = 1)
        when (file.state) {
            com.audiostudio.app.ui.ImportState.IMPORTING ->
                Text("探测中…", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            com.audiostudio.app.ui.ImportState.FAILED ->
                Text("读取失败：${file.error}", color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
            com.audiostudio.app.ui.ImportState.READY -> {
                if (dur == null || dur <= 0) {
                    Text("无法获取时长，无法剪辑", color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                } else {
                    val s = startMs.coerceIn(0, dur - 100)
                    val e = (endMs ?: dur).coerceIn(s + 100, dur)

                    Text(
                        "起点 ${formatDuration(s)} → 终点 ${formatDuration(e)}（时长 ${formatDuration(e - s)}）",
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 13.sp,
                    )
                    Slider(
                        value = s.toFloat(),
                        onValueChange = { v -> startMs = v.toLong().coerceIn(0, e - 100) },
                        valueRange = 0f..dur.toFloat(),
                    )
                    Text("裁剪起点", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    Slider(
                        value = e.toFloat(),
                        onValueChange = { v -> endMs = v.toLong().coerceIn(s + 100, dur) },
                        valueRange = 0f..dur.toFloat(),
                    )
                    Text("裁剪终点", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)

                    error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }

                    Spacer(Modifier.height(6.dp))
                    Button(
                        onClick = {
                            if (e <= s) {
                                error = "结束时间必须大于开始时间"
                            } else if (vm.startTrim(s, e)) {
                                error = null
                            } else {
                                error = "启动失败，请重试"
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("导出选区")
                    }
                }
            }
        }
    }
}

@Composable
private fun MergeTool(vm: MainViewModel) {
    val selection by vm.mergeSelection.collectAsState()
    var gapMs by remember { mutableStateOf(1000f) }
    var error by remember { mutableStateOf<String?>(null) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) vm.importFiles(SelectionTarget.MERGE, uris)
    }

    SectionCard(title = "合并（按顺序拼接，可加间隔静音）") {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { picker.launch(arrayOf("audio/*")) }, modifier = Modifier.weight(1f)) {
                Text("选择文件（可多选）")
            }
            if (selection.isNotEmpty()) {
                OutlinedButton(onClick = { vm.clearSelection(SelectionTarget.MERGE) }) { Text("清空") }
            }
        }

        if (selection.isEmpty()) {
            Spacer(Modifier.height(8.dp))
            Hint("文件将按下方顺序拼接；间隔用静音填充（anullsrc），与共享层 buildMergeArgs 语义一致。")
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
                        com.audiostudio.app.ui.ImportState.IMPORTING -> Text("探测中…", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                        com.audiostudio.app.ui.ImportState.FAILED -> Text("读取失败：${s.error}", color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                        else -> Text(info, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    }
                }
                TextButton(onClick = { vm.moveSelection(SelectionTarget.MERGE, i, -1) }, enabled = i > 0) {
                    Text("上移", fontSize = 12.sp)
                }
                TextButton(
                    onClick = { vm.moveSelection(SelectionTarget.MERGE, i, 1) },
                    enabled = i < selection.size - 1,
                ) {
                    Text("下移", fontSize = 12.sp)
                }
                TextButton(onClick = { vm.removeSelection(SelectionTarget.MERGE, s.uri) }) {
                    Text("移除", fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
                }
            }
        }

        Spacer(Modifier.height(10.dp))
        Text("文件间隔 ${(gapMs / 1000f)} 秒", color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp)
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
                    selection.isEmpty() -> error = "请先选择文件"
                    notReady -> error = "请等待文件探测完成"
                    else -> {
                        if (vm.startMerge(gapMs.toInt())) error = null else error = "启动失败，请重试"
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = selection.isNotEmpty(),
        ) {
            Text("开始合并（${selection.size} 个）")
        }
    }
}
