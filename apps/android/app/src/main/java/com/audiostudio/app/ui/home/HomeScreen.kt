package com.audiostudio.app.ui.home

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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.audiostudio.app.Tab
import com.audiostudio.app.data.TaskStatus
import com.audiostudio.app.ui.MainViewModel
import com.audiostudio.app.ui.components.Hint
import com.audiostudio.app.ui.components.SectionCard
import com.audiostudio.app.ui.components.StatusChip
import com.audiostudio.app.ui.theme.AccentBlue
import com.audiostudio.app.ui.theme.AccentPurple
import com.audiostudio.app.ui.theme.SuccessGreen
import com.audiostudio.app.ui.theme.WarningOrange

@Composable
fun HomeScreen(vm: MainViewModel, modifier: Modifier = Modifier, onNavigate: (Tab) -> Unit) {
    val caps by vm.capabilities.collectAsState()
    val engineError by vm.engineError.collectAsState()
    val tasks by vm.tasks.collectAsState()

    val queued = tasks.count { it.status == TaskStatus.QUEUED }
    val running = tasks.count { it.status == TaskStatus.RUNNING || it.status == TaskStatus.PREPARING || it.status == TaskStatus.PAUSED }
    val done = tasks.count { it.status == TaskStatus.COMPLETED }
    val failed = tasks.count { it.status == TaskStatus.FAILED }

    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Audio Studio", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
        Text("本地音频转换 · 不上传任何文件", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)

        // ---- 引擎状态 ----
        SectionCard(title = "引擎状态") {
            if (engineError != null) {
                Text("⚠ $engineError", color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
            } else if (caps == null) {
                Text("正在初始化 FFmpeg（能力检测中）…", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
            } else {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    StatItem("FFmpeg", caps!!.ffmpegVersion, AccentBlue)
                    StatItem("可编码格式", "${caps!!.formats.count { it.canEncode }} / ${caps!!.formats.size}", SuccessGreen)
                    StatItem("编码器", "${caps!!.encoders.size}", AccentPurple)
                }
            }
        }

        // ---- 任务概览 ----
        SectionCard(title = "任务概览") {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatItem("排队", "$queued", MaterialTheme.colorScheme.onSurfaceVariant, Modifier.weight(1f))
                StatItem("进行中", "$running", AccentBlue, Modifier.weight(1f))
                StatItem("已完成", "$done", SuccessGreen, Modifier.weight(1f))
                StatItem("失败", "$failed", if (failed > 0) WarningOrange else MaterialTheme.colorScheme.onSurfaceVariant, Modifier.weight(1f))
            }
        }

        // ---- 快捷开始 ----
        Button(
            onClick = { onNavigate(Tab.CONVERT) },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("选择文件，开始转换")
        }

        // ---- 最近任务 ----
        val recent = tasks.take(3)
        SectionCard(title = "最近任务") {
            if (recent.isEmpty()) {
                Hint("暂无任务。选择音频文件后会在这里显示真实进度。")
            } else {
                recent.forEach { t ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                t.sourceName,
                                color = MaterialTheme.colorScheme.onSurface,
                                fontSize = 13.sp,
                                maxLines = 1,
                            )
                            Text(
                                "${t.kindZh()} → ${t.targetFormat.uppercase()}",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 11.sp,
                            )
                        }
                        StatusChip(t.status)
                    }
                }
            }
        }

        // ---- 安全提示 ----
        SectionCard(title = "安全说明") {
            Hint("· 所有转换在本机完成，音频不会上传到任何服务器")
            Hint("· 只读取你通过系统文件选择器主动选择的文件，不扫描全盘")
            Hint("· 单文件超过 500MB 时会提示风险；转换前会做内存与磁盘预检")
            Hint("· 源文件只读打开，失败不会破坏原文件")
        }
    }
}

@Composable
private fun StatItem(label: String, value: String, color: androidx.compose.ui.graphics.Color, modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = color, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(2.dp))
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
    }
}
