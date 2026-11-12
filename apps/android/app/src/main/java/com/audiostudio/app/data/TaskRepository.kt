package com.audiostudio.app.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.audiostudio.app.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

private val Context.taskStore by preferencesDataStore(name = "audio_studio_tasks")

/**
 * 任务记录仓库：内存 StateFlow + DataStore(JSON) 持久化。
 * 进度类高频更新只改内存；状态类更新立即落盘（进程被杀后可恢复）。
 */
class TaskRepository(private val context: Context) {

    private val key = stringPreferencesKey("tasks_json")
    private val mutex = Mutex()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _tasks = MutableStateFlow<List<TaskRecord>>(emptyList())
    val tasks: StateFlow<List<TaskRecord>> = _tasks

    @Volatile
    var loaded = false
        private set

    /** 异步加载（App 启动时调用） */
    fun loadAsync() {
        scope.launch { load() }
    }

    suspend fun load() {
        if (loaded) return
        mutex.withLock {
            if (loaded) return
            val prefs = context.taskStore.data.first()
            val raw = prefs[key]
            val list = raw?.let { tasksFromJson(it) } ?: emptyList()
            // 进程被杀后遗留的中间态：标记为失败（记录保留，可重试）
            val now = System.currentTimeMillis()
            val restored = list.map { t ->
                if (t.status == TaskStatus.RUNNING || t.status == TaskStatus.PREPARING) {
                    t.copy(
                        status = TaskStatus.FAILED,
                        updatedAt = now,
                        finishedAt = now,
                        errorCode = "E_TIMEOUT",
                        errorMessage = context.getString(R.string.error_process_killed),
                        progress = 0f,
                        speed = null,
                    )
                } else t
            }
            _tasks.value = restored.sortedByDescending { it.createdAt }
            if (restored.any { it.status == TaskStatus.RUNNING || it.status == TaskStatus.PREPARING }) {
                persistLocked(restored)
            }
            loaded = true
        }
    }

    private suspend fun persistLocked(list: List<TaskRecord>) {
        context.taskStore.edit { it[key] = tasksToJson(list) }
    }

    private suspend fun persist() {
        persistLocked(_tasks.value)
    }

    fun get(id: String): TaskRecord? = _tasks.value.firstOrNull { it.id == id }

    /** 状态类更新（立即持久化） */
    suspend fun upsert(task: TaskRecord) {
        mutex.withLock {
            val cur = _tasks.value
            val idx = cur.indexOfFirst { it.id == task.id }
            val next = if (idx >= 0) cur.toMutableList().also { it[idx] = task } else listOf(task) + cur
            _tasks.value = next.sortedByDescending { it.createdAt }
            persistLocked(next)
        }
    }

    suspend fun upsertAll(tasks: List<TaskRecord>) {
        if (tasks.isEmpty()) return
        mutex.withLock {
            val cur = _tasks.value.toMutableList()
            for (t in tasks) {
                val idx = cur.indexOfFirst { it.id == t.id }
                if (idx >= 0) cur[idx] = t else cur.add(0, t)
            }
            val next = cur.sortedByDescending { it.createdAt }
            _tasks.value = next
            persistLocked(next)
        }
    }

    /** 仅更新进度（不落盘，避免高频写）；终态任务不回退 */
    fun updateProgress(id: String, progress: Float, processedMs: Long, speed: Double?) {
        val cur = _tasks.value
        val idx = cur.indexOfFirst { it.id == id }
        if (idx < 0) return
        val t = cur[idx]
        if (t.status.isTerminal) return
        if (t.progress == progress && t.processedMs == processedMs && t.speed == speed) return
        val next = cur.toMutableList().also {
            it[idx] = t.copy(progress = progress, processedMs = processedMs, speed = speed)
        }
        _tasks.value = next
    }

    /** 内存内修改（状态以外的字段），可选持久化 */
    suspend fun mutate(id: String, persist: Boolean = true, transform: (TaskRecord) -> TaskRecord) {
        mutex.withLock {
            val cur = _tasks.value
            val idx = cur.indexOfFirst { it.id == id }
            if (idx < 0) return
            val next = cur.toMutableList().also { it[idx] = transform(it[idx]) }
            _tasks.value = next
            if (persist) persistLocked(next)
        }
    }

    suspend fun delete(id: String) {
        mutex.withLock {
            val next = _tasks.value.filterNot { it.id == id }
            _tasks.value = next
            persistLocked(next)
        }
    }

    suspend fun deleteAll() {
        mutex.withLock {
            _tasks.value = emptyList()
            persistLocked(emptyList())
        }
    }

    /** 取下一个排队中的任务（按创建时间升序） */
    fun nextQueued(): TaskRecord? =
        _tasks.value.filter { it.status == TaskStatus.QUEUED }.minByOrNull { it.createdAt }

    fun activeCount(): Int = _tasks.value.count { it.status.isActive }

    fun runningCount(): Int =
        _tasks.value.count { it.status == TaskStatus.RUNNING || it.status == TaskStatus.PREPARING }
}
