package com.audiostudio.app.util

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import java.io.File

/**
 * 输出发布：
 * - downloads 模式 → MediaStore Downloads/AudioStudio/
 * - tree 模式 → 用户通过 SAF 选定的目录
 * ffmpeg 先写入应用 cache（需要真实路径），成功后再发布，失败不破坏源文件。
 */
object MediaStoreWriter {

    const val SUB_DIR = "AudioStudio"

    /** 发布到 MediaStore Downloads，返回 content uri */
    fun publishToDownloads(context: Context, file: File, displayName: String): Uri {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, displayName)
            put(MediaStore.Downloads.MIME_TYPE, SafUtils.mimeOf(displayName))
            put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + SUB_DIR)
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: throw IllegalStateException("无法在下载目录创建文件（MediaStore 拒绝）")
        try {
            resolver.openOutputStream(uri)?.use { out ->
                file.inputStream().use { it.copyTo(out) }
            } ?: throw IllegalStateException("无法写入下载目录")
        } catch (t: Throwable) {
            runCatching { resolver.delete(uri, null, null) }
            throw t
        }
        values.clear()
        values.put(MediaStore.Downloads.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
        return uri
    }

    /** 发布到用户选定的目录（SAF tree uri），返回文档 uri */
    fun publishToTree(context: Context, treeUri: Uri, file: File, displayName: String): Uri {
        val docId = DocumentsContract.getTreeDocumentId(treeUri)
        val mime = SafUtils.mimeOf(displayName)
        var target = try {
            DocumentsContract.createDocument(context.contentResolver, treeUri, mime, displayName)
        } catch (t: Throwable) {
            null
        }
        if (target == null) {
            // 重名/异常 → 加序号重试
            val dot = displayName.lastIndexOf('.')
            val stem = if (dot > 0) displayName.substring(0, dot) else displayName
            val ext = if (dot > 0) displayName.substring(dot) else ""
            for (i in 1..99) {
                target = try {
                    DocumentsContract.createDocument(
                        context.contentResolver, treeUri, mime, "$stem ($i)$ext",
                    )
                } catch (t: Throwable) {
                    null
                }
                if (target != null) break
            }
        }
        target ?: throw IllegalStateException("无法在选定目录创建文件")

        try {
            context.contentResolver.openOutputStream(target)?.use { out ->
                file.inputStream().use { it.copyTo(out) }
            } ?: throw IllegalStateException("无法写入选定目录")
        } catch (t: Throwable) {
            runCatching { DocumentsContract.deleteDocument(context.contentResolver, target) }
            throw t
        }
        return target
    }

    /** 按设置发布 */
    fun publish(context: Context, file: File, displayName: String, mode: String, treeUri: String): Uri {
        return if (mode == "tree" && treeUri.isNotEmpty()) {
            publishToTree(context, Uri.parse(treeUri), file, displayName)
        } else {
            publishToDownloads(context, file, displayName)
        }
    }

    /** 删除已发布的输出（历史清理用） */
    fun deletePublished(context: Context, uri: String): Boolean {
        return try {
            val u = Uri.parse(uri)
            when (u.scheme) {
                android.content.ContentResolver.SCHEME_CONTENT -> {
                    if (DocumentsContract.isDocumentUri(context, u)) {
                        DocumentsContract.deleteDocument(context.contentResolver, u) != false
                    } else {
                        context.contentResolver.delete(u, null, null) > 0
                    }
                }
                else -> false
            }
        } catch (t: Throwable) {
            false
        }
    }
}
