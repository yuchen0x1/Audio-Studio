package com.audiostudio.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.audiostudio.app.App
import com.audiostudio.app.MainActivity
import com.audiostudio.app.R
import com.audiostudio.app.data.TaskStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * 前台服务：转换在其中执行，通知实时显示进度，支持从通知取消。
 * 进程被杀后任务记录仍在 DataStore，重开 App 可恢复展示。
 */
class ConvertService : android.app.Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var cancelReceiver: CancelReceiver? = null

    inner class CancelReceiver : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            (application as App).convertManager.cancelAllActive()
        }
    }

    override fun onCreate() {
        super.onCreate()
        createChannel()
        startInForeground()
        cancelReceiver = CancelReceiver().also {
            ContextCompat.registerReceiver(
                this,
                it,
                IntentFilter(ACTION_CANCEL),
                ContextCompat.RECEIVER_NOT_EXPORTED,
            )
        }
        val app = application as App
        scope.launch {
            app.taskRepository.tasks.collect { tasks ->
                val active = tasks.filter { it.status.isActive }
                if (active.isEmpty()) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                } else {
                    notifyProgress(active)
                }
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // 有任务在跑就确保工作协程与引擎初始化
        val app = application as App
        app.convertManager.ensureWorkers()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        cancelReceiver?.let {
            try {
                unregisterReceiver(it)
            } catch (_: Throwable) {
            }
        }
        cancelReceiver = null
        scope.cancel()
        super.onDestroy()
    }

    private fun startInForeground() {
        val notification = baseNotification(getString(R.string.notif_preparing), null, 0)
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun notifyProgress(active: List<com.audiostudio.app.data.TaskRecord>) {
        val running = active.filter { it.status == TaskStatus.RUNNING || it.status == TaskStatus.PAUSED }
        val current = running.maxByOrNull { it.updatedAt } ?: active.maxByOrNull { it.updatedAt } ?: return
        val statusText = getString(current.status.labelRes)
        val text = buildString {
            append(statusText)
            append(" · ")
            append(current.outputName ?: current.sourceName)
            val others = active.size - 1
            if (others > 0) append(getString(R.string.notif_tasks_suffix, active.size))
        }
        val progress = (current.progress * 100).toInt().coerceIn(0, 100)
        val indeterminate = current.status == TaskStatus.PREPARING || current.status == TaskStatus.QUEUED
        val notification = baseNotification(text, if (indeterminate) null else progress, if (indeterminate) -1 else 100)
        notificationManager().notify(NOTIFICATION_ID, notification)
    }

    private fun baseNotification(text: String, progress: Int?, max: Int): Notification {
        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val cancelIntent = PendingIntent.getBroadcast(
            this, 1,
            Intent(ACTION_CANCEL).setPackage(packageName),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(text)
            .setContentIntent(openIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(0, getString(R.string.notif_cancel_all), cancelIntent)
        if (progress != null && max > 0) {
            builder.setProgress(max, progress, false)
        } else {
            builder.setProgress(0, 0, true)
        }
        return builder.build()
    }

    private fun notificationManager(): NotificationManager =
        getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notif_channel_name),
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = getString(R.string.notif_channel_desc)
                setShowBadge(false)
            }
            notificationManager().createNotificationChannel(channel)
        }
    }

    companion object {
        const val CHANNEL_ID = "convert_progress"
        const val NOTIFICATION_ID = 42
        const val ACTION_CANCEL = "com.audiostudio.app.action.CANCEL_ALL"
    }
}
