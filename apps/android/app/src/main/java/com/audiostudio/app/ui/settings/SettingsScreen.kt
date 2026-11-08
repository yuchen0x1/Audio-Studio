package com.audiostudio.app.ui.settings

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.audiostudio.app.engine.Formats
import com.audiostudio.app.engine.NAMING_TOKENS
import com.audiostudio.app.engine.buildOutputFileName
import com.audiostudio.app.engine.NamingContext
import com.audiostudio.app.engine.validateFilenameTemplate
import com.audiostudio.app.ui.MainViewModel
import com.audiostudio.app.ui.components.Hint
import com.audiostudio.app.ui.components.ScrollChips
import com.audiostudio.app.ui.components.SectionCard
import com.audiostudio.app.ui.components.formatBytes
import java.io.File

@Composable
fun SettingsScreen(vm: MainViewModel, modifier: Modifier = Modifier) {
    val settings by vm.settings.collectAsState()
    val caps by vm.capabilities.collectAsState()
    val context = LocalContext.current

    var templateError by remember { mutableStateOf<String?>(null) }
    var cacheSize by remember { mutableStateOf(0L) }
    var cacheCleared by remember { mutableStateOf(false) }

    fun refreshCache() {
        val dirs = listOf("imports", "sources", "outputs")
        cacheSize = dirs.sumOf { name ->
            File(context.cacheDir, name).walkBottomUp().sumOf { if (it.isFile) it.length() else 0L }
        }
    }
    LaunchedEffect(cacheCleared) { refreshCache() }

    val treePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) {
            try {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or
                        android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
                )
            } catch (_: Throwable) {
            }
            vm.setOutputMode("tree", uri.toString())
        }
    }

    val encodable = caps?.formats?.filter { it.canEncode }?.map { it.id } ?: emptyList()

    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("我的", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)

        // ---- 默认参数 ----
        SectionCard(title = "转换默认参数") {
            Text("默认目标格式", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(bottom = 6.dp))
            if (encodable.isEmpty()) {
                Hint("引擎能力检测中…")
            } else {
                ScrollChips(
                    options = encodable.map {
                        val f = Formats.get(it)
                        (f?.label ?: it.uppercase()) to it
                    },
                    selected = settings.defaultFormat,
                    onSelect = vm::setDefaultFormat,
                )
            }
            Spacer(Modifier.height(12.dp))
            val f = Formats.get(settings.defaultFormat)
            val bitrates = f?.bitrateOptionsKbps
            if (!bitrates.isNullOrEmpty()) {
                Text("默认比特率", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(bottom = 6.dp))
                ScrollChips(
                    options = bitrates.map { "$it kbps" to "$it" },
                    selected = settings.defaultBitrateKbps.toString(),
                    onSelect = { vm.setDefaultBitrate(it.toInt()) },
                )
            } else {
                Hint("${f?.label ?: ""} 为无损/固定参数格式，无需默认比特率。")
            }
        }

        // ---- 输出位置 ----
        SectionCard(title = "输出位置") {
            val isDownloads = settings.outputMode != "tree"
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = { vm.setOutputMode("downloads") },
                    modifier = Modifier.weight(1f),
                ) {
                    Text(
                        "下载/AudioStudio",
                        color = if (isDownloads) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 13.sp,
                    )
                }
                OutlinedButton(
                    onClick = { treePicker.launch(null) },
                    modifier = Modifier.weight(1f),
                ) {
                    Text(
                        if (isDownloads) "选择目录…" else "已选目录 ✓",
                        color = if (!isDownloads) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 13.sp,
                    )
                }
            }
            Spacer(Modifier.height(6.dp))
            if (!isDownloads) {
                Hint("输出目录：${settings.outputTreeUri}")
            } else {
                Hint("输出写入系统下载目录下的 AudioStudio/ 文件夹（MediaStore）。")
            }
        }

        // ---- 并发 ----
        SectionCard(title = "并发任务数：${settings.concurrency}") {
            Slider(
                value = settings.concurrency.toFloat(),
                onValueChange = { vm.setConcurrency(it.toInt()) },
                valueRange = 1f..4f,
                steps = 2,
            )
            Hint("同时执行的转换数量（默认 2）。数值越大越快但越耗电/内存。")
        }

        // ---- 主题 ----
        SectionCard(title = "主题") {
            ScrollChips(
                options = listOf("深色跟随系统" to "system", "强制深色" to "dark"),
                selected = settings.themeMode,
                onSelect = vm::setThemeMode,
            )
        }

        // ---- 文件名模板 ----
        SectionCard(title = "输出文件名模板") {
            OutlinedTextField(
                value = settings.filenameTemplate,
                onValueChange = {
                    templateError = validateFilenameTemplate(it)
                    if (templateError == null) vm.setFilenameTemplate(it)
                },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                isError = templateError != null,
                supportingText = {
                    Text(templateError ?: "扩展名由所选格式自动决定", fontSize = 12.sp)
                },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outline,
                    focusedContainerColor = MaterialTheme.colorScheme.surface,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                ),
            )
            Spacer(Modifier.height(8.dp))
            Hint("可用 token：" + NAMING_TOKENS.joinToString(" ") { it.first })
            // 预览
            val fmt = Formats.get(settings.defaultFormat) ?: Formats.ALL.first()
            val preview = try {
                buildOutputFileName(
                    settings.filenameTemplate,
                    NamingContext(sourceName = "我的歌曲", sourceFormat = "mp3", format = fmt, index = 1),
                )
            } catch (t: Throwable) {
                "（模板无效）"
            }
            Spacer(Modifier.height(6.dp))
            Text("预览：$preview", color = com.audiostudio.app.ui.theme.SuccessGreen, fontSize = 13.sp)
        }

        // ---- 缓存 ----
        SectionCard(title = "本地缓存") {
            Text(
                "导入/转换临时文件：${formatBytes(cacheSize)}",
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 13.sp,
            )
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = {
                    listOf("imports", "sources", "outputs").forEach {
                        File(context.cacheDir, it).deleteRecursively()
                    }
                    cacheCleared = !cacheCleared
                }) { Text("清理缓存", fontSize = 13.sp) }
            }
            Spacer(Modifier.height(6.dp))
            Hint("清理后历史任务需要重新读取源文件才能「再次执行」。")
        }

        // ---- 引擎信息 ----
        SectionCard(title = "引擎") {
            if (caps != null) {
                Text(
                    "FFmpeg ${caps!!.ffmpegVersion}（dev.ffmpegkit-maintained:ffmpeg-kit-audio:8.1.9，LGPL-3.0）",
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 13.sp,
                )
                Spacer(Modifier.height(4.dp))
                Hint("编码器 ${caps!!.encoders.size} 个 · 可编码格式 ${caps!!.formats.count { it.canEncode }} 个 · 能力实时检测自 ffmpeg -encoders")
            } else {
                Hint("引擎初始化中…")
            }
            Spacer(Modifier.height(8.dp))
        }

        // ---- 关于 ----
        SectionCard(title = "关于") {
            Hint("Audio Studio Android v1.0.0")
            Hint("全部转换在本机完成；不上传音频、不扫描全盘、失败不破坏源文件。")
        }
    }
}
