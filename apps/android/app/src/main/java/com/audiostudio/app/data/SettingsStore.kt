package com.audiostudio.app.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.audiostudio.app.engine.DEFAULT_FILENAME_TEMPLATE
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import org.json.JSONObject

private val Context.dataStore by preferencesDataStore(name = "audio_studio_settings")

data class AppSettings(
    val defaultFormat: String = "mp3",
    val defaultBitrateKbps: Int = 192,
    /** downloads = MediaStore Downloads/AudioStudio；tree = 用户选定目录 */
    val outputMode: String = "downloads",
    val outputTreeUri: String = "",
    val concurrency: Int = 2,
    /** dark = 强制深色（默认，符合深色科技风设计）；system = 深色跟随系统 */
    val themeMode: String = "dark",
    val filenameTemplate: String = DEFAULT_FILENAME_TEMPLATE,
    val autoCheckUpdates: Boolean = true,
) {
    companion object {
        fun fromJson(s: String): AppSettings = try {
            val o = JSONObject(s)
            AppSettings(
                defaultFormat = o.optString("defaultFormat", "mp3"),
                defaultBitrateKbps = o.optInt("defaultBitrateKbps", 192),
                outputMode = o.optString("outputMode", "downloads"),
                outputTreeUri = o.optString("outputTreeUri", ""),
                concurrency = o.optInt("concurrency", 2).coerceIn(1, 4),
                themeMode = o.optString("themeMode", "system"),
                filenameTemplate = o.optString("filenameTemplate", DEFAULT_FILENAME_TEMPLATE),
                autoCheckUpdates = o.optBoolean("autoCheckUpdates", true),
            )
        } catch (t: Throwable) {
            AppSettings()
        }
    }
}

fun settingsToJson(s: AppSettings): String = JSONObject().apply {
    put("defaultFormat", s.defaultFormat)
    put("defaultBitrateKbps", s.defaultBitrateKbps)
    put("outputMode", s.outputMode)
    put("outputTreeUri", s.outputTreeUri)
    put("concurrency", s.concurrency)
    put("themeMode", s.themeMode)
    put("filenameTemplate", s.filenameTemplate)
    put("autoCheckUpdates", s.autoCheckUpdates)
}.toString()

class SettingsStore(private val context: Context) {

    private val key = stringPreferencesKey("settings_json")

    val settings: Flow<AppSettings> = context.dataStore.data.map { prefs ->
        prefs[key]?.let { AppSettings.fromJson(it) } ?: AppSettings()
    }

    suspend fun current(): AppSettings = settings.first()

    suspend fun update(transform: (AppSettings) -> AppSettings) {
        context.dataStore.edit { prefs ->
            val cur = prefs[key]?.let { AppSettings.fromJson(it) } ?: AppSettings()
            prefs[key] = settingsToJson(transform(cur))
        }
    }

    suspend fun setDefaultFormat(v: String) = update { it.copy(defaultFormat = v) }
    suspend fun setDefaultBitrate(v: Int) = update { it.copy(defaultBitrateKbps = v) }
    suspend fun setOutputMode(mode: String, treeUri: String? = null) = update {
        it.copy(
            outputMode = mode,
            outputTreeUri = treeUri ?: it.outputTreeUri,
        )
    }
    suspend fun setConcurrency(v: Int) = update { it.copy(concurrency = v.coerceIn(1, 4)) }
    suspend fun setThemeMode(v: String) = update { it.copy(themeMode = v) }
    suspend fun setFilenameTemplate(v: String) = update { it.copy(filenameTemplate = v) }
    suspend fun setAutoCheckUpdates(v: Boolean) = update { it.copy(autoCheckUpdates = v) }
}
