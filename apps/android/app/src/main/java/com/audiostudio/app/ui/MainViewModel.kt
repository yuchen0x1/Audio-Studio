package com.audiostudio.app.ui

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.audiostudio.app.App
import com.audiostudio.app.R
import com.audiostudio.app.data.AppSettings
import com.audiostudio.app.data.TaskRecord
import com.audiostudio.app.data.TaskStatus
import com.audiostudio.app.engine.EncodeParams
import com.audiostudio.app.engine.EngineCapabilities
import com.audiostudio.app.engine.ProbeResult
import com.audiostudio.app.engine.defaultParamsFor
import com.audiostudio.app.engine.validateParams
import com.audiostudio.app.util.SafUtils
import com.audiostudio.app.updates.LatestReleaseInfo
import com.audiostudio.app.updates.UpdateChecker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

enum class SelectionTarget { CONVERT, TRIM, MERGE }

enum class ImportState { IMPORTING, READY, FAILED }

data class SelectedAudio(
    val uri: String,
    val name: String,
    val size: Long,
    val localPath: String? = null,
    val probe: ProbeResult? = null,
    val state: ImportState = ImportState.IMPORTING,
    val error: String? = null,
) {
    val largeFile: Boolean get() = size > 500L * 1024 * 1024
    val ready: Boolean get() = state == ImportState.READY
}

class MainViewModel(app: Application) : AndroidViewModel(app) {

    private val a: App get() = getApplication<App>()

    val settings: StateFlow<AppSettings> = a.settingsStore.settings
        .stateIn(viewModelScope, SharingStarted.Eagerly, AppSettings())

    val tasks: StateFlow<List<TaskRecord>> = a.taskRepository.tasks
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    private val _capabilities = MutableStateFlow<EngineCapabilities?>(null)
    val capabilities: StateFlow<EngineCapabilities?> = _capabilities

    private val _engineError = MutableStateFlow<String?>(null)
    val engineError: StateFlow<String?> = _engineError

    /** Encodable formats (filtered after capability detection to avoid false support). */
    fun encodableFormatIds(): List<String> {
        val caps = _capabilities.value ?: return emptyList()
        return caps.formats.filter { it.canEncode }.map { it.id }
    }

    // ---------- 选择区 ----------

    private val _convertSelection = MutableStateFlow<List<SelectedAudio>>(emptyList())
    val convertSelection: StateFlow<List<SelectedAudio>> = _convertSelection

    private val _trimSelection = MutableStateFlow<List<SelectedAudio>>(emptyList())
    val trimSelection: StateFlow<List<SelectedAudio>> = _trimSelection

    private val _mergeSelection = MutableStateFlow<List<SelectedAudio>>(emptyList())
    val mergeSelection: StateFlow<List<SelectedAudio>> = _mergeSelection

    // ---------- 编码参数（转换页） ----------

    private val _params = MutableStateFlow(defaultParamsFor("mp3"))
    val params: StateFlow<EncodeParams> = _params

    init {
        viewModelScope.launch {
            val s = a.settingsStore.current()
            _params.value = defaultParamsFor(s.defaultFormat).copy(
                bitrateKbps = s.defaultBitrateKbps,
                filenameTemplate = s.filenameTemplate,
            )
            a.taskRepository.load()
            try {
                _capabilities.value = a.ffmpegEngine.ensureInit()
            } catch (t: Throwable) {
                _engineError.value = getApplication<App>().getString(R.string.engine_init_failed, t.message ?: "")
            }
        }
    }

    fun setFormat(formatId: String) {
        val cur = _params.value
        _params.value = defaultParamsFor(formatId, cur.filenameTemplate)
    }

    fun updateParams(transform: (EncodeParams) -> EncodeParams) {
        _params.value = transform(_params.value)
    }

    fun paramErrors(): List<String> = validateParams(_params.value).map { it.resolve(getApplication<App>()) }

    // ---------- 导入 ----------

