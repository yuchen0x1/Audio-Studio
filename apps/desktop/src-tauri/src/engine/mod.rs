//! 原生 FFmpeg 引擎：
//! - 引擎定位（sidecar → 系统 PATH → 用户自定义）与真实版本探测
//! - 能力检测（`-encoders/-muxers/-demuxers/-filters` 解析 + 注册表求交集）
//! - 文件探测（`ffmpeg -i` stderr 解析，规则对齐 `apps/web/src/engine/parseProbe.ts`）
//! - 任务执行（spawn、`-progress pipe:1` 解析、stderr 环形缓冲、事件上报、错误分类）

pub mod progress;
pub mod registry;

use crate::safety;
use crate::settings::Settings;
use crate::TaskEntry;
use base64::Engine as _;
use regex::Regex;
use serde::Serialize;
use std::collections::{BTreeMap, VecDeque};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Emitter;

// ---------------------------------------------------------------------------
// 序列化契约（与 packages/shared/src/engine.ts 对齐）
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfoJson {
    pub kind: &'static str,
    pub name: String,
    pub version: String,
    pub location: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineCapabilitiesJson {
    pub engine: EngineInfoJson,
    pub encoders: Vec<String>,
    pub muxers: Vec<String>,
    pub filters: Vec<String>,
    pub formats: Vec<registry::FormatCapability>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionMismatch {
    pub declared: String,
    pub actual: String,
}

/// `bitDepth: number | 'f32'`
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum BitDepth {
    Int(u64),
    Float32(&'static str),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverArt {
    pub mime: String,
    /// base64
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extension_mismatch: Option<ExtensionMismatch>,
    pub codec: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub codec_long_name: Option<String>,
    pub container: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate_kbps: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sample_rate: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channels: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_layout: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bit_depth: Option<BitDepth>,
    pub file_size_bytes: u64,
    pub tags: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_art: Option<CoverArt>,
    pub stream_summary: Vec<String>,
    pub warnings: Vec<String>,
}

// ---------------------------------------------------------------------------
// 进程工具
// ---------------------------------------------------------------------------

/// 构造不弹黑窗的 Command（CREATE_NO_WINDOW），且**永不经过 shell**
fn base_command(program: &Path) -> Command {
    let mut cmd = Command::new(program);
    cmd.stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

/// 运行并捕获 stdout/stderr（用于 -version / -encoders 等只读查询）
pub(crate) fn run_capture(program: &Path, args: &[&str]) -> std::io::Result<(bool, String, String)> {
    let out = base_command(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()?;
    Ok((
        out.status.success(),
        String::from_utf8_lossy(&out.stdout).into_owned(),
        String::from_utf8_lossy(&out.stderr).into_owned(),
    ))
}

// ---------------------------------------------------------------------------
// 引擎定位（sidecar → 系统 PATH → 用户自定义路径）
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct Located {
    pub path: PathBuf,
    /// 'sidecar' | 'path' | 'custom'
    pub source: &'static str,
}

fn is_ffmpeg_exe(p: &Path) -> bool {
    if !p.is_file() {
        return false;
    }
    let name = p.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    name == "ffmpeg.exe" || name == "ffmpeg" || (name.starts_with("ffmpeg-") && name.ends_with(".exe"))
}

/// 当前 exe 目录
pub fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf()))
}

/// 按规格顺序定位 ffmpeg：sidecar → 系统 PATH → 设置中的自定义路径
pub fn locate(settings: &Settings, resource_dir: Option<&Path>) -> Option<Located> {
    // 1) sidecar：exe 同目录 / resources / 资源目录
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Some(d) = exe_dir() {
        dirs.push(d.clone());
        dirs.push(d.join("resources"));
    }
    if let Some(r) = resource_dir {
        dirs.push(r.to_path_buf());
    }
    for dir in &dirs {
        // 优先标准名
        let std = dir.join("ffmpeg.exe");
        if is_ffmpeg_exe(&std) {
            return Some(Located { path: std, source: "sidecar" });
        }
        // 其次 sidecar 打包命名：ffmpeg-<target>.exe
        if let Ok(entries) = std::fs::read_dir(dir) {
            for e in entries.flatten() {
                let p = e.path();
                let name = p.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
                if name.starts_with("ffmpeg-") && name.ends_with(".exe") {
                    return Some(Located { path: p, source: "sidecar" });
                }
            }
        }
    }

    // 2) 系统 PATH
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            if dir.as_os_str().is_empty() {
                continue;
            }
            for name in ["ffmpeg.exe", "ffmpeg"] {
                let p = dir.join(name);
                if is_ffmpeg_exe(&p) {
                    return Some(Located { path: p, source: "path" });
                }
            }
        }
    }

    // 3) 用户自定义路径
    if let Some(custom) = settings.ffmpeg_path.as_deref() {
        let p = PathBuf::from(custom);
        if is_ffmpeg_exe(&p) {
            return Some(Located { path: p, source: "custom" });
        }
    }

    None
}

pub fn locate_result(settings: &Settings, resource_dir: Option<&Path>) -> Result<Located, String> {
    locate(settings, resource_dir).ok_or_else(|| {
        safety::err(
            "E_ENGINE_INIT",
            "未找到 FFmpeg：既没有随应用附带的 sidecar，系统 PATH 中也没有 ffmpeg。\
             请安装 FFmpeg 并加入 PATH，或在设置中指定 ffmpeg.exe 路径。",
        )
    })
}

/// `ffmpeg -version` 第一行解析出真实版本号
pub fn parse_version_banner(banner: &str) -> String {
    let first = banner.lines().next().unwrap_or("").trim();
    if first.is_empty() {
        return String::new();
    }
    let tokens: Vec<&str> = first.split_whitespace().collect();
    if tokens.len() >= 3 && tokens[0] == "ffmpeg" && tokens[1] == "version" {
        tokens[2].to_string()
    } else if tokens.len() >= 3 && tokens[1] == "version" {
        tokens[2].to_string()
    } else {
        first.to_string()
    }
}

