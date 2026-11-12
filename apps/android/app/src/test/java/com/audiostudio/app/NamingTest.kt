package com.audiostudio.app

import com.audiostudio.app.engine.BuildContext
import com.audiostudio.app.engine.EncodeParams
import com.audiostudio.app.engine.Formats
import com.audiostudio.app.engine.NamingContext
import com.audiostudio.app.engine.applyTemplate
import com.audiostudio.app.engine.buildConvertArgs
import com.audiostudio.app.engine.buildMergeArgs
import com.audiostudio.app.engine.buildOutputFileName
import com.audiostudio.app.engine.buildTrimArgs
import com.audiostudio.app.engine.defaultParamsFor
import com.audiostudio.app.engine.MergeItemArgs
import com.audiostudio.app.engine.paramAvailability
import com.audiostudio.app.engine.sanitizeFileName
import com.audiostudio.app.engine.selectEncoder
import com.audiostudio.app.engine.validateFilenameTemplate
import com.audiostudio.app.engine.validateParams
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar

class NamingTest {

    private fun ctx(
        name: String = "song",
        index: Int? = 1,
        nowMs: Long? = null,
        tags: Map<String, String> = emptyMap(),
    ) = NamingContext(
        sourceName = name,
        sourceFormat = "mp3",
        format = Formats.get("mp3")!!,
        index = index,
        tags = tags,
        nowMs = nowMs ?: System.currentTimeMillis(),
    )

    @Test
    fun `模板 token 全部可替换`() {
        val now = Calendar.getInstance().apply { set(2026, Calendar.NOVEMBER, 9, 13, 5, 7) }.timeInMillis
        val out = applyTemplate(
            "{name}_{format}_{source_format}_{date}_{time}_{index}_{artist}_{title}_{album}",
            ctx(name = "我的歌", index = 3, nowMs = now, tags = mapOf("artist" to "A", "title" to "T", "album" to "B")),
        )
        assertEquals("我的歌_mp3_mp3_20261109_130507_3_A_T_B", out)
    }

    @Test
    fun `默认模板生成 name_format`() {
        val out = buildOutputFileName("{name}_{format}", ctx(name = "demo"))
        assertEquals("demo_mp3.mp3", out)
    }

    @Test
    fun `已知音频扩展名被替换为目标格式`() {
        val out = buildOutputFileName("{name}", ctx(name = "track.wav"))
        assertEquals("track.mp3", out)
    }

    @Test
    fun `非音频扩展名视为文件名一部分`() {
        val out = buildOutputFileName("{name}", ctx(name = "my.backup.flac"))
        // .flac 是已知音频扩展名且与目标 mp3 不符 → 替换
        assertEquals("my.backup.mp3", out)
        val out2 = buildOutputFileName("{name}", ctx(name = "v1.2"))
        // .2 不是音频扩展名 → 追加
        assertEquals("v1.2.mp3", out2)
    }

    @Test
    fun `m4a 目标保留 m4a 扩展名`() {
        val out = buildOutputFileName("{name}", ctx(name = "a.m4a", ).let {
            it.copy(format = Formats.get("m4a")!!)
        })
        assertEquals("a.m4a", out)
    }

    @Test
    fun `清洗非法字符与控制符`() {
        assertEquals("a_b_c_d", sanitizeFileName("a<b>c:d"))
        assertEquals("x_y_z", sanitizeFileName("x/y\\z".replace('\\', '_').replace('/', '_').let { it.replace(Regex("_+"), "_") }))
        assertEquals("ok name", sanitizeFileName("  ok   name  "))
        assertEquals("_con", sanitizeFileName("con"))
        assertEquals("___", sanitizeFileName("???"))
        assertEquals("", sanitizeFileName("   "))
    }

    @Test
    fun `模板校验拒绝路径分隔符`() {
        assertNull(validateFilenameTemplate("{name}_{format}"))
        assertEquals(R.string.error_template_empty, validateFilenameTemplate("  "))
        assertEquals(R.string.error_template_path, validateFilenameTemplate("a/b{name}"))
    }
}

class ArgsTest {

    private val params: EncodeParams = defaultParamsFor("mp3").copy(bitrateKbps = 192, gainDb = -3.0)

    @Test
    fun `转换参数结构与共享层语义一致`() {
        val args = buildConvertArgs("/in/a.wav", params, "/out", "a_mp3.mp3")
        assertEquals(listOf("-hide_banner", "-nostdin", "-y"), args.subList(0, 3))
        assertTrue(args.contains("-i") && args[args.indexOf("-i") + 1] == "/in/a.wav")
        // 输出侧选项在输入之后
        assertTrue(args.indexOf("-map") > args.indexOf("-i"))
        assertEquals("0:a:0", args[args.indexOf("-map") + 1])
        assertTrue(args.contains("-vn"))
        assertEquals("libmp3lame", args[args.indexOf("-c:a") + 1])
        assertEquals("192k", args[args.indexOf("-b:a") + 1])
        assertEquals("mp3", args[args.indexOf("-f") + 1])
        assertEquals("/out/a_mp3.mp3", args.last())
        // 增益滤镜
        val af = args[args.indexOf("-af") + 1]
        assertTrue(af.contains("volume=-3.00dB"))
    }