    /** 导入 SAF 选择的文件：立即显示条目，后台复制到 cache 并 ffprobe 探测真实信息 */
    fun importFiles(target: SelectionTarget, uris: List<Uri>) {
        val flow = when (target) {
            SelectionTarget.CONVERT -> _convertSelection
            SelectionTarget.TRIM -> _trimSelection
            SelectionTarget.MERGE -> _mergeSelection
        }
        uris.forEach { uri ->
            val info = SafUtils.query(getApplication(), uri)
            SafUtils.takePersistableRead(getApplication(), uri)
            val entry = SelectedAudio(
                uri = uri.toString(),
                name = info.name,
                size = info.size,
                state = ImportState.IMPORTING,
            )
            flow.value = flow.value + entry
            viewModelScope.launch {
                try {
                    val local = withContext(Dispatchers.IO) {
                        val dir = File(getApplication<Application>().cacheDir, "imports/${UUID.randomUUID()}")
                        dir.mkdirs()
                        val dest = File(dir, com.audiostudio.app.engine.sanitizeFileName(info.name).ifEmpty { "input" })
                        SafUtils.copyTo(getApplication(), uri, dest)
                        dest
                    }
                    val probe = withContext(Dispatchers.IO) {
                        a.ffmpegEngine.probe(local.absolutePath)
                    }
                    replaceEntry(flow, entry.uri) {
                        it.copy(
                            localPath = local.absolutePath,
                            probe = probe,
                            state = ImportState.READY,
                            size = if (info.size > 0) info.size else (probe.fileSizeBytes ?: 0L),
                        )
                    }
                } catch (t: Throwable) {
                    replaceEntry(flow, entry.uri) {
                        it.copy(state = ImportState.FAILED, error = t.message ?: getApplication<App>().getString(R.string.error_read_file))
                    }
                }
            }
        }
    }

    private fun replaceEntry(
        flow: MutableStateFlow<List<SelectedAudio>>,
        uri: String,
        transform: (SelectedAudio) -> SelectedAudio,
    ) {
        flow.value = flow.value.map { if (it.uri == uri) transform(it) else it }
    }

    fun removeSelection(target: SelectionTarget, uri: String) {
        selectionFlow(target).value = selectionFlow(target).value.filterNot { it.uri == uri }
    }

    fun clearSelection(target: SelectionTarget) {
        selectionFlow(target).value = emptyList()
    }

    /** 调整合并顺序（上移/下移） */
    fun moveSelection(target: SelectionTarget, index: Int, delta: Int) {
        val flow = selectionFlow(target)
        val list = flow.value.toMutableList()
        val j = index + delta
        if (index !in list.indices || j !in list.indices) return
        val item = list.removeAt(index)
        list.add(j, item)
        flow.value = list
    }

    fun selectionFlow(target: SelectionTarget): MutableStateFlow<List<SelectedAudio>> = when (target) {
        SelectionTarget.CONVERT -> _convertSelection
        SelectionTarget.TRIM -> _trimSelection
        SelectionTarget.MERGE -> _mergeSelection
    }

    fun selection(target: SelectionTarget): List<SelectedAudio> = selectionFlow(target).value

    fun allReady(target: SelectionTarget): Boolean {
        val sel = selection(target)
        return sel.isNotEmpty() && sel.all { it.state != ImportState.IMPORTING }
    }

    // ---------- 启动作业 ----------

    fun startConvert(): Int {
        val sel = selection(SelectionTarget.CONVERT).filter { it.ready }
        if (sel.isEmpty()) return 0
        val params = _params.value.copy(filenameTemplate = settings.value.filenameTemplate)
        val probes = sel.mapNotNull { s -> s.probe?.let { s.uri to it } }.toMap()
        val ids = a.convertManager.enqueueConvert(
            sources = sel.map { it.uri to it.name },
            params = params,
            probes = probes,
        )
        _convertSelection.value = emptyList()
        return ids.size
    }