pub fn engine_info(settings: &Settings, resource_dir: Option<&Path>) -> Result<EngineInfoJson, String> {
    let located = locate_result(settings, resource_dir)?;
    let (ok, stdout, stderr) = run_capture(&located.path, &["-version"])
        .map_err(|e| safety::err("E_ENGINE_INIT", &format!("无法执行 FFmpeg：{e}")))?;
    let banner = if stdout.trim().is_empty() { stderr } else { stdout };
    if !ok && banner.trim().is_empty() {
        return Err(safety::err("E_ENGINE_INIT", "FFmpeg 版本探测失败"));
    }
    Ok(EngineInfoJson {
        kind: "native",
        name: "FFmpeg".to_string(),
        version: parse_version_banner(&banner),
        location: located.path.to_string_lossy().into_owned(),
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegCandidate {
    pub path: String,
    pub version: String,
    pub source: &'static str,
}

/// 枚举所有可用 ffmpeg 候选（sidecar / PATH / 自定义），去重
pub fn list_candidates(settings: &Settings, resource_dir: Option<&Path>) -> Vec<FfmpegCandidate> {
    let mut found: Vec<(PathBuf, &'static str)> = Vec::new();
    let push = |found: &mut Vec<(PathBuf, &'static str)>, p: PathBuf, src: &'static str| {
        if is_ffmpeg_exe(&p) && !found.iter().any(|(q, _)| q.to_string_lossy().eq_ignore_ascii_case(&p.to_string_lossy())) {
            found.push((p, src));
        }
    };

    if let Some(d) = exe_dir() {
        push(&mut found, d.join("ffmpeg.exe"), "sidecar");
        push(&mut found, d.join("resources").join("ffmpeg.exe"), "sidecar");
    }
    if let Some(r) = resource_dir {
        push(&mut found, r.join("ffmpeg.exe"), "sidecar");
    }
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            if dir.as_os_str().is_empty() {
                continue;
            }
            push(&mut found, dir.join("ffmpeg.exe"), "path");
            push(&mut found, dir.join("ffmpeg"), "path");
        }
    }
    if let Some(custom) = settings.ffmpeg_path.as_deref() {
        push(&mut found, PathBuf::from(custom), "custom");
    }

    found
        .into_iter()
        .map(|(p, source)| {
            let version = run_capture(&p, &["-version"])
                .ok()
                .map(|(_, out, err)| parse_version_banner(if out.trim().is_empty() { &err } else { &out }))
                .unwrap_or_default();
            FfmpegCandidate { path: p.to_string_lossy().into_owned(), version, source }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// 能力检测
// ---------------------------------------------------------------------------

pub fn capabilities(settings: &Settings, resource_dir: Option<&Path>) -> Result<EngineCapabilitiesJson, String> {
    let located = locate_result(settings, resource_dir)?;
    let fetch = |args: &[&str]| -> Result<String, String> {
        let (_, out, err) = run_capture(&located.path, args)
            .map_err(|e| safety::err("E_ENGINE_INIT", &format!("能力检测执行失败：{e}")))?;
        // -encoders 等输出到 stdout；个别构建可能写 stderr
        let text = if out.trim().is_empty() { err } else { out };
        Ok(text)
    };
    let engine = engine_info(settings, resource_dir)?;
    let encoder_out = fetch(&["-encoders"])?;
    let muxer_out = fetch(&["-muxers"])?;
    let demuxer_out = fetch(&["-demuxers"])?;
    let filter_out = fetch(&["-filters"])?;

    let encoders = registry::parse_encoders(&encoder_out);
    let muxers = registry::parse_muxers(&muxer_out);
    let demuxers = registry::parse_muxers(&demuxer_out);
    let filters = registry::parse_filters(&filter_out);

    Ok(EngineCapabilitiesJson {
        formats: registry::build_format_capabilities(&encoders, &muxers, &demuxers),
        engine,
        encoders,
        muxers,
        filters,
    })
}

// ---------------------------------------------------------------------------
// 错误分类（与 packages/shared/src/errors.ts#classifyEngineOutput 一致）
// ---------------------------------------------------------------------------

pub const ERROR_MESSAGES: &[(&str, &str, bool)] = &[
    ("E_CORRUPT_FILE", "音频文件已损坏或不是有效的音频数据", false),
    ("E_ENCODER_UNAVAILABLE", "目标编码器在当前引擎中不可用", false),
    ("E_DECODER_UNAVAILABLE", "无法解码该音频（引擎缺少对应解码器）", false),
    ("E_UNSUPPORTED_FORMAT", "不支持的音频格式", false),
    ("E_DISK_FULL", "磁盘空间不足，请清理后重试", true),
    ("E_PERMISSION", "文件访问被拒绝，请检查权限", false),
    ("E_SOURCE_MISSING", "找不到源文件", false),
    ("E_OUT_OF_MEMORY", "内存不足，请关闭其他页面或减小文件后重试", true),
    ("E_TIMEOUT", "处理超时，任务已中断", true),
    ("E_CANCELLED", "任务已取消", false),
    ("E_UNKNOWN", "处理失败", true),
];

pub fn message_for_code(code: &str) -> &'static str {
    ERROR_MESSAGES
        .iter()
        .find(|(c, _, _)| *c == code)
        .map(|(_, m, _)| *m)
        .unwrap_or("处理失败")
}

/// 把 FFmpeg stderr 映射为统一错误码（模式与顺序同 TS）
pub fn classify_stderr(stderr_text: &str) -> &'static str {
    let t = stderr_text.to_lowercase();
    let patterns: [(&str, &str); 10] = [
        (
            r"invalid data found when processing input|could not find codec parameters|error while decoding|moov atom not found|truncat.*file|failed to read frame size|header missing",
            "E_CORRUPT_FILE",
        ),
        (r"unknown encoder|encoder .* not found", "E_ENCODER_UNAVAILABLE"),
        (r"unknown decoder|decoder .* not found|no decoder", "E_DECODER_UNAVAILABLE"),
        (
            r"unsupported codec|not supported|requested output format.*not|unable to find a suitable output format",
            "E_UNSUPPORTED_FORMAT",
        ),
        (r"no space left|disk (full|quota)", "E_DISK_FULL"),
        (r"permission denied|operation not permitted|eacces", "E_PERMISSION"),
        (r"no such file or directory|enoent", "E_SOURCE_MISSING"),
        (r"cannot allocate memory|out of memory|std::bad_alloc|memoryerror", "E_OUT_OF_MEMORY"),
        (r"killed|sigkill", "E_TIMEOUT"),
        (r"error opening input", "E_CORRUPT_FILE"),
    ];
    for (pat, code) in patterns {
        if Regex::new(pat).unwrap().is_match(&t) {
            return code;
        }
    }
    "E_UNKNOWN"
}

/// stderr 环形缓冲（限制行数，防止内存无限增长）
#[derive(Debug)]
pub struct RingLines {
    cap: usize,
    lines: VecDeque<String>,
}

impl RingLines {
    pub fn new(cap: usize) -> Self {
        Self { cap: cap.max(1), lines: VecDeque::new() }
    }
    pub fn push(&mut self, line: impl Into<String>) {
        if self.lines.len() >= self.cap {
            self.lines.pop_front();
        }
        self.lines.push_back(line.into());
    }
    pub fn text(&self) -> String {
        self.lines.iter().cloned().collect::<Vec<_>>().join("\n")
    }
    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.lines.len()
    }
    #[cfg(test)]
    pub fn is_empty(&self) -> bool {
        self.lines.is_empty()
    }
}

// ---------------------------------------------------------------------------
// 探测：`ffmpeg -i` stderr 解析（对齐 apps/web/src/engine/parseProbe.ts）
// ---------------------------------------------------------------------------

#[derive(Debug, Default, Clone)]
pub struct ParsedAudio {
    pub codec: String,
    pub sample_rate: Option<u32>,
    pub channels: Option<u32>,
    pub channel_layout: Option<String>,
    pub sample_format: Option<String>,
    pub bit_depth: Option<BitDepth>,
    pub bitrate_kbps: Option<u64>,
    pub tags: BTreeMap<String, String>,
}

#[derive(Debug, Default, Clone)]
pub struct ParsedProbe {
    pub container: String,
    pub duration_ms: Option<u64>,
    pub bitrate_kbps: Option<u64>,
    pub audio: Option<ParsedAudio>,
    pub video_streams: Vec<VideoStream>,
    pub tags: BTreeMap<String, String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct VideoStream {
    pub description: String,
    pub is_attached_picture: bool,
}

fn parse_duration(line: &str) -> Option<u64> {
    let re = Regex::new(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)").unwrap();
    let c = re.captures(line)?;
    let h: u64 = c[1].parse().ok()?;
    let m: u64 = c[2].parse().ok()?;
    let s: f64 = c[3].parse().ok()?;
    let total = h as f64 * 3600.0 + m as f64 * 60.0 + s;
    if !total.is_finite() {
        return None;
    }
    Some((total * 1000.0).round() as u64)
}

fn bit_depth_from_sample_fmt(fmt: Option<&str>) -> Option<BitDepth> {
    let fmt = fmt?;
    if fmt == "fltp" || fmt == "flt" || fmt.starts_with("f32") {
        return Some(BitDepth::Float32("f32"));
    }
    if fmt.contains("s64") {
        return Some(BitDepth::Int(64));
    }
    if fmt.contains("s32") {
        return Some(BitDepth::Int(32));
    }
    if fmt.contains("s24") {
        return Some(BitDepth::Int(24));
    }
    if fmt.contains("s16") {
        return Some(BitDepth::Int(16));
    }
    if fmt.contains("u8") {
        return Some(BitDepth::Int(8));
    }
    None
}

fn parse_audio_stream(line: &str) -> Option<ParsedAudio> {
    // Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 320 kb/s
    // Stream #0:0(eng): Audio: aac (LC), 44100 Hz, stereo, fltp, 128 kb/s
    let re = Regex::new(
        r"Audio:\s*([^,]+),\s*(\d+)\s*Hz,\s*([^,]+?)(?:,\s*([^,]+))?(?:,\s*(\d+)\s*kb/s)?\s*$",
    )
    .unwrap();

    let mut a = ParsedAudio { tags: BTreeMap::new(), ..Default::default() };
    let codec_raw;
    if let Some(c) = re.captures(line) {
        codec_raw = c[1].trim().to_string();
        a.sample_rate = c[2].parse::<u32>().ok();
        let layout_raw = c[3].trim().to_string();
        let sample_format = c.get(4).map(|m| m.as_str().trim().to_string());
        a.bitrate_kbps = c.get(5).and_then(|m| m.as_str().parse::<u64>().ok());

        let re_num = Regex::new(r"^(\d+)\s+channels?$").unwrap();
        if let Some(nc) = re_num.captures(&layout_raw) {
            a.channels = nc[1].parse::<u32>().ok();
        } else if layout_raw.eq_ignore_ascii_case("mono") {
            a.channels = Some(1);
            a.channel_layout = Some("mono".into());
        } else if layout_raw.eq_ignore_ascii_case("stereo") {
            a.channels = Some(2);
            a.channel_layout = Some("stereo".into());
        } else {
            let ch = match layout_raw.as_str() {
                "2.1" => Some(3),
                "3.0" => Some(3),
                "4.0" => Some(4),
                "4.1" => Some(5),
                "5.0" => Some(5),
                "5.1" => Some(6),
                "6.0" => Some(6),
                "6.1" => Some(7),
                "7.1" => Some(8),
                _ => None,
            };
            a.channels = ch;
            a.channel_layout = Some(layout_raw);
        }
        a.sample_format = sample_format.clone();
        let pcm = Regex::new(r"pcm_[su](\d+)(?:le|be)?").unwrap();
        if let Some(pc) = pcm.captures(&codec_raw) {
            if let Ok(n) = pc[1].parse::<u64>() {
                a.bit_depth = Some(BitDepth::Int(n));
            }
        }
        if a.bit_depth.is_none() {
            a.bit_depth = bit_depth_from_sample_fmt(sample_format.as_deref());
        }
    } else {
        // 宽松回退：只取 codec
        let re2 = Regex::new(r"Audio:\s*([^,]+)").unwrap();
        let c = re2.captures(line)?;
        codec_raw = c[1].trim().to_string();
    }

    // 与 TS replace(/\s*\(.*\)$/) 等价：去掉尾部括号说明
    let mut codec = codec_raw;
    if codec.ends_with(')') {
        if let Some(idx) = codec.rfind('(') {
            codec = codec[..idx].trim().to_string();
        }
    }
    a.codec = codec;
    Some(a)
}

/// 解析 `ffmpeg -i` 的 stderr（纯函数）
pub fn parse_probe_output(stderr: &str) -> ParsedProbe {
    let mut result = ParsedProbe::default();
    let re_input = Regex::new(r"^\s*Input #0,\s*([^,]+),\s*from\s+'(.*)':").unwrap();
    let re_bitrate = Regex::new(r"bitrate:\s*(\d+)\s*kb/s").unwrap();
    let re_kv = Regex::new(r"^\s+([A-Za-z_][\w ]*?)\s*:\s*(.*)$").unwrap();

    let mut in_format_metadata = false;
    let mut in_stream_metadata = false;
    let mut current_stream_is_audio = false;
    let mut audio_tag_target: Option<BTreeMap<String, String>> = None;

    for raw_line in stderr.split('\n') {
        let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
        if line.is_empty() {
            continue;
        }

        if let Some(c) = re_input.captures(line) {
            result.container = c[1].trim().to_string();
            in_format_metadata = false;
            in_stream_metadata = false;
            continue;
        }

        if line.trim_start().starts_with("Duration:") {
            if let Some(d) = parse_duration(line) {
                result.duration_ms = Some(d);
            }
            if let Some(c) = re_bitrate.captures(line) {
                result.bitrate_kbps = c[1].parse::<u64>().ok();
            }
            if line.contains("Duration: N/A") {
                result.warnings.push("文件时长未知（流损坏或为直播流格式）".into());
            }
            continue;
        }

        if line.trim_start().starts_with("Stream #") {
            in_format_metadata = false;
            in_stream_metadata = false;
            let is_audio = line.contains(": Audio:");
            current_stream_is_audio = is_audio;
            if is_audio && result.audio.is_none() {
                match parse_audio_stream(line) {
                    Some(mut parsed) => {
                        if parsed.codec == "unknown" {
                            result.warnings.push("无法解析音频编码信息".into());
                        }
                        audio_tag_target = Some(BTreeMap::new());
                        // tags 目标借用问题：先取出稍后合并
                        parsed.tags = BTreeMap::new();
                        result.audio = Some(parsed);
                    }
                    None => result.warnings.push("音频流信息无法解析".into()),
                }
            } else if !is_audio {
                let desc = line.trim().to_string();
                let is_cover = desc.to_lowercase().contains("attached picture");
                result.video_streams.push(VideoStream {
                    description: desc,
                    is_attached_picture: is_cover,
                });
            }
            continue;
        }

        if line.trim_start().starts_with("Output #") {
            break;
        }

        if line.trim() == "Metadata:" {
            let indent = line.len() - line.trim_start().len();
            if indent <= 4 && !current_stream_is_audio {
                in_format_metadata = true;
                audio_tag_target = None;
            } else {
                in_format_metadata = false;
                in_stream_metadata = true;
            }
            continue;
        }

        if let Some(c) = re_kv.captures(line) {
            let key = c[1].trim().to_lowercase();
            let value = c[2].trim().to_string();
            if in_format_metadata {
                result.tags.insert(key, value);
            } else if in_stream_metadata {
                if let Some(target) = audio_tag_target.as_mut() {
                    target.insert(key, value);
                }
            }
            continue;
        }

        // 非 metadata 行结束区块
        let trimmed = line.trim_start();
        let indent = line.len() - trimmed.len();
        if indent <= 2 && !trimmed.is_empty() {
            in_format_metadata = false;
            in_stream_metadata = false;
        }
    }

    // 合并音频流 tags
    if let (Some(target), Some(audio)) = (audio_tag_target, result.audio.as_mut()) {
        audio.tags = target;
    }

    if result.audio.is_none() {
        result.warnings.push("未找到音频流".into());
    }
    result
}

// ---------------------------------------------------------------------------
// magic bytes 格式识别（对齐 packages/shared/src/magic.ts）
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
pub struct MagicDetection {
    pub format: Option<&'static str>,
    /// ffmpeg 报告的容器名（对齐 magic.ts；探测主流程用 format 即可）
    #[allow(dead_code)]
    pub container: String,
    #[allow(dead_code)]
    pub codec_hint: Option<String>,
}

fn ascii(bytes: &[u8], start: usize, len: usize) -> String {
    bytes
        .get(start..start + len)
        .map(|s| s.iter().map(|b| *b as char).collect())
        .unwrap_or_default()
}

/// 检测文件头（前 64KB 即可）
pub fn detect_format(bytes: &[u8]) -> MagicDetection {
    if bytes.len() < 4 {
        return MagicDetection::default();
    }
    // RIFF .... WAVE
    if ascii(bytes, 0, 4) == "RIFF" && ascii(bytes, 8, 4) == "WAVE" {
        return MagicDetection { format: Some("wav"), container: "wav".into(), codec_hint: None };
    }
    if ascii(bytes, 0, 4) == "fLaC" {
        return MagicDetection { format: Some("flac"), container: "flac".into(), codec_hint: None };
    }
    if ascii(bytes, 0, 4) == "OggS" {
        let head = ascii(bytes, 0, bytes.len().min(64));
        let hint = if head.contains("OpusHead") {
            return MagicDetection { format: Some("opus"), container: "ogg".into(), codec_hint: Some("opus".into()) };
        } else if head.contains("vorbis") {
            return MagicDetection { format: Some("ogg"), container: "ogg".into(), codec_hint: Some("vorbis".into()) };
        } else if head.contains("FLAC") {
            return MagicDetection { format: Some("flac"), container: "ogg".into(), codec_hint: Some("flac".into()) };
        } else if head.contains("Speex") {
            return MagicDetection { format: None, container: "ogg".into(), codec_hint: Some("speex".into()) };
        } else {
            None
        };
        return MagicDetection { format: Some("ogg"), container: "ogg".into(), codec_hint: hint };
    }
    if ascii(bytes, 0, 3) == "ID3" {
        return MagicDetection { format: Some("mp3"), container: "mp3".into(), codec_hint: None };
    }
    if bytes[0] == 0xff && (bytes[1] & 0xe0) == 0xe0 {
        let layer = (bytes[1] >> 1) & 0x03;
        let bitrate_idx = (bytes[2] >> 4) & 0x0f;
        let samplerate_idx = (bytes[2] >> 2) & 0x03;
        if layer != 0 && bitrate_idx != 0x0f && samplerate_idx != 0x03 {
            return MagicDetection { format: Some("mp3"), container: "mp3".into(), codec_hint: None };
        }
    }
    if bytes.len() >= 12 && ascii(bytes, 4, 4) == "ftyp" {
        let brand_raw = ascii(bytes, 8, 4);
        let brand = brand_raw.trim().to_string();
        let hint = if brand == "ALAC" { Some("alac".into()) } else { None };
        let _ = brand;
        return MagicDetection { format: Some("m4a"), container: "mp4".into(), codec_hint: hint };
    }
    if ascii(bytes, 0, 4) == "FORM" && (ascii(bytes, 8, 4) == "AIFF" || ascii(bytes, 8, 4) == "AIFC") {
        return MagicDetection { format: Some("aiff"), container: "aiff".into(), codec_hint: None };
    }
    if ascii(bytes, 0, 4) == "MAC " {
        return MagicDetection { format: Some("ape"), container: "ape".into(), codec_hint: None };
    }
    if ascii(bytes, 0, 5) == "#!AMR" {
        return MagicDetection { format: Some("amr"), container: "amr".into(), codec_hint: None };
    }
    const ASF_GUID: [u8; 16] = [
        0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce,
        0x6c,
    ];
    if bytes.len() >= 16 && bytes[0..16] == ASF_GUID {
        return MagicDetection { format: Some("wma"), container: "asf".into(), codec_hint: None };
    }
    if bytes.len() >= 6 && bytes[0] == 0x0b && bytes[1] == 0x77 {
        let bsid = (bytes[5] >> 3) & 0x1f;
        if bsid <= 16 {
            return MagicDetection { format: Some("ac3"), container: "ac3".into(), codec_hint: None };
        }
    }
    if bytes[0] == 0xff && (bytes[1] & 0xf6) == 0xf0 {
        return MagicDetection { format: Some("aac"), container: "adts".into(), codec_hint: None };
    }
    if ascii(bytes, 0, 4) == ".snd" {
        return MagicDetection { format: None, container: "au".into(), codec_hint: None };
    }
    MagicDetection::default()
}

/// 扩展名 → 期望格式（对齐 magic.ts#expectedFormatForExt）
pub fn expected_format_for_ext(ext: &str) -> Option<&'static str> {
    match ext.to_lowercase().as_str() {
        "mp3" => Some("mp3"),
        "wav" | "wave" => Some("wav"),
        "flac" => Some("flac"),
        "aac" => Some("aac"),
        "m4a" | "m4b" | "mp4" => Some("m4a"),
        "ogg" | "oga" => Some("ogg"),
        "opus" => Some("opus"),
        "wma" => Some("wma"),
        "aiff" | "aif" => Some("aiff"),
        "ape" => Some("ape"),
        "ac3" => Some("ac3"),
        "amr" => Some("amr"),
        _ => None,
    }
}

/// magic 失败时用 ffmpeg 报告的容器名 + codec 兜底推断格式
fn format_from_container(container: &str, codec: &str) -> Option<&'static str> {
    let c = container.to_lowercase();
    let codec = codec.to_lowercase();
    if c.contains("ogg") {
        return match codec.as_str() {
            "opus" => Some("opus"),
            "flac" => Some("flac"),
            _ => Some("ogg"),
        };
    }
    if c == "adts" {
        return Some("aac");
    }
    if c.starts_with("mov,mp4") || c == "mp4" || c == "mov" {
        return if codec == "alac" { Some("alac") } else { Some("m4a") };
    }
    if c == "asf" {
        return Some("wma");
    }
    match c.as_str() {
        "mp3" => Some("mp3"),
        "wav" => Some("wav"),
        "flac" => Some("flac"),
        "aiff" => Some("aiff"),
        "ape" => Some("ape"),
        "amr" => Some("amr"),
        "ac3" => Some("ac3"),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// probe 主流程
// ---------------------------------------------------------------------------

pub fn probe_file(settings: &Settings, resource_dir: Option<&Path>, input: &Path) -> Result<ProbeResult, String> {
    let located = locate_result(settings, resource_dir)?;

    let meta = std::fs::metadata(input)
        .map_err(|e| safety::err("E_SOURCE_MISSING", &format!("找不到源文件：{e}")))?;
    let file_size_bytes = meta.len();

    // `ffmpeg -i`：探测无输出目标，非 0 退出是常态，以 stderr 为准
    let input_s = input.to_string_lossy().into_owned();
    let (_, _stdout, stderr) = run_capture(&located.path, &["-i", &input_s])
        .map_err(|e| safety::err("E_UNKNOWN", &format!("FFmpeg 执行失败：{e}")))?;

    if !stderr.contains("Input #") {
        let code = classify_stderr(&stderr);
        let detail: String = stderr
            .lines()
            .rev()
            .take(6)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join(" | ");
        return Err(safety::err(
            code,
            &format!("{}（详细：{detail}）", message_for_code(code)),
        ));
    }

    let parsed = parse_probe_output(&stderr);

    // magic 检测
    let mut head = Vec::with_capacity(65536);
    if let Ok(mut f) = std::fs::File::open(input) {
        let mut buf = [0u8; 65536];
        if let Ok(n) = f.read(&mut buf) {
            head.extend_from_slice(&buf[..n]);
        }
    }
    let magic = detect_format(&head);
    let codec = parsed
        .audio
        .as_ref()
        .map(|a| a.codec.clone())
        .unwrap_or_else(|| "unknown".into());
    let mut format = magic.format.map(|s| s.to_string());
    if format.is_none() {
        format = format_from_container(&parsed.container, &codec).map(|s| s.to_string());
    }

    // 扩展名与实际格式不一致 → 提示
    let ext = input
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let mut extension_mismatch = None;
    if let (Some(expected), Some(actual)) = (expected_format_for_ext(&ext), format.as_deref()) {
        if expected != actual {
            extension_mismatch = Some(ExtensionMismatch {
                declared: expected.to_string(),
                actual: actual.to_string(),
            });
        }
    }

    let mut warnings = parsed.warnings.clone();

    // 封面：仅当存在 attached picture 流时提取（单帧 PNG）
    let mut cover_art = None;
    let has_cover = parsed.video_streams.iter().any(|v| v.is_attached_picture);
    if has_cover {
        match extract_cover(&located.path, input) {
            Ok(Some(data)) => {
                cover_art = Some(CoverArt {
                    mime: "image/png".into(),
                    data: base64::engine::general_purpose::STANDARD.encode(data),
                });
            }
            Ok(None) => warnings.push("内嵌封面无法读取".into()),
            Err(e) => warnings.push(format!("内嵌封面提取失败：{e}")),
        }
    }

    let audio = parsed.audio;
    Ok(ProbeResult {
        format,
        extension_mismatch,
        codec: codec.clone(),
        codec_long_name: None,
        container: parsed.container,
        duration_ms: parsed.duration_ms,
        bitrate_kbps: audio.as_ref().and_then(|a| a.bitrate_kbps).or(parsed.bitrate_kbps),
        sample_rate: audio.as_ref().and_then(|a| a.sample_rate),
        channels: audio.as_ref().and_then(|a| a.channels),
        channel_layout: audio.as_ref().and_then(|a| a.channel_layout.clone()),
        bit_depth: audio.as_ref().and_then(|a| a.bit_depth.clone()),
        file_size_bytes,
        tags: {
            let mut t = parsed.tags.clone();
            if let Some(a) = &audio {
                t.extend(a.tags.clone());
            }
            t
        },
        cover_art,
        stream_summary: parsed.video_streams.iter().map(|v| v.description.clone()).collect(),
        warnings,
    })
}

/// 提取封面帧（输出到 stdout，`-f image2pipe`）
fn extract_cover(ffmpeg: &Path, input: &Path) -> Result<Option<Vec<u8>>, String> {
    let input_s = input.to_string_lossy().into_owned();
    let out = base_command(ffmpeg)
        .args([
            "-hide_banner",
            "-nostdin",
            "-i",
            input_s.as_str(),
            "-map",
            "0:v:0",
            "-frames:v",
            "1",
            "-c:v",
            "png",
            "-f",
            "image2pipe",
            "-",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() || out.stdout.is_empty() {
        return Ok(None);
    }
    Ok(Some(out.stdout))
}

// ---------------------------------------------------------------------------
// 任务执行
// ---------------------------------------------------------------------------

pub struct TaskRun {
    pub app: tauri::AppHandle,
    pub ffmpeg: PathBuf,
    pub task_id: String,
    pub args: Vec<String>,
    pub output: Option<PathBuf>,
    pub notify: bool,
    pub entry: Arc<TaskEntry>,
    pub tasks: Arc<Mutex<std::collections::HashMap<String, Arc<TaskEntry>>>>,
    pub slots: Arc<crate::SlotSemaphore>,
    pub max_concurrent: u32,
}

fn emit(app: &tauri::AppHandle, event: &str, payload: serde_json::Value) {
    if let Err(e) = app.emit(event, payload) {
        crate::logging::warn("engine", &format!("emit {event} 失败: {e}"));
    }
}

/// 在独立线程运行单个任务（并发槽由信号量控制）
pub fn run_task(run: TaskRun) {
    let started = Instant::now();
    let task_id = run.task_id.clone();

    // 并发槽（上限来自设置）
    let _guard = run.slots.acquire(run.max_concurrent as usize);
    if run.entry.cancelled.load(Ordering::SeqCst) {
        // 取消发生在排队阶段：cancel_task 已发 E_CANCELLED
        run.tasks.lock().unwrap().remove(&task_id);
        return;
    }

    // spawn（参数数组直传，不经 shell）
    let mut cmd = base_command(&run.ffmpeg);
    cmd.args(&run.args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            run.tasks.lock().unwrap().remove(&task_id);
            emit(
                &run.app,
                "task://error",
                serde_json::json!({
                    "taskId": task_id,
                    "code": "E_ENGINE_INIT",
                    "message": safety::err("E_ENGINE_INIT", &format!("无法启动 FFmpeg：{e}")),
                }),
            );
            return;
        }
    };

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    *run.entry.child.lock().unwrap() = Some(child);

    let ring = Arc::new(Mutex::new(RingLines::new(500)));

    // stdout → -progress 解析 → task://progress
    let progress_app = run.app.clone();
    let progress_id = task_id.clone();
    let progress_handle = std::thread::spawn(move || {
        use std::io::BufRead;
        let Some(stdout) = stdout else { return };
        let reader = std::io::BufReader::new(stdout);
        let mut state = progress::ProgressUpdate::default();
        for line in reader.lines().map_while(Result::ok) {
            let prev = state.clone();
            progress::merge_line(&mut state, &line);
            if progress::should_emit(&prev, &state) {
                if let Some(us) = state.time_us {
                    emit(
                        &progress_app,
                        "task://progress",
                        serde_json::json!({ "taskId": progress_id, "timeUs": us }),
                    );
                }
            }
        }
    });

    // stderr → 环形缓冲 + task://log
    let log_app = run.app.clone();
    let log_id = task_id.clone();
    let log_ring = ring.clone();
    let stderr_handle = std::thread::spawn(move || {
        let Some(stderr) = stderr else { return };
        let mut reader = stderr;
        let mut buf = [0u8; 8192];
        let mut pending: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    for b in &buf[..n] {
                        if *b == b'\n' || *b == b'\r' {
                            if !pending.is_empty() {
                                let line = String::from_utf8_lossy(&pending).trim().to_string();
                                pending.clear();
                                if !line.is_empty() {
                                    log_ring.lock().unwrap().push(line.clone());
                                    emit(&log_app, "task://log", serde_json::json!({ "taskId": log_id, "line": line }));
                                }
                            }
                        } else {
                            pending.push(*b);
                        }
                    }
                }
                Err(_) => break,
            }
        }
        if !pending.is_empty() {
            let line = String::from_utf8_lossy(&pending).trim().to_string();
            if !line.is_empty() {
                log_ring.lock().unwrap().push(line.clone());
                emit(&log_app, "task://log", serde_json::json!({ "taskId": log_id, "line": line }));
            }
        }
    });

    // 等待退出（轮询 try_wait，让 cancel_task 能拿到锁 kill）
    let status = loop {
        {
            let mut guard = run.entry.child.lock().unwrap();
            match guard.as_mut() {
                None => break None, // 被外部取走（异常情况）
                Some(child) => match child.try_wait() {
                    Ok(Some(st)) => break Some(st),
                    Ok(None) => {}
                    Err(_) => break None,
                },
            }
        }
        if run.entry.cancelled.load(Ordering::SeqCst) {
            let mut guard = run.entry.child.lock().unwrap();
            if let Some(c) = guard.as_mut() {
                let _ = c.kill();
            }
        }
        std::thread::sleep(Duration::from_millis(60));
    };

    let _ = progress_handle.join();
    let _ = stderr_handle.join();

    // 清理
    let status_ok = status.map(|s| s.success()).unwrap_or(false);
    *run.entry.child.lock().unwrap() = None;
    run.tasks.lock().unwrap().remove(&task_id);

    let elapsed_ms = started.elapsed().as_millis() as u64;
    let cancelled = run.entry.cancelled.load(Ordering::SeqCst);
    let stderr_text = ring.lock().unwrap().text();

    if status_ok {
        let (output_path, size_bytes) = match &run.output {
            Some(p) => (
                p.to_string_lossy().into_owned(),
                std::fs::metadata(p).map(|m| m.len()).unwrap_or(0),
            ),
            None => (String::new(), 0),
        };
        emit(
            &run.app,
            "task://done",
            serde_json::json!({
                "taskId": task_id,
                "outputPath": output_path,
                "sizeBytes": size_bytes,
                "elapsedMs": elapsed_ms,
            }),
        );
        crate::logging::info("task", &format!("{task_id} 完成，耗时 {elapsed_ms}ms，输出 {size_bytes} 字节"));
        if run.notify {
            let _ = crate::commands::show_notification(
                &run.app,
                "转换完成",
                &format!("任务已完成：{output_path}"),
            );
        }
        return;
    }

    if cancelled {
        // cancel_task 已经 emit 过 E_CANCELLED，这里只记日志
        crate::logging::info("task", &format!("{task_id} 已取消（耗时 {elapsed_ms}ms）"));
        return;
    }

    let code = classify_stderr(&stderr_text);
    let detail: String = stderr_text
        .lines()
        .rev()
        .take(8)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join(" | ");
    emit(
        &run.app,
        "task://error",
        serde_json::json!({
            "taskId": task_id,
            "code": code,
            "message": message_for_code(code),
            "detail": detail,
        }),
    );
    crate::logging::error("task", &format!("{task_id} 失败 [{code}]: {detail}"));
    if run.notify {
        let _ = crate::commands::show_notification(&run.app, "任务失败", message_for_code(code));
    }
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // e) stderr 错误分类

    #[test]
    fn classifies_corrupt_file() {
        let e = "ffmpeg: Invalid data found when processing input";
        assert_eq!(classify_stderr(e), "E_CORRUPT_FILE");
        let e2 = "moov atom not found in broken.m4a";
        assert_eq!(classify_stderr(e2), "E_CORRUPT_FILE");
        let e3 = "Error while decoding stream #0:0: Invalid data found when processing input";
        assert_eq!(classify_stderr(e3), "E_CORRUPT_FILE");
        assert_eq!(classify_stderr("error opening input file x.mp3"), "E_CORRUPT_FILE");
    }

    #[test]
    fn classifies_encoder_unavailable() {
        let e = "[libmp3lame @ 0x1] Unknown encoder 'libmp3lame'\nError initializing output stream";
        assert_eq!(classify_stderr(e), "E_ENCODER_UNAVAILABLE");
        assert_eq!(classify_stderr("Unknown encoder 'foo'"), "E_ENCODER_UNAVAILABLE");
    }

    #[test]
    fn classifies_disk_full_permission_and_source() {
        assert_eq!(classify_stderr("av_interleaved_write_frame(): No space left on device"), "E_DISK_FULL");
        assert_eq!(classify_stderr("disk quota exceeded"), "E_DISK_FULL");
        assert_eq!(classify_stderr("out.wav: Permission denied"), "E_PERMISSION");
        assert_eq!(classify_stderr("Operation not permitted"), "E_PERMISSION");
        assert_eq!(classify_stderr("/x/y/z.mp3: No such file or directory"), "E_SOURCE_MISSING");
    }

    #[test]
    fn classifies_decoder_format_and_fallback() {
        assert_eq!(classify_stderr("Unknown decoder 'pcm_zork'"), "E_DECODER_UNAVAILABLE");
        assert_eq!(
            classify_stderr("Unable to find a suitable output format for 'out.xyz'"),
            "E_UNSUPPORTED_FORMAT"
        );
        assert_eq!(classify_stderr("Cannot allocate memory"), "E_OUT_OF_MEMORY");
        assert_eq!(classify_stderr("something totally unexpected happened"), "E_UNKNOWN");
    }

    #[test]
    fn error_messages_cover_all_codes() {
        for (code, _, _) in ERROR_MESSAGES {
            assert!(!message_for_code(code).is_empty(), "{code}");
        }
        assert_eq!(message_for_code("E_DISK_FULL"), "磁盘空间不足，请清理后重试");
    }

    // 探测解析（对齐 parseProbe.ts）

    const SAMPLE_STDERR: &str = "\
Input #0, mp3, from 'song.mp3':\n  Metadata:\n    title           : Test Title\n    artist          : Some Artist\n\
  Duration: 00:03:12.50, start: 0.000000, bitrate: 320 kb/s\n\
  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 320 kb/s\n\
    Metadata:\n      handler_name    : SoundHandler\n";

    #[test]
    fn parses_probe_stderr() {
        let p = parse_probe_output(SAMPLE_STDERR);
        assert_eq!(p.container, "mp3");
        assert_eq!(p.duration_ms, Some(192_500));
        assert_eq!(p.bitrate_kbps, Some(320));
        let a = p.audio.expect("audio stream");
        assert_eq!(a.codec, "mp3");
        assert_eq!(a.sample_rate, Some(44100));
        assert_eq!(a.channels, Some(2));
        assert_eq!(a.channel_layout.as_deref(), Some("stereo"));
        assert!(matches!(a.bit_depth, Some(BitDepth::Float32("f32"))));
        assert_eq!(a.bitrate_kbps, Some(320));
        assert_eq!(p.tags.get("title").map(|s| s.as_str()), Some("Test Title"));
        assert_eq!(p.tags.get("artist").map(|s| s.as_str()), Some("Some Artist"));
        assert_eq!(a.tags.get("handler_name").map(|s| s.as_str()), Some("SoundHandler"));
        assert!(p.warnings.is_empty(), "{:?}", p.warnings);
    }

    #[test]
    fn parses_probe_with_cover_and_no_duration() {
        let stderr = "\
Input #0, ogg, from 'cover.ogg':\n\
  Duration: N/A, start: 0.000000, bitrate: N/A\n\
  Stream #0:0: Audio: vorbis, 44100 Hz, stereo, fltp\n\
  Stream #0:1: Video: mjpeg, yuvj420p, 600x600 (attached picture)\n";
        let p = parse_probe_output(stderr);
        assert_eq!(p.container, "ogg");
        assert!(p.duration_ms.is_none());
        assert!(p.warnings.iter().any(|w| w.contains("时长未知")));
        assert_eq!(p.video_streams.len(), 1);
        assert!(p.video_streams[0].is_attached_picture);
        assert!(p.video_streams[0].description.contains("attached picture"));
        assert_eq!(p.audio.as_ref().unwrap().codec, "vorbis");
        assert_eq!(p.audio.as_ref().unwrap().channels, Some(2));
    }

    #[test]
    fn probe_warns_when_no_audio_stream() {
        let stderr = "Input #0, wav, from 'v.wav':\n  Duration: 00:00:01.00, bitrate: 1411 kb/s\n  Stream #0:0: Video: png\n";
        let p = parse_probe_output(stderr);
        assert!(p.audio.is_none());
        assert!(p.warnings.iter().any(|w| w.contains("未找到音频流")));
    }

    #[test]
    fn parses_audio_stream_channel_counts() {
        let p = parse_audio_stream("  Stream #0:0: Audio: pcm_s16le, 48000 Hz, 5.1, s16, 4608 kb/s").unwrap();
        assert_eq!(p.channels, Some(6));
        assert_eq!(p.channel_layout.as_deref(), Some("5.1"));
        assert!(matches!(p.bit_depth, Some(BitDepth::Int(16))));
        assert_eq!(p.codec, "pcm_s16le");

        let p2 = parse_audio_stream("  Stream #0:0: Audio: aac (LC), 44100 Hz, mono, fltp, 64 kb/s").unwrap();
        assert_eq!(p2.codec, "aac"); // 去掉 (LC)
        assert_eq!(p2.channels, Some(1));
        assert_eq!(p2.channel_layout.as_deref(), Some("mono"));

        let p3 = parse_audio_stream("  Stream #0:0: Audio: flac, 96000 Hz, 2 channels, s32").unwrap();
        assert_eq!(p3.channels, Some(2));
        assert!(matches!(p3.bit_depth, Some(BitDepth::Int(32))));
    }

    // magic 格式识别

    #[test]
    fn magic_detects_common_formats() {
        let mut wav = b"RIFF\x24\x00\x00\x00WAVEfmt ".to_vec();
        wav.extend_from_slice(&[0u8; 32]);
        assert_eq!(detect_format(&wav).format, Some("wav"));

        assert_eq!(detect_format(b"fLaC\x00\x00\x22\x00").format, Some("flac"));
        assert_eq!(detect_format(b"ID3\x04\x00\x00").format, Some("mp3"));
        assert_eq!(detect_format(b"MAC \x00\x00\x01\x00").format, Some("ape"));
        assert_eq!(detect_format(b"#!AMR\x0a").format, Some("amr"));
        assert_eq!(detect_format(b"FORM\x00\x00\x00\x1cAIFF").format, Some("aiff"));

        let mut ogg = b"OggS\x00\x02".to_vec();
        ogg.extend_from_slice(&[0u8; 30]);
        ogg.extend_from_slice(b"OpusHead");
        assert_eq!(detect_format(&ogg).format, Some("opus"));

        let mut mp4 = 0u32.to_be_bytes().to_vec();
        mp4.extend_from_slice(b"ftypM4A \x00\x00\x00\x00");
        assert_eq!(detect_format(&mp4).format, Some("m4a"));
    }

    #[test]
    fn extension_mismatch_helpers() {
        assert_eq!(expected_format_for_ext("mp3"), Some("mp3"));
        assert_eq!(expected_format_for_ext("MP4"), Some("m4a"));
        assert_eq!(expected_format_for_ext("xyz"), None);
        assert_eq!(format_from_container("ogg", "opus"), Some("opus"));
        assert_eq!(format_from_container("mov,mp4,m4a,3gp,3g2,mj2", "aac"), Some("m4a"));
        assert_eq!(format_from_container("mov,mp4,m4a,3gp,3g2,mj2", "alac"), Some("alac"));
        assert_eq!(format_from_container("asf", "wmav2"), Some("wma"));
        assert_eq!(format_from_container("matroska,webm", "aac"), None);
    }

    #[test]
    fn version_banner_parsing() {
        let banner = "ffmpeg version 6.1.1-essentials_build-www.gyan.dev Copyright (c) 2000-2023 the FFmpeg developers\nconfiguration: ...\n";
        assert_eq!(parse_version_banner(banner), "6.1.1-essentials_build-www.gyan.dev");
        let n_build = "ffmpeg version N-110187-g123abcde Copyright (c) 2000-2023\n";
        assert_eq!(parse_version_banner(n_build), "N-110187-g123abcde");
    }

    #[test]
    fn ring_buffer_caps_memory() {
        let mut r = RingLines::new(3);
        assert!(r.is_empty());
        for i in 0..10 {
            r.push(format!("line{i}"));
        }
        assert_eq!(r.len(), 3);
        assert_eq!(r.text(), "line7\nline8\nline9");
    }

    // 端到端：真实 ffmpeg 探测（本机装有 ffmpeg 时才执行有效断言）
    #[test]
    fn probe_real_file_if_ffmpeg_present() {
        let tmp = std::env::temp_dir().join(format!("as-probe-e2e-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        let wav = tmp.join("tone.wav");
        let generated = Command::new("ffmpeg")
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=1",
                "-y",
                &wav.to_string_lossy(),
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if !generated {
            // 环境无 ffmpeg：跳过（不视为失败）
            let _ = std::fs::remove_dir_all(&tmp);
            return;
        }
        let settings = Settings::default();
        let result = probe_file(&settings, None, &wav).expect("探测应成功");
        assert_eq!(result.format.as_deref(), Some("wav"));
        assert_eq!(result.container, "wav");
        assert_eq!(result.codec, "pcm_s16le");
        assert_eq!(result.sample_rate, Some(44100));
        assert_eq!(result.channels, Some(1));
        // 与 parseProbe.ts 一致：数字声道描述（"1 channels"）只填 channels，不填 channelLayout
        assert!(result.channel_layout.is_none());
        assert!(matches!(result.bit_depth, Some(BitDepth::Int(16))));
        assert_eq!(result.file_size_bytes, std::fs::metadata(&wav).unwrap().len());
        let dur = result.duration_ms.unwrap_or(0);
        assert!((900..1200).contains(&dur), "时长应约 1s，实际 {dur}ms");
        assert!(result.extension_mismatch.is_none());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    // 端到端：能力检测（真实 ffmpeg）
    #[test]
    fn capabilities_real_ffmpeg_if_present() {
        let settings = Settings::default();
        let Some(located) = locate(&settings, None) else {
            return; // 环境无 ffmpeg，跳过
        };
        assert!(!located.path.as_os_str().is_empty());
        let caps = capabilities(&settings, None).expect("能力检测应成功");
        assert_eq!(caps.engine.kind, "native");
        assert!(!caps.engine.version.is_empty(), "版本必须是真实探测结果");
        assert!(caps.encoders.contains(&"libmp3lame".to_string()), "本机 essentials 构建应带 libmp3lame");
        assert!(caps.muxers.contains(&"mp3".to_string()));
        assert!(caps.filters.contains(&"afade".to_string()));
        let mp3 = caps.formats.iter().find(|f| f.id == "mp3").unwrap();
        assert!(mp3.can_encode);
        assert_eq!(mp3.encoder.as_deref(), Some("libmp3lame"));
    }

    // 端到端：真实 ffmpeg 的 -progress pipe:1 输出可被解析出时长进度
    #[test]
    fn progress_stream_from_real_ffmpeg_if_present() {
        let tmp = std::env::temp_dir().join(format!("as-progress-e2e-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        let src = tmp.join("in.wav");
        let out = tmp.join("out.mp3");
        let ok = Command::new("ffmpeg")
            .args([
                "-hide_banner", "-loglevel", "error", "-f", "lavfi",
                "-i", "sine=frequency=440:duration=2", "-y", &src.to_string_lossy(),
            ])
            .stdout(Stdio::null()).stderr(Stdio::null()).status()
            .map(|s| s.success()).unwrap_or(false);
        if !ok {
            let _ = std::fs::remove_dir_all(&tmp);
            return; // 无 ffmpeg：跳过
        }

        // 与 start_task 相同的注入方式：-progress pipe:1 放在最前
        let mut child = Command::new("ffmpeg")
            .args(["-progress", "pipe:1", "-hide_banner", "-nostdin", "-y",
                "-i", &src.to_string_lossy(), "-c:a", "libmp3lame", "-f", "mp3",
                &out.to_string_lossy()])
            .stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()
            .expect("spawn ffmpeg");
        let stdout = child.stdout.take().unwrap();
        let mut state = progress::ProgressUpdate::default();
        use std::io::BufRead;
        for line in std::io::BufReader::new(stdout).lines().map_while(Result::ok) {
            progress::merge_line(&mut state, &line);
        }
        let status = child.wait().unwrap();
        assert!(status.success(), "转换应成功");
        assert!(state.finished, "应收到 progress=end");
        let us = state.time_us.unwrap_or(0);
        assert!((1_800_000..=2_500_000).contains(&us), "时长约 2s，实际 out_time_us={us}");
        assert!(out.exists());
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
