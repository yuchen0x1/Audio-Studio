package com.audiostudio.app

import android.app.Application
import com.audiostudio.app.data.SettingsStore
import com.audiostudio.app.data.TaskRepository
import com.audiostudio.app.engine.ConvertManager
import com.audiostudio.app.engine.FfmpegEngine
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class App : Application() {

    lateinit var settingsStore: SettingsStore
        private set
    lateinit var taskRepository: TaskRepository
        private set
    lateinit var ffmpegEngine: FfmpegEngine
        private set
    lateinit var convertManager: ConvertManager
        private set

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        settingsStore = SettingsStore(this)
        taskRepository = TaskRepository(this)
        ffmpegEngine = FfmpegEngine()
        convertManager = ConvertManager(this, taskRepository, settingsStore, ffmpegEngine)

        // 恢复任务记录；有遗留排队任务则继续执行
        appScope.launch {
            taskRepository.load()
            if (taskRepository.tasks.value.any { it.status.isActive }) {
                convertManager.ensureWorkers()
                convertManager.startService()
            }
        }
    }
}