    fun startTrim(startMs: Long, endMs: Long): Boolean {
        val s = selection(SelectionTarget.TRIM).firstOrNull() ?: return false
        if (!s.ready) return false
        val params = _params.value.copy(filenameTemplate = settings.value.filenameTemplate)
        a.convertManager.enqueueTrim(s.uri, s.name, startMs, endMs, params, s.probe)
        _trimSelection.value = emptyList()
        return true
    }

    fun startMerge(gapMs: Int): Boolean {
        val sel = selection(SelectionTarget.MERGE).filter { it.ready }
        if (sel.isEmpty()) return false
        val params = _params.value.copy(filenameTemplate = settings.value.filenameTemplate)
        val probes = sel.mapNotNull { s -> s.probe?.let { s.uri to it } }.toMap()
        a.convertManager.enqueueMerge(
            sources = sel.map { it.uri to it.name },
            gapMs = gapMs,
            params = params,
            probes = probes,
        )
        _mergeSelection.value = emptyList()
        return true
    }

    // ---------- 任务控制 ----------

    fun pause(id: String) = a.convertManager.pause(id)
    fun resume(id: String) = a.convertManager.resume(id)
    fun cancel(id: String) = a.convertManager.cancel(id)
    fun cancelAll() = a.convertManager.cancelAllActive()
    fun retry(task: TaskRecord) = a.convertManager.retry(task)
    fun deleteTask(id: String) = a.convertManager.deleteTask(id)

    // ---------- 设置 ----------

    fun setDefaultFormat(v: String) = viewModelScope.launch { a.settingsStore.setDefaultFormat(v) }
    fun setDefaultBitrate(v: Int) = viewModelScope.launch { a.settingsStore.setDefaultBitrate(v) }
    fun setOutputMode(mode: String, treeUri: String? = null) =
        viewModelScope.launch { a.settingsStore.setOutputMode(mode, treeUri) }
    fun setConcurrency(v: Int) = viewModelScope.launch { a.settingsStore.setConcurrency(v) }
    fun setThemeMode(v: String) = viewModelScope.launch { a.settingsStore.setThemeMode(v) }
    fun setFilenameTemplate(v: String) = viewModelScope.launch { a.settingsStore.setFilenameTemplate(v) }
    fun setAutoCheckUpdates(v: Boolean) = viewModelScope.launch { a.settingsStore.setAutoCheckUpdates(v) }

    private val _updateChecking = MutableStateFlow(false)
    val updateChecking: StateFlow<Boolean> = _updateChecking
    private val _latestRelease = MutableStateFlow<LatestReleaseInfo?>(null)
    val latestRelease: StateFlow<LatestReleaseInfo?> = _latestRelease
    private val _updateMessage = MutableStateFlow<String?>(null)
    val updateMessage: StateFlow<String?> = _updateMessage
    private val _lastUpdateCheckAt = MutableStateFlow<Long?>(UpdateChecker.lastCheckedAt(app))
    val lastUpdateCheckAt: StateFlow<Long?> = _lastUpdateCheckAt

    fun checkUpdates() {
        if (_updateChecking.value) return
        viewModelScope.launch {
            _updateChecking.value = true
            _updateMessage.value = null
            a.updateChecker.checkManually()
                .onSuccess { release ->
                    _lastUpdateCheckAt.value = com.audiostudio.app.updates.UpdateChecker.lastCheckedAt(getApplication())
                    _latestRelease.value = release.takeIf { it.hasUpdate }
                    _updateMessage.value = if (release.hasUpdate) {
                        getApplication<App>().getString(R.string.settings_update_available, release.tagName)
                    } else {
                        getApplication<App>().getString(R.string.settings_update_current)
                    }
                }
                .onFailure {
                    _updateMessage.value = getApplication<App>().getString(R.string.settings_update_failed)
                }
            _updateChecking.value = false
        }
    }

    fun clearFinished() {
        viewModelScope.launch {
            tasks.value.filter { it.status.isTerminal }.forEach { a.taskRepository.delete(it.id) }
        }
    }
}
