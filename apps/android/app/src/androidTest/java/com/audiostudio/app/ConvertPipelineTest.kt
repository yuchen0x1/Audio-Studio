package com.audiostudio.app

import android.content.Context
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.audiostudio.app.data.AppSettings
import com.audiostudio.app.data.SettingsStore
import com.audiostudio.app.data.TaskRepository
import com.audiostudio.app.data.TaskStatus
import com.audiostudio.app.engine.ConvertManager
import com.audiostudio.app.engine.FfmpegEngine
import com.audiostudio.app.engine.defaultParamsFor
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.BufferedOutputStream
import java.io.DataOutputStream
import java.io.File
import java.io.FileOutputStream
import kotlin.math.sin

/**
 * 端到端流水线测试（真机/模拟器）：
 * SAF 文件 → 任务入队 → 队列执行（preparing/running 状态机 + 真实进度）
 * → 输出发布到 MediaStore Downloads/AudioStudio → COMPLETED。
 */
@RunWith(AndroidJUnit4::class)
class ConvertPipelineTest {

    private lateinit var context: Context
    private lateinit var repo: TaskRepository
    private lateinit var manager: ConvertManager

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        val app = context as App
        repo = app.taskRepository
        manager = app.convertManager
        runBlocking { repo.load() }
    }

    private fun writeSineWav(file: File, seconds: Double = 1.0, sampleRate: Int = 44100) {
        val n = (seconds * sampleRate).toInt()
        val dataSize = n * 2
        DataOutputStream(BufferedOutputStream(FileOutputStream(file))).use { out ->
            fun le32(v: Int) {
                out.write(v and 0xFF); out.write((v shr 8) and 0xFF)
                out.write((v shr 16) and 0xFF); out.write((v shr 24) and 0xFF)
            }
            fun le16(v: Int) {
                out.write(v and 0xFF); out.write((v shr 8) and 0xFF)
            }
            out.writeBytes("RIFF"); le32(36 + dataSize); out.writeBytes("WAVE")
            out.writeBytes("fmt "); le32(16); le16(1); le16(1)
            le32(sampleRate); le32(sampleRate * 2); le16(2); le16(16)
            out.writeBytes("data"); le32(dataSize)
            for (i in 0 until n) {
                val v = (sin(2.0 * Math.PI * 440.0 * i / sampleRate) * 12000.0).toInt()
                le16(v)
            }
        }
    }

    @Test
    fun queuePipelineConvertsAndPublishesToMediaStore() {
        val inWav = File(context.cacheDir, "pipe_in.wav").apply { delete() }
        writeSineWav(inWav, seconds = 1.0)

        val uri = Uri.fromFile(inWav).toString()
        val ids = manager.enqueueConvert(
            sources = listOf(uri to "pipe_in.wav"),
            params = defaultParamsFor("mp3").copy(bitrateKbps = 128, filenameTemplate = "{name}_{format}"),
        )
        assertEquals(1, ids.size)
        val taskId = ids.first()

        // 轮询等待任务进入终态（默认并发 2，超时 90s）
        var last = repo.get(taskId)
        val deadline = System.currentTimeMillis() + 90_000
        while (System.currentTimeMillis() < deadline) {
            last = repo.get(taskId)
            if (last?.status?.isTerminal == true) break
            Thread.sleep(300)
        }
        last = repo.get(taskId)

        assertEquals(
            "任务应完成，实际状态=${last?.status} err=${last?.errorMessage} detail=${last?.errorDetail}",
            TaskStatus.COMPLETED,
            last?.status,
        )
        assertNotNull("应有输出 uri", last?.outputUri)
        assertEquals(1f, last?.progress ?: 0f, 0.001f)
        assertEquals("Download/AudioStudio/pipe_in_mp3.mp3", last?.outputPath)
        assertTrue(last?.outputName == "pipe_in_mp3.mp3")
        // 输出必须真实存在（MediaStore）
        val size = runBlocking {
            context.contentResolver.openInputStream(Uri.parse(last!!.outputUri!!))?.use { it.readBytes().size }
                ?: 0
        }
        assertTrue("MediaStore 输出应非空，实际=$size", size > 1000)
    }

    @Test
    fun cancelQueuedTaskKeepsRecordAndMarksCancelled() {
        val app = context as App
        val inWav = File(context.cacheDir, "pipe_cancel.wav").apply { delete() }
        writeSineWav(inWav, seconds = 2.0)

        runBlocking { app.settingsStore.setConcurrency(1) }
        try {
            val params = defaultParamsFor("wav")
            val ids = manager.enqueueConvert(
                sources = listOf(
                    Uri.fromFile(inWav).toString() to "pipe_cancel.wav",
                    Uri.fromFile(inWav).toString() to "pipe_cancel2.wav",
                ),
                params = params,
            )
            val victim = ids[1]
            Thread.sleep(150) // 让第 1 个任务先占住唯一的并发槽，victim 保持 queued
            manager.cancel(victim)
            val deadline = System.currentTimeMillis() + 30_000
            while (System.currentTimeMillis() < deadline) {
                val s = repo.get(victim)?.status
                if (s == TaskStatus.CANCELLED) break
                Thread.sleep(200)
            }
            assertEquals(TaskStatus.CANCELLED, repo.get(victim)?.status)
            ids.forEach { manager.deleteTask(it) }
        } finally {
            runBlocking { app.settingsStore.setConcurrency(2) }
        }
    }
}
