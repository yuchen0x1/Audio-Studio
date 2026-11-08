//! 滚动日志：应用日志目录下 `audio-studio.log`，超过 1MB 滚动为 `.1` / `.2` / `.3`。
//! `get_logs` 返回最近文本；`export_logs` 把当前 + 历史滚动文件合并导出到用户选择的位置。

use std::fs::{self, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_LOG_BYTES: u64 = 1024 * 1024; // 1MB 触发滚动
const ROTATE_KEEP: u32 = 3; // 保留 .1 ~ .3

static LOG_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

/// 由 setup 调用，传入应用日志目录
pub fn init(dir: &Path) -> io::Result<PathBuf> {
    fs::create_dir_all(dir)?;
    let path = dir.join("audio-studio.log");
    fs::write(&path, "")?; // 每次启动新建当前日志（历史在 .1~.3）
    *LOG_PATH.lock().unwrap() = Some(path.clone());
    Ok(path)
}

fn current_path() -> Option<PathBuf> {
    LOG_PATH.lock().unwrap().clone()
}

/// UTC 时间戳 → `YYYY-MM-DDTHH:MM:SS.mmmZ`（无第三方依赖的 civil-from-days 算法）
fn format_utc(ms: u128) -> String {
    let secs = (ms / 1000) as i64;
    let millis = (ms % 1000) as u32;
    let days = secs.div_euclid(86_400);
    let sod = secs.rem_euclid(86_400);
    let (h, mi, s) = (sod / 3600, (sod % 3600) / 60, sod % 60);

    // Howard Hinnant's civil_from_days
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    format!("{y:04}-{m:02}-{d:02}T{h:02}:{mi:02}:{s:02}.{millis:03}Z")
}

fn rotate_if_needed(path: &Path) -> io::Result<()> {
    let meta = match fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return Ok(()),
    };
    if meta.len() < MAX_LOG_BYTES {
        return Ok(());
    }
    // .2 -> .3, .1 -> .2, cur -> .1
    for i in (1..ROTATE_KEEP).rev() {
        let from = PathBuf::from(format!("{}.{}", path.display(), i));
        let to = PathBuf::from(format!("{}.{}", path.display(), i + 1));
        if from.exists() {
            let _ = fs::rename(&from, &to);
        }
    }
    fs::rename(path, PathBuf::from(format!("{}.1", path.display())))?;
    Ok(())
}

/// 写一行日志；初始化前的调用静默丢弃（不阻塞主流程）
pub fn log(level: &str, target: &str, message: &str) {
    let Some(path) = current_path() else { return };
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let line = format!("{} [{level}] {target}: {message}\n", format_utc(now));
    if let Err(e) = (|| -> io::Result<()> {
        rotate_if_needed(&path)?;
        let mut f = OpenOptions::new().create(true).append(true).open(&path)?;
        f.write_all(line.as_bytes())
    })() {
        // 日志失败不能影响业务
        eprintln!("log write failed: {e}");
    }
}

pub fn info(target: &str, message: &str) { log("INFO", target, message) }
pub fn warn(target: &str, message: &str) { log("WARN", target, message) }
pub fn error(target: &str, message: &str) { log("ERROR", target, message) }

fn tail_of(path: &Path, max: u64) -> String {
    let mut f = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return String::new(),
    };
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    let start = len.saturating_sub(max);
    if start > 0 {
        let _ = f.seek(SeekFrom::Start(start));
    }
    let mut buf = Vec::new();
    if f.read_to_end(&mut buf).is_err() {
        return String::new();
    }
    String::from_utf8_lossy(&buf).into_owned()
}

/// 全部日志（当前 + 滚动历史，按新→旧）
pub fn read_all() -> String {
    let Some(path) = current_path() else { return String::new() };
    let mut parts: Vec<String> = Vec::new();
    for i in (0..=ROTATE_KEEP).rev() {
        let p = if i == 0 {
            path.clone()
        } else {
            PathBuf::from(format!("{}.{}", path.display(), i))
        };
        if p.exists() {
            let text = tail_of(&p, 8 * 1024 * 1024);
            if !text.trim().is_empty() {
                parts.push(format!("===== {} =====\n{text}", p.file_name().unwrap_or_default().to_string_lossy()));
            }
        }
    }
    parts.join("\n")
}

/// 导出日志到指定文件
pub fn export_to(dest: &Path) -> io::Result<()> {
    if let Some(dir) = dest.parent() {
        fs::create_dir_all(dir)?;
    }
    fs::write(dest, read_all())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utc_formatting_is_well_formed() {
        // 2001-01-01T00:00:00.000Z
        let ms = 978_307_200_000u128;
        assert_eq!(format_utc(ms), "2001-01-01T00:00:00.000Z");
        // 1970-01-01T00:00:00.000Z
        assert_eq!(format_utc(0), "1970-01-01T00:00:00.000Z");
    }

    #[test]
    fn tail_cuts_from_end() {
        let p = std::env::temp_dir().join(format!("as-log-tail-{}.txt", std::process::id()));
        fs::write(&p, "aaaa\nbbbb\ncccc\n").unwrap();
        let t = tail_of(&p, 6);
        assert_eq!(t.len(), 6);
        assert!(t.ends_with("cccc\n"), "got {t:?}");
        let _ = fs::remove_file(&p);
    }
}
