package com.audiostudio.app.updates

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.audiostudio.app.R
import com.audiostudio.app.data.SettingsStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

private const val RELEASES_API = "https://api.github.com/repos/yuchen0x1/Audio-Studio/releases/latest"
private const val RELEASES_URL = "https://github.com/yuchen0x1/Audio-Studio/releases"
private const val REPOSITORY_URL = "https://github.com/yuchen0x1/Audio-Studio"
private const val CHECKED_AT_KEY = "update_last_checked_at"
private const val NOTIFIED_TAG_KEY = "update_last_notified_tag"
private const val CHECK_INTERVAL_MS = 24L * 60 * 60 * 1000

private data class LatestRelease(
    val tagName: String,
    val url: String,
    val body: String,
    val publishedAt: String?,
    val assets: List<ReleaseAsset>,
    val hasUpdate: Boolean,
)

data class ReleaseAsset(
    val name: String,
    val sizeBytes: Long?,
    val downloadUrl: String,
)

class UpdateChecker(
    private val context: Context,
    private val settingsStore: SettingsStore,
) {
    suspend fun checkManually(): Result<LatestReleaseInfo> = withContext(Dispatchers.IO) {
        runCatching {
            val release = fetchLatestRelease()
            recordCheck()
            if (release.hasUpdate) notifyIfNew(release)
            LatestReleaseInfo(
                tagName = release.tagName,
                url = release.url,
                body = release.body,
                publishedAt = release.publishedAt,
                assets = release.assets,
                hasUpdate = release.hasUpdate,
            )
        }
    }

    /**
     * Checks once on launch and then no more than once every 24 hours while the app is running.
     * Errors from background checks are deliberately silent; the Settings screen exposes retries.
     */
    suspend fun checkAutomaticallyIfDue() = withContext(Dispatchers.IO) {
        if (!settingsStore.current().autoCheckUpdates) return@withContext
        val prefs = context.getSharedPreferences("audio_studio_update", Context.MODE_PRIVATE)
        val previous = prefs.getLong(CHECKED_AT_KEY, 0L)
        if (System.currentTimeMillis() - previous < CHECK_INTERVAL_MS) return@withContext
        runCatching {
            val release = fetchLatestRelease()
            recordCheck()
            if (release.hasUpdate) notifyIfNew(release)
        }
    }

    private fun recordCheck() {
        context.getSharedPreferences("audio_studio_update", Context.MODE_PRIVATE)
            .edit()
            .putLong(CHECKED_AT_KEY, System.currentTimeMillis())
            .apply()
    }

    private fun fetchLatestRelease(): LatestRelease {
        val connection = URL(RELEASES_API).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "GET"
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            connection.setRequestProperty("Accept", "application/vnd.github+json")
            connection.setRequestProperty("User-Agent", "Audio-Studio-Android")
            val status = connection.responseCode
            if (status !in 200..299) error("GitHub API HTTP $status")
            val json = connection.inputStream.bufferedReader().use { JSONObject(it.readText()) }
            val tag = json.optString("tag_name").takeIf { it.isNotBlank() } ?: error("Release tag missing")
            val releaseUrl = json.optString("html_url").takeIf { it.startsWith("https://github.com/") }
                ?: RELEASES_URL
            @Suppress("DEPRECATION")
            val current = context.packageManager.getPackageInfo(context.packageName, 0).versionName.orEmpty()
            return LatestRelease(
                tagName = tag,
                url = releaseUrl,
                body = json.optString("body"),
                publishedAt = json.optString("published_at").takeIf { it.isNotBlank() },
                assets = parseAssets(json.optJSONArray("assets")),
                hasUpdate = isNewerVersion(tag, current),
            )
        } finally {
            connection.disconnect()
        }
    }

    private fun notifyIfNew(release: LatestRelease) {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val prefs = context.getSharedPreferences("audio_studio_update", Context.MODE_PRIVATE)
        if (prefs.getString(NOTIFIED_TAG_KEY, null) == release.tagName) return
        prefs.edit().putString(NOTIFIED_TAG_KEY, release.tagName).apply()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(
                NotificationChannel(
                    "app_updates",
                    context.getString(R.string.settings_update_notification_channel),
                    NotificationManager.IMPORTANCE_DEFAULT,
                ).apply {
                    description = context.getString(R.string.settings_update_notification_desc)
                },
            )
        }
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(release.url))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val notification = NotificationCompat.Builder(context, "app_updates")
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle(context.getString(R.string.settings_update_notification_title))
            .setContentText(context.getString(R.string.settings_update_available, release.tagName))
            .setStyle(NotificationCompat.BigTextStyle().bigText(context.getString(R.string.settings_update_available, release.tagName)))
            .setAutoCancel(true)
            .setContentIntent(
                android.app.PendingIntent.getActivity(
                    context,
                    2317,
                    intent,
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE,
                ),
            )
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(2317, notification) }
    }

    companion object {
        const val RELEASES_PAGE = RELEASES_URL
        const val REPOSITORY_PAGE = REPOSITORY_URL

        fun lastCheckedAt(context: Context): Long? {
            val checked = context.getSharedPreferences("audio_studio_update", Context.MODE_PRIVATE)
                .getLong(CHECKED_AT_KEY, 0L)
            return checked.takeIf { it > 0 }
        }

        fun timeAgo(context: Context, checkedAt: Long?): String {
            if (checkedAt == null) return context.getString(R.string.settings_update_never_checked)
            val elapsedMinutes = TimeUnit.MILLISECONDS.toMinutes((System.currentTimeMillis() - checkedAt).coerceAtLeast(0L))
            return when {
                elapsedMinutes < 1 -> context.getString(R.string.settings_update_last_checked, "刚刚")
                elapsedMinutes < 60 -> context.getString(R.string.settings_update_last_checked, "$elapsedMinutes 分钟前")
                elapsedMinutes < 24 * 60 -> context.getString(R.string.settings_update_last_checked, "${elapsedMinutes / 60} 小时前")
                else -> context.getString(R.string.settings_update_last_checked, "${elapsedMinutes / (24 * 60)} 天前")
            }
        }

        fun isNewerVersion(candidate: String, current: String): Boolean {
            val next = parseVersion(candidate) ?: return false
            val installed = parseVersion(current) ?: return false
            for (index in 0 until maxOf(next.first.size, installed.first.size)) {
                val diff = (next.first.getOrElse(index) { 0L } - installed.first.getOrElse(index) { 0L })
                if (diff != 0L) return diff > 0
            }
            val nextPre = next.second
            val installedPre = installed.second
            if (nextPre == null) return installedPre != null
            if (installedPre == null) return false
            for (index in 0 until maxOf(nextPre.size, installedPre.size)) {
                val a = nextPre.getOrNull(index) ?: return false
                val b = installedPre.getOrNull(index) ?: return true
                if (a == b) continue
                val aNum = a.toLongOrNull()
                val bNum = b.toLongOrNull()
                if (aNum != null && bNum != null) return aNum > bNum
                if (aNum != null) return true
                if (bNum != null) return false
                return a > b
            }
            return false
        }

        private fun parseAssets(array: org.json.JSONArray?): List<ReleaseAsset> {
            if (array == null) return emptyList()
            return buildList {
                for (index in 0 until array.length()) {
                    val item = array.optJSONObject(index) ?: continue
                    val name = item.optString("name").trim()
                    val downloadUrl = item.optString("browser_download_url")
                    if (name.isBlank() || !downloadUrl.startsWith("https://github.com/")) continue
                    val size = item.optLong("size", -1L).takeIf { it >= 0L }
                    add(ReleaseAsset(name, size, downloadUrl))
                }
            }
        }

        private fun parseVersion(raw: String): Pair<List<Long>, List<String>?>? {
            val match = Regex("^v?(\\d+(?:\\.\\d+)*)(?:-([0-9A-Za-z.-]+))?(?:\\+[0-9A-Za-z.-]+)?$").matchEntire(raw.trim())
                ?: return null
            val numbers = match.groupValues[1].split('.').map { it.toLongOrNull() ?: return null }
            val pre = match.groupValues[2].takeIf { it.isNotEmpty() }?.split('.')
            return numbers to pre
        }
    }
}

data class LatestReleaseInfo(
    val tagName: String,
    val url: String,
    val body: String,
    val hasUpdate: Boolean,
    val publishedAt: String? = null,
    val assets: List<ReleaseAsset> = emptyList(),
)
