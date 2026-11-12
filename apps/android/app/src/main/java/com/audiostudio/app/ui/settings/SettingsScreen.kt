package com.audiostudio.app.ui.settings

import android.content.Intent
import android.net.Uri
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
import androidx.compose.material3.Checkbox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.audiostudio.app.R
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
import com.audiostudio.app.updates.UpdateChecker
import java.io.File

@Composable
fun SettingsScreen(vm: MainViewModel, modifier: Modifier = Modifier) {
    val settings by vm.settings.collectAsState()
    val caps by vm.capabilities.collectAsState()
    val updateChecking by vm.updateChecking.collectAsState()
    val latestRelease by vm.latestRelease.collectAsState()
    val updateMessage by vm.updateMessage.collectAsState()
    val lastCheckedAt by vm.lastUpdateCheckAt.collectAsState()
    val context = LocalContext.current

    var templateError by remember { mutableStateOf<String?>(null) }
    val templateErrorMessages = mapOf(
        R.string.error_template_empty to stringResource(R.string.error_template_empty),
        R.string.error_template_path to stringResource(R.string.error_template_path),
        R.string.error_template_long to stringResource(R.string.error_template_long),
    )
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
        Text(stringResource(R.string.settings_title), fontSize = 22.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)

        // ---- 默认参数 ----
        SectionCard(title = stringResource(R.string.settings_defaults_title)) {
            Text(stringResource(R.string.settings_default_format), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(bottom = 6.dp))
            if (encodable.isEmpty()) {
                Hint(stringResource(R.string.settings_detecting))
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
                Text(stringResource(R.string.settings_default_bitrate), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(bottom = 6.dp))
                ScrollChips(
                    options = bitrates.map { "$it kbps" to "$it" },
                    selected = settings.defaultBitrateKbps.toString(),
                    onSelect = { vm.setDefaultBitrate(it.toInt()) },
                )
            } else {
                Hint(stringResource(R.string.settings_lossless_hint, f?.label ?: ""))
            }
        }

        // ---- 输出位置 ----
        SectionCard(title = stringResource(R.string.settings_output_title)) {
            val isDownloads = settings.outputMode != "tree"
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = { vm.setOutputMode("downloads") },
                    modifier = Modifier.weight(1f),
                ) {
                    Text(
                        stringResource(R.string.settings_output_downloads),
                        color = if (isDownloads) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 13.sp,
                    )
                }
                OutlinedButton(
                    onClick = { treePicker.launch(null) },
                    modifier = Modifier.weight(1f),
                ) {
                    Text(
                        if (isDownloads) stringResource(R.string.settings_output_pick) else stringResource(R.string.settings_output_picked),
                        color = if (!isDownloads) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 13.sp,
                    )
                }
            }
            Spacer(Modifier.height(6.dp))
            if (!isDownloads) {
                Hint(stringResource(R.string.settings_output_dir, settings.outputTreeUri))
            } else {
                Hint(stringResource(R.string.settings_output_downloads_hint))
            }
        }

        // ---- 并发 ----
        SectionCard(title = stringResource(R.string.settings_concurrency_title, settings.concurrency)) {
            Slider(
                value = settings.concurrency.toFloat(),
                onValueChange = { vm.setConcurrency(it.toInt()) },
                valueRange = 1f..4f,
                steps = 2,
            )
            Hint(stringResource(R.string.settings_concurrency_hint))
        }

        // ---- 主题 ----
        SectionCard(title = stringResource(R.string.settings_theme_title)) {
            ScrollChips(
                options = listOf(stringResource(R.string.settings_theme_system) to "system", stringResource(R.string.settings_theme_dark) to "dark"),
                selected = settings.themeMode,
                onSelect = vm::setThemeMode,
            )
        }

        // ---- 文件名模板 ----
        SectionCard(title = stringResource(R.string.settings_template_title)) {
            OutlinedTextField(
                value = settings.filenameTemplate,
                onValueChange = {
                    templateError = validateFilenameTemplate(it)?.let { res -> templateErrorMessages[res] }
                    if (templateError == null) vm.setFilenameTemplate(it)
                },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                isError = templateError != null,
                supportingText = {
                    Text(templateError ?: stringResource(R.string.settings_template_hint), fontSize = 12.sp)
                },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outline,
                    focusedContainerColor = MaterialTheme.colorScheme.surface,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                ),
            )
            Spacer(Modifier.height(8.dp))
            Hint(stringResource(R.string.settings_template_tokens, NAMING_TOKENS.joinToString(" ") { it.first }))
            // 预览
            val fmt = Formats.get(settings.defaultFormat) ?: Formats.ALL.first()
            val sampleName = stringResource(R.string.settings_preview_sample_name)
            val templateInvalidText = stringResource(R.string.settings_template_invalid)
            val preview = try {
                buildOutputFileName(
                    settings.filenameTemplate,
                    NamingContext(sourceName = sampleName, sourceFormat = "mp3", format = fmt, index = 1),
                )
            } catch (t: Throwable) {
                templateInvalidText
            }
            Spacer(Modifier.height(6.dp))
            Text(stringResource(R.string.settings_preview, preview), color = com.audiostudio.app.ui.theme.SuccessGreen, fontSize = 13.sp)
        }

        // ---- 缓存 ----
        SectionCard(title = stringResource(R.string.settings_cache_title)) {
            Text(
                stringResource(R.string.settings_cache_size, formatBytes(cacheSize)),
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
                }) { Text(stringResource(R.string.settings_clear_cache), fontSize = 13.sp) }
            }
            Spacer(Modifier.height(6.dp))
            Hint(stringResource(R.string.settings_cache_hint))
        }

        // ---- 引擎信息 ----
        SectionCard(title = stringResource(R.string.settings_engine_title)) {
            if (caps != null) {
                Text(
                    stringResource(R.string.settings_engine_info, caps!!.ffmpegVersion),
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 13.sp,
                )
                Spacer(Modifier.height(4.dp))
                Hint(stringResource(R.string.settings_engine_caps, caps!!.encoders.size, caps!!.formats.count { it.canEncode }))
            } else {
                Hint(stringResource(R.string.settings_engine_init))
            }
            Spacer(Modifier.height(8.dp))
        }

        // ---- 更新 ----
        SectionCard(title = stringResource(R.string.settings_update_title)) {
            Text(stringResource(R.string.settings_update_desc), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
            Spacer(Modifier.height(8.dp))
            Row {
                Checkbox(
                    checked = settings.autoCheckUpdates,
                    onCheckedChange = vm::setAutoCheckUpdates,
                )
                Text(
                    stringResource(R.string.settings_auto_check_updates),
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
            Hint(stringResource(R.string.settings_auto_check_updates_hint))
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = vm::checkUpdates, enabled = !updateChecking) {
                    Text(if (updateChecking) stringResource(R.string.settings_checking_updates) else stringResource(R.string.settings_check_updates))
                }
                OutlinedButton(onClick = {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(UpdateChecker.REPOSITORY_PAGE)))
                }) {
                    Text(stringResource(R.string.settings_update_repository))
                }
            }
            updateMessage?.let { Hint(it) }
            Hint(UpdateChecker.timeAgo(context, lastCheckedAt))
            latestRelease?.let { release ->
                Spacer(Modifier.height(8.dp))
                Hint(stringResource(R.string.settings_update_latest, release.tagName))
                Text(stringResource(R.string.settings_update_release_notes), fontWeight = FontWeight.Bold, fontSize = 13.sp)
                Text(
                    release.body.ifBlank { stringResource(R.string.settings_update_no_notes) },
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp,
                )
                if (release.assets.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    Text(stringResource(R.string.settings_update_assets), fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    release.assets.forEach { asset ->
                        val size = asset.sizeBytes?.let { formatBytes(it) }?.let { " · $it" }.orEmpty()
                        Text(
                            "${asset.name}$size",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 12.sp,
                        )
                    }
                }
                Spacer(Modifier.height(6.dp))
                OutlinedButton(onClick = {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(release.url)))
                }) {
                    Text(stringResource(R.string.settings_update_open_release))
                }
            }
        }

        // ---- 关于 ----
        SectionCard(title = stringResource(R.string.settings_about_title)) {
            @Suppress("DEPRECATION")
            val appVersion = context.packageManager.getPackageInfo(context.packageName, 0).versionName.orEmpty()
            Hint("Audio Studio Android $appVersion")
            Hint(stringResource(R.string.settings_about_privacy))
        }
    }
}
