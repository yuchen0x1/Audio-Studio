//! 格式注册表（Rust 侧镜像 `packages/shared/src/formats.ts`，仅能力检测所需字段）
//! + `ffmpeg -encoders / -muxers / -demuxers / -filters` 输出解析 + FormatCapability 求交集。
//!
//! 规则与 TS `capabilities.ts` 完全一致：界面只能展示 canEncode=true 的格式。

use regex::Regex;
use serde::Serialize;
use std::sync::OnceLock;

#[derive(Debug, Clone, Copy)]
pub struct FormatRegEntry {
    pub id: &'static str,
    pub label: &'static str,
    pub encoder_candidates: &'static [&'static str],
    pub muxer: &'static str,
    pub demuxer: &'static str,
}

/// 与 FORMATS / FORMAT_IDS 顺序一致（13 种）
pub const FORMAT_REGISTRY: &[FormatRegEntry] = &[
    FormatRegEntry {
        id: "mp3",
        label: "MP3",
        encoder_candidates: &["libmp3lame"],
        muxer: "mp3",
        demuxer: "mp3",
    },
    FormatRegEntry {
        id: "wav",
        label: "WAV",
        encoder_candidates: &["pcm_s16le", "pcm_s24le", "pcm_s32le", "pcm_f32le"],
        muxer: "wav",
        demuxer: "wav",
    },
    FormatRegEntry {
        id: "flac",
        label: "FLAC",
        encoder_candidates: &["flac"],
        muxer: "flac",
        demuxer: "flac",
    },
    FormatRegEntry {
        id: "aac",
        label: "AAC (.aac)",
        encoder_candidates: &["aac"],
        muxer: "adts",
        demuxer: "aac",
    },
    FormatRegEntry {
        id: "m4a",
        label: "M4A",
        encoder_candidates: &["aac"],
        muxer: "ipod",
        demuxer: "mov",
    },
    FormatRegEntry {
        id: "ogg",
        label: "OGG Vorbis",
        encoder_candidates: &["libvorbis", "vorbis"],
        muxer: "ogg",
        demuxer: "ogg",
    },
    FormatRegEntry {
        id: "opus",
        label: "OPUS",
        encoder_candidates: &["libopus", "opus"],
        muxer: "opus",
        demuxer: "ogg",
    },
    FormatRegEntry {
        id: "wma",
        label: "WMA",
        encoder_candidates: &["wmav2", "wmav1"],
        muxer: "asf",
        demuxer: "asf",
    },
    FormatRegEntry {
        id: "aiff",
        label: "AIFF",
        encoder_candidates: &["pcm_s16be", "pcm_s24be", "pcm_s32be"],
        muxer: "aiff",
        demuxer: "aiff",
    },
    FormatRegEntry {
        id: "ape",
        label: "APE (Monkey's Audio)",
        encoder_candidates: &["ape"],
        muxer: "ape",
        demuxer: "ape",
    },
    FormatRegEntry {
        id: "ac3",
        label: "AC3 (Dolby Digital)",
        encoder_candidates: &["ac3"],
        muxer: "ac3",
        demuxer: "ac3",
    },
    FormatRegEntry {
        id: "amr",
        label: "AMR-NB",
        encoder_candidates: &["libopencore_amrnb"],
        muxer: "amr",
        demuxer: "amr",
    },
    FormatRegEntry {
        id: "alac",
        label: "ALAC (Apple Lossless)",
        encoder_candidates: &["alac"],
        muxer: "ipod",
        demuxer: "mov",
    },
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatCapability {
    pub id: String,
    pub can_encode: bool,
    pub can_decode: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encoder: Option<String>,
    /// 不能编码的原因（展示给 UI，杜绝“假支持”）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// 解析 `ffmpeg -encoders` 输出的**音频**编码器名（flags 首字符为 A）。
/// 与 TS `capabilities.ts#parseEncoders` 使用同一正则：
/// ` A....D libmp3lame        libMP3 lame (MPEG audio layer III)`
pub fn parse_encoders(output: &str) -> Vec<String> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"^\s*([VAS][.\w]{5})\s+([A-Za-z0-9_]+)\s").unwrap());
    let mut names: Vec<String> = Vec::new();
    for line in output.split(['\r', '\n']) {
        if let Some(c) = re.captures(line) {
            if c[1].starts_with('A') {
                let name = c[2].to_string();
                if !names.contains(&name) {
                    names.push(name);
                }
            }
        }
    }
    names
}

