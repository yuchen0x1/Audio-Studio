package com.audiostudio.app

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.audiostudio.app.engine.FfmpegEngine
import com.audiostudio.app.engine.buildConvertArgs
import com.audiostudio.app.engine.buildTrimArgs
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
 * FFmpeg 冒烟测试（真机/模拟器上执行）：
 * 1) ffmpeg 二进制加载 + 能力检测（-encoders）
 * 2) 生成 WAV → 转 MP3，校验真实进度与输出
 * 3) 裁剪输出侧 -ss/-t 语义
 */
@RunWith(AndroidJUnit4::class)
class FfmpegSmokeTest {

    private lateinit var context: Context
    private val engine = FfmpegEngine()

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
    }

    /** 生成 1 秒 440Hz 正弦波 16bit 单声道 WAV（真实 PCM 数据，不依赖 lavfi） */
    private fun writeSineWav(file: File, seconds: Double = 1.0, sampleRate: Int = 44100): Int {
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
        return n
    }

    @Test
    fun ffmpegLoadsAndCapabilitiesDetectable() {
        val caps = runBlocking { engine.ensureInit() }
        assertTrue("ffmpeg 版本应可读: ${caps.ffmpegVersion}", caps.ffmpegVersion.isNotBlank())
        assertTrue("audio 变体应含 libmp3lame", "libmp3lame" in caps.encoders)
        assertTrue("应含 flac 编码器", "flac" in caps.encoders)
        assertTrue("应含 libopus 编码器", "libopus" in caps.encoders)
        val mp3 = caps.formats.first { it.id == "mp3" }
        assertTrue("mp3 必须可编码", mp3.canEncode)
        assertEquals("libmp3lame", mp3.encoder)
    }

    @Test
    fun wavToMp3WithRealProgress() {
        runBlocking { engine.ensureInit() }
        val inWav = File(context.cacheDir, "smoke_in.wav").apply { delete() }
        writeSineWav(inWav)
        assertTrue(inWav.exists() && inWav.length() > 44_000)

        val outDir = File(context.cacheDir, "smoke_out").apply { mkdirs() }
        val outName = "smoke_in_mp3.mp3"
        File(outDir, outName).delete()

        val args = buildConvertArgs(
            inWav.absolutePath,
            defaultParamsFor("mp3").copy(bitrateKbps = 128),
            outDir.absolutePath,
            outName,
        )
        val progresses = mutableListOf<Double>()
        val outcome = runBlocking {
            engine.run(
                taskId = "smoke-convert",
                args = args,
                onSession = {},
                onProgress = { processed, _ -> progresses.add(processed) },
            )
        }
        assertEquals("ffmpeg 退出码应为 0，stderr=${outcome.output.takeLast(500)}", 0, outcome.returnCode)

        val outFile = File(outDir, outName)
        assertTrue("应产生输出文件", outFile.exists() && outFile.length() > 0)

        // 真实进度：statistics.time 应随处理增长
        assertTrue("应收到进度回调", progresses.isNotEmpty())
        val last = progresses.max()
        assertTrue("1s 音频的 processed 应 >500ms，实际=$last", last > 500.0)
        assertEquals("进度应单调不减", progresses, progresses.sorted())

        // ffprobe 校验输出
        val probe = runBlocking { engine.probe(outFile.absolutePath) }
        assertEquals("mp3", probe.codec)
        assertNotNull("mp3 应有时长", probe.durationMs)
        val dur = probe.durationMs!!
        assertTrue("时长应约 1s，实际=${dur}ms", dur in 700..1300)
    }

    @Test
    fun trimUsesOutputSideSeek() {
        runBlocking { engine.ensureInit() }
        val inWav = File(context.cacheDir, "smoke_trim.wav").apply { delete() }
        writeSineWav(inWav, seconds = 1.0)

        val outDir = File(context.cacheDir, "smoke_out").apply { mkdirs() }
        val outName = "clip_500ms.wav"
        File(outDir, outName).delete()

        // 裁剪 200ms ~ 700ms（输出侧 -ss/-t，500ms）
        val args = buildTrimArgs(
            inWav.absolutePath,
            200,
            700,
            defaultParamsFor("wav"),
            outDir.absolutePath,
            outName,
        )
        val outcome = runBlocking {
            engine.run(taskId = "smoke-trim", args = args, onSession = {}, onProgress = { _, _ -> })
        }
        assertEquals("stderr=${outcome.output.takeLast(500)}", 0, outcome.returnCode)

        val outFile = File(outDir, outName)
        assertTrue(outFile.exists() && outFile.length() > 0)
        val probe = runBlocking { engine.probe(outFile.absolutePath) }
        assertNotNull(probe.durationMs)
        val dur = probe.durationMs!!
        assertTrue("裁剪输出应约 500ms，实际=${dur}ms", dur in 350..650)
    }
}
