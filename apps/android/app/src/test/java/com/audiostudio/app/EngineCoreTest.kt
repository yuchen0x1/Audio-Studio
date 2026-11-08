package com.audiostudio.app

import com.audiostudio.app.engine.EngineErrorCode
import com.audiostudio.app.engine.FfmpegEngine
import com.audiostudio.app.engine.classifyEngineOutput
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ErrorClassifyTest {

    @Test
    fun `损坏文件映射到 corrupt`() {
        assertEquals(
            EngineErrorCode.E_CORRUPT_FILE,
            classifyEngineOutput("Invalid data found when processing input"),
        )
        assertEquals(
            EngineErrorCode.E_CORRUPT_FILE,
            classifyEngineOutput("moov atom not found"),
        )
    }

    @Test
    fun `编码器缺失映射到 encoder_missing`() {
        assertEquals(
            EngineErrorCode.E_ENCODER_UNAVAILABLE,
            classifyEngineOutput("Unknown encoder 'libfdk_aac'"),
        )
    }

    @Test
    fun `磁盘满与权限`() {
        assertEquals(EngineErrorCode.E_DISK_FULL, classifyEngineOutput("No space left on device"))
        assertEquals(EngineErrorCode.E_PERMISSION, classifyEngineOutput("Permission denied"))
    }

    @Test
    fun `源文件缺失与未知兜底`() {
        assertEquals(EngineErrorCode.E_SOURCE_MISSING, classifyEngineOutput("No such file or directory"))
        assertEquals(EngineErrorCode.E_UNKNOWN, classifyEngineOutput("something odd happened"))
    }

    @Test
    fun `中文提示非空`() {
        EngineErrorCode.entries.forEach {
            assertTrue(it.zhMessage.isNotBlank())
        }
    }
}

class CapabilityParseTest {

    @Test
    fun `解析 ffmpeg encoders 输出`() {
        val output = """
            Encoders:
             V..... = Video
             A..... = Audio
             S..... = Subtitle
             .S.... = Subtitle attachment
             ------ ------ -----
             V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC / H.264 (codec h264)
             A....D libmp3lame           libmp3lame MP3 (codec mp3)
             A....D aac                  AAC (Advanced Audio Coding)
             A..... flac                 FLAC (Free Lossless Audio Codec)
             A....D libopus              libopus Opus
        """.trimIndent()
        val engine = FfmpegEngine()
        val names = engine.parseNameSet(output)
        assertTrue("libmp3lame" in names)
        assertTrue("aac" in names)
        assertTrue("flac" in names)
        assertTrue("libopus" in names)
        assertTrue("libx264" in names)
        // 头部说明行不应被解析为编码器
        assertTrue(names.none { it.startsWith("=") })
        assertTrue("Video" !in names)
    }

    @Test
    fun `空输出得到空集合`() {
        assertTrue(FfmpegEngine().parseNameSet("").isEmpty())
    }
}
