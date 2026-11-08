//! Audio Studio Windows 桌面版入口（Tauri 2 + 原生 FFmpeg 引擎）。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod engine;
mod logging;
mod safety;
mod settings;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use tauri::Manager;

/// 运行中的任务句柄
pub struct TaskEntry {
    pub child: Mutex<Option<std::process::Child>>,
    pub cancelled: AtomicBool,
}

impl Default for TaskEntry {
    fn default() -> Self {
        Self { child: Mutex::new(None), cancelled: AtomicBool::new(false) }
    }
}

/// 并发槽信号量（上限 1..=4，可随设置动态调整）
pub struct SlotSemaphore {
    used: Mutex<usize>,
    cv: Condvar,
}

impl SlotSemaphore {
    pub fn new() -> Self {
        Self { used: Mutex::new(0), cv: Condvar::new() }
    }

    pub fn acquire(&self, max: usize) -> SlotGuard<'_> {
        let max = max.clamp(1, 4);
        let mut used = self.used.lock().unwrap();
        while *used >= max {
            used = self.cv.wait(used).unwrap();
        }
        *used += 1;
        SlotGuard { sem: self }
    }
}

impl Default for SlotSemaphore {
    fn default() -> Self {
        Self::new()
    }
}

pub struct SlotGuard<'a> {
    sem: &'a SlotSemaphore,
}

impl Drop for SlotGuard<'_> {
    fn drop(&mut self) {
        let mut used = self.sem.used.lock().unwrap();
        *used = used.saturating_sub(1);
        self.sem.cv.notify_one();
    }
}

pub struct AppState {
    pub settings: Mutex<settings::Settings>,
    pub settings_path: PathBuf,
    pub tasks: Arc<Mutex<HashMap<String, Arc<TaskEntry>>>>,
    pub slots: Arc<SlotSemaphore>,
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            let log_dir = app.path().app_log_dir()?;
            logging::init(&log_dir)?;
            let settings_path = config_dir.join("settings.json");
            let s = settings::Settings::load(&settings_path);
            logging::info(
                "app",
                &format!(
                    "Audio Studio 启动：并发上限={} 自定义ffmpeg={:?}",
                    s.max_concurrent_tasks, s.ffmpeg_path
                ),
            );
            app.manage(AppState {
                settings: Mutex::new(s),
                settings_path,
                tasks: Arc::new(Mutex::new(HashMap::new())),
                slots: Arc::new(SlotSemaphore::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::engine_info,
            commands::engine_capabilities,
            commands::probe,
            commands::start_task,
            commands::cancel_task,
            commands::list_ffmpeg_candidates,
            commands::set_ffmpeg_path,
            commands::notify,
            commands::reveal_in_folder,
            commands::open_path,
            commands::get_logs,
            commands::export_logs,
            commands::get_settings,
            commands::save_settings,
            commands::estimate_disk_space,
        ])
        .build(tauri::generate_context!())
        .expect("Audio Studio 初始化失败")
        .run(|app, event| {
            // 退出时清理：终止仍在运行的子进程
            if let tauri::RunEvent::Exit = event {
                let state = app.state::<AppState>();
                let tasks = state.tasks.lock().unwrap();
                for (id, entry) in tasks.iter() {
                    entry.cancelled.store(true, Ordering::SeqCst);
                    if let Some(child) = entry.child.lock().unwrap().as_mut() {
                        let _ = child.kill();
                        logging::info("app", &format!("退出：已终止任务 {id}"));
                    }
                }
            }
        });
}