/// 解析 `ffmpeg -muxers` / `-demuxers`，与 TS `parseMuxers` 同一正则：
/// ```text
///   E mp3             MP3 (MPEG audio layer 3)
///  D  3dostr          3DO STR
/// ```
pub fn parse_muxers(output: &str) -> Vec<String> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re =
        RE.get_or_init(|| Regex::new(r"^\s{1,2}([ ED]{1,2})\s+([A-Za-z0-9_,-]+)\s+\S").unwrap());
    let mut names: Vec<String> = Vec::new();
    for line in output.split(['\r', '\n']) {
        if let Some(c) = re.captures(line) {
            let name = c[2].to_string();
            if !names.contains(&name) {
                names.push(name);
            }
        }
    }
    names
}

/// 解析 `ffmpeg -filters`。
///
/// 不依赖固定列宽：不同 ffmpeg 版本的表头标志列宽度会变（6.x 为 3 列，
/// 新版本可能扩展），说明文字也会变，因此按「标志列 + 名称 + 输入输出箭头」
/// 三段校验，而不是写死 `[.A-Z]{3}`。
pub fn parse_filters(output: &str) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    for line in output.split(['\r', '\n']) {
        let mut parts = line.split_whitespace();
        let (Some(flags), Some(name), Some(io)) = (parts.next(), parts.next(), parts.next()) else {
            continue;
        };
        // 标志列：由 . T S C 等组成，2~5 个字符
        if !(2..=5).contains(&flags.len())
            || !flags
                .chars()
                .all(|c| matches!(c, '.' | 'T' | 'S' | 'C' | 'A' | 'V' | 'N' | '|'))
        {
            continue;
        }
        // 输入输出列：A->A / V->A / |->A / N->N
        if !io.contains("->")
            || !io.chars().all(|c| {
                c.is_ascii_uppercase() || matches!(c, '-' | '>' | '|' | '*') || c.is_ascii_digit()
            })
        {
            continue;
        }
        // 名称列：字母数字、下划线、逗号
        if !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == ',')
        {
            continue;
        }
        if !names.iter().any(|n| n == name) {
            names.push(name.to_string());
        }
    }
    names
}

