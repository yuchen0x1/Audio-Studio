//! `-progress pipe:1` 输出解析（FFmpeg 把 key=value 行写到 stdout）。
//!
//! FFmpeg 6.x 输出形如：
//! ```text
//! frame=0
//! fps=0.0
//! stream_0_0_q=0.0
//! bitrate=  12.3kbits/s
//! total_size=4096
//! out_time_us=1500000
//! out_time_ms=1500000
//! out_time=00:00:01.500000
//! dup_frames=0
//! drop_frames=0
//! speed=1.5x
//! progress=continue
//! ```
//! 注意：历史版本的 `out_time_ms` 单位同样是**微秒**（FFmpeg 已知怪癖）。

/// 单行解析：`key=value` → (key, value)
pub fn parse_line(line: &str) -> Option<(String, String)> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }
    let eq = line.find('=')?;
    if eq == 0 {
        return None;
    }
    let key = &line[..eq];
    // key 只允许小写字母/数字/下划线（与 TS parseProgressLine 对齐）
    if !key
        .chars()
        .all(|c| c.is_ascii_lowercase() || c == '_' || c.is_ascii_digit())
        || !key.starts_with(|c: char| c.is_ascii_lowercase())
    {
        return None;
    }
    Some((key.to_string(), line[eq + 1..].to_string()))
}

#[derive(Debug, Default, Clone, PartialEq)]
pub struct ProgressUpdate {
    /// 已处理时长（微秒）；来自 out_time_us，缺省时回退 out_time_ms
    pub time_us: Option<i64>,
    /// 处理速度倍率（如 1.5）
    pub speed: Option<f64>,
    /// progress=end 表示任务完成
    pub finished: bool,
}

/// 解析一行 `-progress` 输出，合并进当前状态
pub fn merge_line(state: &mut ProgressUpdate, line: &str) {
    let Some((key, value)) = parse_line(line) else {
        return;
    };
    match key.as_str() {
        "out_time_us" => {
            if let Ok(v) = parse_i64(&value) {
                state.time_us = Some(v);
            }
        }
        "out_time_ms" => {
            // 仅当尚未拿到 out_time_us 时回退（两者单位同为微秒）
            if state.time_us.is_none() {
                if let Ok(v) = parse_i64(&value) {
                    state.time_us = Some(v);
                }
            }
        }
        "speed" => {
            let v = value.trim().trim_end_matches('x');
            if let Some(f) = v.parse::<f64>().ok().filter(|f| f.is_finite()) {
                state.speed = Some(f);
            }
        }
        "progress" if value.trim() == "end" => {
            state.finished = true;
        }
        _ => {}
    }
}

/// FFmpeg 的 `out_time_us` 可能是 `N/A` 或负值（-9223372036854775808 表示未知）
fn parse_i64(raw: &str) -> Result<i64, std::num::ParseIntError> {
    raw.trim().parse::<i64>().map(|v| if v < 0 { 0 } else { v })
}

/// 是否是有意义的进度事件（有时间变化才 emit，减少 IPC 噪音）
pub fn should_emit(prev: &ProgressUpdate, next: &ProgressUpdate) -> bool {
    prev.time_us != next.time_us || prev.finished != next.finished
}

#[cfg(test)]
mod tests {
    use super::*;

    // d) -progress 行解析

    #[test]
    fn parses_out_time_us() {
        let mut s = ProgressUpdate::default();
        merge_line(&mut s, "out_time_us=1500000");
        assert_eq!(s.time_us, Some(1_500_000));
    }

    #[test]
    fn parses_out_time_ms_fallback_as_microseconds() {
        let mut s = ProgressUpdate::default();
        merge_line(&mut s, "out_time_ms=2500000");
        assert_eq!(s.time_us, Some(2_500_000));
        // out_time_us 优先
        merge_line(&mut s, "out_time_us=3000000");
        assert_eq!(s.time_us, Some(3_000_000));
        merge_line(&mut s, "out_time_ms=9999999");
        assert_eq!(s.time_us, Some(3_000_000));
    }

    #[test]
    fn parses_speed() {
        let mut s = ProgressUpdate::default();
        merge_line(&mut s, "speed=1.5x");
        assert_eq!(s.speed, Some(1.5));
        merge_line(&mut s, "speed=N/A");
        assert_eq!(s.speed, Some(1.5)); // 非法值保留旧值
        let mut s2 = ProgressUpdate::default();
        merge_line(&mut s2, "speed=0.0x");
        assert_eq!(s2.speed, Some(0.0));
    }

    #[test]
    fn detects_progress_end() {
        let mut s = ProgressUpdate::default();
        merge_line(&mut s, "progress=continue");
        assert!(!s.finished);
        merge_line(&mut s, "progress=end");
        assert!(s.finished);
    }

    #[test]
    fn line_parser_tolerates_junk() {
        assert!(parse_line("").is_none());
        assert!(parse_line("   ").is_none());
        assert!(parse_line("no-equals-sign").is_none());
        assert!(parse_line("=value").is_none());
        assert_eq!(
            parse_line(" out_time_us=42 ").unwrap(),
            ("out_time_us".into(), "42".into())
        );
        // 非 progress 风格的行（如 stderr 混入）不误判
        assert!(parse_line("Input #0, wav, from 'a.wav':").is_none());
    }

    #[test]
    fn negative_out_time_clamped_to_zero() {
        let mut s = ProgressUpdate::default();
        merge_line(&mut s, "out_time_us=-9223372036854775808");
        assert_eq!(s.time_us, Some(0));
    }

    #[test]
    fn full_progress_block_parses() {
        let block = "\
frame=100\nfps=25.0\nstream_0_0_q=0.0\nbitrate= 320.0kbits/s\ntotal_size=65536\n\
out_time_us=4000000\nout_time_ms=4000000\nout_time=00:00:04.000000\ndup_frames=0\n\
drop_frames=0\nspeed=2.0x\nprogress=continue";
        let mut s = ProgressUpdate::default();
        for line in block.split('\n') {
            merge_line(&mut s, line);
        }
        assert_eq!(s.time_us, Some(4_000_000));
        assert_eq!(s.speed, Some(2.0));
        assert!(!s.finished);
        let prev = s.clone();
        merge_line(&mut s, "progress=end");
        assert!(should_emit(&prev, &s));
    }
}