    @Test
    fun `淡出需要时长信息`() {
        assertThrows(IllegalArgumentException::class.java) {
            buildConvertArgs(
                "/in/a.wav",
                params.copy(fadeOutMs = 2000),
                "/out", "x.mp3",
                BuildContext(durationMs = null),
            )
        }
        val args = buildConvertArgs(
            "/in/a.wav",
            params.copy(fadeOutMs = 2000, fadeInMs = 500),
            "/out", "x.mp3",
            BuildContext(durationMs = 10_000),
        )
        val af = args[args.indexOf("-af") + 1]
        assertTrue(af.contains("afade=t=in:st=0:d=0.500"))
        assertTrue(af.contains("afade=t=out:st=8.000:d=2.000"))
    }

    @Test
    fun `VBR 使用 q a 而非 b`() {
        val vbr = params.copy(useVbr = true, vbrQuality = 4.0)
        val args = buildConvertArgs("/in/a.wav", vbr, "/out", "x.mp3")
        assertTrue(args.contains("-q:a"))
        assertFalse(args.contains("-b:a"))
        assertEquals("4.0", args[args.indexOf("-q:a") + 1])
    }

    @Test
    fun `裁剪使用输出侧 ss t 且位于输入之后`() {
        val args = buildTrimArgs("/in/a.wav", 1500, 4000, params, "/out", "clip.mp3")
        val iIdx = args.indexOf("-i")
        val ssIdx = args.indexOf("-ss")
        val tIdx = args.indexOf("-t")
        assertTrue(ssIdx > iIdx && tIdx > iIdx)
        assertEquals("1.500", args[ssIdx + 1])
        assertEquals("2.500", args[tIdx + 1])
    }

    @Test
    fun `裁剪区间非法时抛错`() {
        assertThrows(IllegalArgumentException::class.java) {
            buildTrimArgs("/in/a.wav", 4000, 4000, params, "/out", "x.mp3")
        }
    }

    @Test
    fun `合并生成 concat 与间隔静音`() {
        val args = buildMergeArgs(
            listOf(MergeItemArgs("/in/a.wav"), MergeItemArgs("/in/b.wav")),
            gapMs = 1000,
            params = defaultParamsFor("wav"),
            outputDir = "/out",
            outputFileName = "merged.wav",
            ctx = BuildContext(resolvedSampleRate = 44100, resolvedChannels = 2),
        )
        // 2 个源输入 + 1 个 anullsrc 间隔输入 = 3 个 -i
        assertEquals(3, args.windowed(2).count { it[0] == "-i" })
        val fc = args[args.indexOf("-filter_complex") + 1]
        // 间隔静音作为 lavfi 输入注入（与共享层一致）
        assertTrue(args.contains("anullsrc=r=44100:cl=stereo"))
        assertEquals("lavfi", args[args.indexOf("-f") + 1])
        assertTrue(fc.contains("concat=n="))
        assertEquals("[cout]", args[args.indexOf("-map") + 1])
        assertTrue(args.contains("-vn"))
        assertEquals("/out/merged.wav", args.last())
    }

    @Test
    fun `wav 位深度选择对应 pcm 编码器`() {
        val sel24 = selectEncoder("wav", defaultParamsFor("wav").copy(bitDepth = 24))
        assertEquals("pcm_s24le", sel24.encoder)
        val args = buildConvertArgs(
            "/in/a.flac",
            defaultParamsFor("wav").copy(bitDepth = 16),
            "/out", "x.wav",
        )
        assertEquals("pcm_s16le", args[args.indexOf("-c:a") + 1])
    }

    @Test
    fun `m4a 追加 faststart`() {
        val args = buildConvertArgs("/in/a.wav", defaultParamsFor("m4a"), "/out", "x.m4a")
        val idx = args.indexOf("-movflags")
        assertTrue(idx > 0 && args[idx + 1] == "+faststart")
        assertEquals("ipod", args[args.lastIndexOf("-f") + 1])
    }

    @Test
    fun `参数校验拦截非法值`() {
        assertTrue(validateParams(defaultParamsFor("mp3")).isEmpty())
        assertTrue(validateParams(params.copy(sampleRate = 12345)).isNotEmpty())
        assertTrue(validateParams(params.copy(channels = 9)).isNotEmpty())
        assertTrue(validateParams(params.copy(gainDb = 99.0)).isNotEmpty())
        assertTrue(validateParams(params.copy(bitrateKbps = 77777)).isNotEmpty())
    }

    @Test
    fun `参数可用性随格式变化`() {
        assertTrue(paramAvailability("mp3").bitrate)
        assertFalse(paramAvailability("wav").bitrate)
        assertTrue(paramAvailability("wav").bitDepth)
        assertFalse(paramAvailability("mp3").bitDepth)
        assertTrue(paramAvailability("flac").compression)
    }
}