/// 注册表 ∩ 运行时能力 → 每个格式的 canEncode / canDecode / 原因
pub fn build_format_capabilities(
    encoders: &[String],
    muxers: &[String],
    demuxers: &[String],
) -> Vec<FormatCapability> {
    let enc: std::collections::HashSet<&str> = encoders.iter().map(|s| s.as_str()).collect();
    let mux: std::collections::HashSet<&str> = muxers.iter().map(|s| s.as_str()).collect();
    let dem: std::collections::HashSet<&str> = demuxers.iter().map(|s| s.as_str()).collect();

    FORMAT_REGISTRY
        .iter()
        .map(|f| {
            let available = f
                .encoder_candidates
                .iter()
                .find(|c| enc.contains(*c))
                .copied();
            let muxer_ok = mux.contains(f.muxer);
            let demuxer_ok = dem.contains(f.demuxer);

            let reason = if available.is_none() {
                Some(format!(
                    "引擎缺少 {} 编码器（需要 {}）",
                    f.label,
                    f.encoder_candidates.join(" / ")
                ))
            } else if !muxer_ok {
                Some(format!("引擎缺少 {} 封装器 ({})", f.label, f.muxer))
            } else {
                None
            };

            FormatCapability {
                id: f.id.to_string(),
                can_encode: available.is_some() && muxer_ok,
                can_decode: demuxer_ok,
                encoder: available.map(|s| s.to_string()),
                reason,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    // 能力解析（-encoders / -muxers / -filters 样例）

    #[test]
    fn parses_encoder_list() {
        let out = "\
Encoders:
 V..... = Video
 A..... = Audio
 S..... = Subtitle
 .F.... = Frame-level multithreading
 ------
 A....D libmp3lame           libMP3 lame (MPEG audio layer III)
 A....D aac                  AAC (Advanced Audio Coding)
 V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC
 A....D flac                 FLAC (Free Lossless Audio Codec)
";
        let enc = parse_encoders(out);
        assert_eq!(enc, vec!["libmp3lame", "aac", "flac"]);
    }

    #[test]
    fn parses_muxer_list() {
        let out = "\
File formats:
 D. = Demuxing supported
 .E = Muxing supported
 ------
 E mp3             MP3 (MPEG audio layer III)
 D mp3             MP3 (MPEG audio layer III)
 E wav             WAV / WAVE (Waveform Audio)
 DE ipod            iPod H.264 MP4 (MPEG-4 Part 14)
 E adts            ADTS (Advanced Audio Coding)
";
        let mux = parse_muxers(out);
        assert_eq!(mux, vec!["mp3", "wav", "ipod", "adts"]);
        // demuxers 输出格式相同（D 开头也解析）
        let dem = parse_muxers(" D mp3             MP3\n D wav             WAV\n");
        assert_eq!(dem, vec!["mp3", "wav"]);
    }

    #[test]
    fn parses_filter_list() {
        let out = "\
Filters:
 T.. = Timeline support
 .C. = Slice threading
 ..I = Dynamic inputs
 ------
 ..C afade              V->A       Apply fade-in/out effect
 ... volume            A->A       Change input volume
 T.. aformat            A->A       Convert the input audio to one of the specified formats
 TSC afreqshift         A->A       Apply frequency shifting
 N.. anoisesrc          |->A       Generate a noise audio signal
 A->A not-a-filter-line
 A = Audio input/output
";
        let f = parse_filters(out);
        assert!(f.contains(&"afade".to_string()), "{f:?}");
        assert!(f.contains(&"volume".to_string()), "{f:?}");
        // 标志列变宽（4 列）时仍能解析
        assert!(f.contains(&"afreqshift".to_string()), "{f:?}");
        // 源/汇过滤器（|->A）也要纳入
        assert!(f.contains(&"anoisesrc".to_string()), "{f:?}");
        assert!(f.contains(&"aformat".to_string()), "{f:?}");
        assert!(!f.iter().any(|n| n.contains("not-a-filter")));
    }

    #[test]
    fn format_capabilities_intersect_registry() {
        let encoders = vec![
            "libmp3lame".to_string(),
            "flac".to_string(),
            "aac".to_string(),
        ];
        let muxers = vec![
            "mp3".to_string(),
            "flac".to_string(),
            "ipod".to_string(),
            "adts".to_string(),
        ];
        let demuxers = vec!["mp3".to_string(), "mov".to_string()];

        let caps = build_format_capabilities(&encoders, &muxers, &demuxers);
        assert_eq!(caps.len(), FORMAT_REGISTRY.len());

        let mp3 = caps.iter().find(|c| c.id == "mp3").unwrap();
        assert!(mp3.can_encode);
        assert!(mp3.can_decode);
        assert_eq!(mp3.encoder.as_deref(), Some("libmp3lame"));
        assert!(mp3.reason.is_none());

        let wav = caps.iter().find(|c| c.id == "wav").unwrap();
        assert!(!wav.can_encode, "缺少 pcm 编码器时必须不可编码");
        assert!(wav.reason.as_deref().unwrap().contains("编码器"));

        let m4a = caps.iter().find(|c| c.id == "m4a").unwrap();
        assert!(m4a.can_encode, "aac + ipod muxer 齐备");
        assert!(m4a.can_decode, "mov demuxer 存在");

        let opus = caps.iter().find(|c| c.id == "opus").unwrap();
        assert!(!opus.can_encode, "未提供 libopus");

        // reason 仅在不可编码时出现
        for c in &caps {
            if c.can_encode {
                assert!(c.reason.is_none(), "{}", c.id);
            } else {
                assert!(c.reason.is_some(), "{}", c.id);
            }
        }
    }

    #[test]
    fn registry_matches_shared_format_ids_order() {
        let ids: Vec<&str> = FORMAT_REGISTRY.iter().map(|f| f.id).collect();
        assert_eq!(
            ids,
            vec![
                "mp3", "wav", "flac", "aac", "m4a", "ogg", "opus", "wma", "aiff", "ape", "ac3",
                "amr", "alac"
            ]
        );
    }
}
