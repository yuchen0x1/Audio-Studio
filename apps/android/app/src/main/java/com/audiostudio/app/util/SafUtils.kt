package com.audiostudio.app.util

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File

/** SAF 相关工具：只访问用户主动选择的 uri（不扫描全盘） */
object SafUtils {

    data class PickedFile(val uri: Uri, val name: String, val size: Long)

    /** 尽力取得持久化读权限（用于历史"重新执行"） */
    fun takePersistableRead(context: Context, uri: Uri) {
        try {
            context.contentResolver.takePersistableUriPermission(
                uri,
                android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION,
            )
        } catch (_: SecurityException) {
            // 部分 provider 不支持持久化，忽略（本次会话内仍可读）
        } catch (_: Throwable) {
        }
    }

    /** 查询显示名与大小 */
    fun query(context: Context, uri: Uri): PickedFile {
        var name = uri.lastPathSegment ?: "unknown"
        var size = 0L
        try {
            context.contentResolver.query(uri, null, null, null, null)?.use { c ->
                val nameIdx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val sizeIdx = c.getColumnIndex(OpenableColumns.SIZE)
                if (c.moveToFirst()) {
                    if (nameIdx >= 0 && !c.isNull(nameIdx)) name = c.getString(nameIdx) ?: name
                    if (sizeIdx >= 0 && !c.isNull(sizeIdx)) size = c.getLong(sizeIdx)
                }
            }
        } catch (_: Throwable) {
        }
        if (size <= 0) size = queryFileSize(context, uri)
        return PickedFile(uri, name, size)
    }

    private fun queryFileSize(context: Context, uri: Uri): Long {
        return try {
            if (uri.scheme == ContentResolver.SCHEME_FILE) {
                uri.path?.let { File(it).length() } ?: 0L
            } else {
                context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: 0L
            }
        } catch (_: Throwable) {
            0L
        }
    }

    /** 把 SAF uri 内容复制到本地文件，返回复制字节数 */
    fun copyTo(context: Context, uri: Uri, dest: File): Long {
        dest.parentFile?.mkdirs()
        val input = context.contentResolver.openInputStream(uri)
            ?: throw IllegalStateException("无法打开文件: $uri")
        input.use { ins ->
            dest.outputStream().use { outs ->
                ins.copyTo(outs)
            }
        }
        return dest.length()
    }

    fun mimeOf(fileName: String): String {
        val ext = fileName.substringAfterLast('.', "").lowercase()
        return when (ext) {
            "mp3" -> "audio/mpeg"
            "wav" -> "audio/wav"
            "flac" -> "audio/flac"
            "aac" -> "audio/aac"
            "m4a" -> "audio/mp4"
            "ogg", "oga" -> "audio/ogg"
            "opus" -> "audio/opus"
            "wma" -> "audio/x-ms-wma"
            "aiff", "aif" -> "audio/aiff"
            "ape" -> "audio/x-ape"
            "ac3" -> "audio/ac3"
            "amr" -> "audio/amr"
            else -> "audio/*"
        }
    }
}
