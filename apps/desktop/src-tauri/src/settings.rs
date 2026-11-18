//! 设置持久化：JSON 文件存于应用配置目录（`%APPDATA%/com.audiostudio.app/settings.json`）。
//! 前端通过 `get_settings` / `save_settings` 读写，字段与 JSON 命名（camelCase）一致。

use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::io::Write;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// 用户自定义 ffmpeg 可执行文件路径（空/不存在时按定位顺序回退）
    pub ffmpeg_path: Option<String>,
    /// 任务并发上限（1..=4，默认 2）
    pub max_concurrent_tasks: u32,
    /// 默认输出目录（前端可覆盖）
    pub default_output_dir: Option<String>,
    /// 是否允许完成时系统通知
    pub notifications_enabled: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            ffmpeg_path: None,
            max_concurrent_tasks: 2,
            default_output_dir: None,
            notifications_enabled: true,
        }
    }
}

impl Settings {
    /// 夹紧非法值（外部 JSON 可能被手工篡改）
    pub fn sanitized(mut self) -> Self {
        self.max_concurrent_tasks = self.max_concurrent_tasks.clamp(1, 4);
        let p = self
            .ffmpeg_path
            .as_deref()
            .map(str::trim)
            .unwrap_or("")
            .to_string();
        self.ffmpeg_path = if p.is_empty() { None } else { Some(p) };
        self
    }

    pub fn load(path: &Path) -> Self {
        match fs::read_to_string(path) {
            Ok(text) => serde_json::from_str::<Settings>(&text)
                .map(Settings::sanitized)
                .unwrap_or_default(),
            Err(_) => Settings::default(),
        }
    }

    pub fn save(&self, path: &Path) -> io::Result<()> {
        let dir = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        fs::create_dir_all(dir)?;
        let text = serde_json::to_string_pretty(self)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        let mut pending = tempfile::NamedTempFile::new_in(dir)?;
        pending.write_all(text.as_bytes())?;
        pending.as_file().sync_all()?;
        pending.persist(path)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_sane() {
        let s = Settings::default();
        assert_eq!(s.max_concurrent_tasks, 2);
        assert!(s.ffmpeg_path.is_none());
    }

    #[test]
    fn sanitized_clamps_concurrency() {
        assert_eq!(
            Settings {
                max_concurrent_tasks: 0,
                ..Default::default()
            }
            .sanitized()
            .max_concurrent_tasks,
            1
        );
        assert_eq!(
            Settings {
                max_concurrent_tasks: 99,
                ..Default::default()
            }
            .sanitized()
            .max_concurrent_tasks,
            4
        );
        assert_eq!(
            Settings {
                max_concurrent_tasks: 3,
                ..Default::default()
            }
            .sanitized()
            .max_concurrent_tasks,
            3
        );
    }

    #[test]
    fn load_falls_back_to_default_on_garbage() {
        let dir = std::env::temp_dir().join(format!("as-settings-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let p = dir.join("settings.json");
        fs::write(&p, "{ not json").unwrap();
        let s = Settings::load(&p);
        assert_eq!(s.max_concurrent_tasks, 2);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn roundtrip_save_load() {
        let dir = std::env::temp_dir().join(format!("as-settings-rt-{}", std::process::id()));
        let p = dir.join("nested").join("settings.json");
        let s = Settings {
            ffmpeg_path: Some("C:/tools/ffmpeg.exe".into()),
            max_concurrent_tasks: 3,
            default_output_dir: Some("D:/out".into()),
            notifications_enabled: false,
        };
        s.save(&p).unwrap();
        let loaded = Settings::load(&p);
        assert_eq!(loaded.ffmpeg_path.as_deref(), Some("C:/tools/ffmpeg.exe"));
        assert_eq!(loaded.max_concurrent_tasks, 3);
        assert!(!loaded.notifications_enabled);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_replaces_existing_settings() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        Settings::default().save(&path).unwrap();
        Settings {
            max_concurrent_tasks: 4,
            ..Default::default()
        }
        .save(&path)
        .unwrap();
        assert_eq!(Settings::load(&path).max_concurrent_tasks, 4);
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn failed_replacement_cleans_up_temporary_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::create_dir(&path).unwrap();
        assert!(Settings::default().save(&path).is_err());
        assert!(path.is_dir());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
}
