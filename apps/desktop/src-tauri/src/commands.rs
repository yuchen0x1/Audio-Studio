//! Tauri IPC 契约（供 apps/web 前端调用，全部 serde 序列化）。
//!
//! 错误统一为字符串：`"E_CODE: 中文说明"`（与 packages/shared/src/errors.ts 错误码一致）。
//! 事件：`task://progress` / `task://log` / `task://error` / `task://done`。

use crate::engine::{self, EngineCapabilitiesJson, EngineInfoJson, FfmpegCandidate, ProbeResult};
use crate::logging;
use crate::safety;
use crate::settings::Settings;
use crate::{AppState, TaskEntry};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OkResult {
    pub ok: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetPathResult {
    pub ok: bool,
    pub effective_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskEstimate {
    pub ok: bool,
    pub free_bytes: u64,
    /// 剩余空间是否 >= neededBytes
    pub enough: bool,
}

fn resource_dir_of(app: &AppHandle) -> Option<PathBuf> {
    app.path().resource_dir().ok()
}

/// 系统通知（Rust 侧调用，不依赖前端权限）
pub fn show_notification(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| safety::err("E_UNKNOWN", &format!("系统通知失败：{e}")))
}

// ---------------------------------------------------------------------------
// 引擎
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn engine_info(app: AppHandle, state: State<'_, AppState>) -> Result<EngineInfoJson, String> {
    let settings = state.settings.lock().unwrap().clone();
    let res_dir = resource_dir_of(&app);
    tauri::async_runtime::spawn_blocking(move || engine::engine_info(&settings, res_dir.as_deref()))
        .await
        .map_err(|e| safety::err("E_UNKNOWN", &format!("内部线程错误：{e}")))?
}

#[tauri::command]
pub async fn engine_capabilities(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<EngineCapabilitiesJson, String> {
    let settings = state.settings.lock().unwrap().clone();
    let res_dir = resource_dir_of(&app);
    tauri::async_runtime::spawn_blocking(move || engine::capabilities(&settings, res_dir.as_deref()))
        .await
        .map_err(|e| safety::err("E_UNKNOWN", &format!("内部线程错误：{e}")))?
}

#[tauri::command]
pub async fn probe(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<ProbeResult, String> {
    safety::validate_path_arg(&path, 0)?;
    if !Path::new(&path).exists() {
        return Err(safety::err("E_SOURCE_MISSING", "找不到源文件"));
    }
    let settings = state.settings.lock().unwrap().clone();
    let res_dir = resource_dir_of(&app);
    tauri::async_runtime::spawn_blocking(move || {
        engine::probe_file(&settings, res_dir.as_deref(), Path::new(&path))
    })
    .await
    .map_err(|e| safety::err("E_UNKNOWN", &format!("内部线程错误：{e}")))?
}

#[tauri::command]
pub async fn list_ffmpeg_candidates(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<FfmpegCandidate>, String> {
    let settings = state.settings.lock().unwrap().clone();
    let res_dir = resource_dir_of(&app);
    Ok(tauri::async_runtime::spawn_blocking(move || {
        engine::list_candidates(&settings, res_dir.as_deref())
    })
    .await
    .map_err(|e| safety::err("E_UNKNOWN", &format!("内部线程错误：{e}")))?)
}

#[tauri::command]
pub async fn set_ffmpeg_path(state: State<'_, AppState>, path: String) -> Result<SetPathResult, String> {
    let trimmed = path.trim().to_string();
    let effective = if trimmed.is_empty() {
        None
    } else {
        let p = Path::new(&trimmed);
        if !p.is_file() {
            return Err(safety::err("E_SOURCE_MISSING", "指定的 FFmpeg 路径不存在或不是文件"));
        }
        // 真实可执行验证
        let (ok, _out, err) = engine::run_capture(p, &["-version"])
            .map_err(|e| safety::err("E_ENGINE_INIT", &format!("无法执行该 FFmpeg：{e}")))?;
        if !ok && err.trim().is_empty() {
            return Err(safety::err("E_ENGINE_INIT", "该文件不是可用的 FFmpeg（-version 失败）"));
        }
        Some(trimmed)
    };

    let mut st = state.settings.lock().unwrap().clone();
    st.ffmpeg_path = effective.clone();
    st.save(&state.settings_path)
        .map_err(|e| safety::err("E_UNKNOWN", &format!("设置保存失败：{e}")))?;
    *state.settings.lock().unwrap() = st;
    logging::info("settings", &format!("ffmpeg_path 设为 {effective:?}"));
    Ok(SetPathResult { ok: true, effective_path: effective })
}

// ---------------------------------------------------------------------------
// 任务
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn start_task(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    args: Vec<String>,
    output_path: String,
    notify: Option<bool>,
) -> Result<OkResult, String> {
    if task_id.trim().is_empty() {
        return Err(safety::err("E_INVALID_PARAM", "taskId 不能为空"));
    }
    if args.is_empty() {
        return Err(safety::err("E_INVALID_PARAM", "FFmpeg 参数不能为空"));
    }

    let st = state.settings.lock().unwrap().clone();
    let located = engine::locate_result(&st, resource_dir_of(&app).as_deref())?;

    // a~f：路径校验 / 输出安全 / 建目录 / 冲突加序号 / 输入=输出拒绝 / 写回参数
    let prepared = safety::prepare_output(&args, &output_path)?;

    // 注入 -progress pipe:1（全局选项，放最前；stdout 用于进度解析）
    let mut final_args = prepared.args;
    final_args.insert(0, "pipe:1".into());
    final_args.insert(0, "-progress".into());

    // 并发登记（重复 taskId 拒绝）
    let entry = Arc::new(TaskEntry::default());
    {
        let mut tasks = state.tasks.lock().unwrap();
        if tasks.contains_key(&task_id) {
            return Err(safety::err("E_INVALID_PARAM", "任务已在运行（taskId 重复）"));
        }
        tasks.insert(task_id.clone(), entry.clone());
    }

    let notifications_ok = st.notifications_enabled && notify.unwrap_or(true);
    let max_concurrent = st.max_concurrent_tasks.max(1).min(4);

    logging::info(
        "task",
        &format!(
            "启动 {task_id}：ffmpeg={}({}) args={} 输出={:?}",
            located.path.display(),
            located.source,
            final_args.len(),
            prepared.final_output
        ),
    );

    let run = engine::TaskRun {
        app: app.clone(),
        ffmpeg: located.path,
        task_id: task_id.clone(),
        args: final_args,
        output: prepared.final_output,
        notify: notifications_ok,
        entry,
        tasks: state.tasks.clone(),
        slots: state.slots.clone(),
        max_concurrent,
    };
    std::thread::spawn(move || engine::run_task(run));

    Ok(OkResult { ok: true })
}

#[tauri::command]
pub fn cancel_task(app: AppHandle, state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    let entry = { state.tasks.lock().unwrap().get(&task_id).cloned() };
    if let Some(entry) = entry {
        entry.cancelled.store(true, std::sync::atomic::Ordering::SeqCst);
        {
            let mut guard = entry.child.lock().unwrap();
            if let Some(child) = guard.as_mut() {
                let _ = child.kill();
            }
        }
        logging::info("task", &format!("取消 {task_id}"));
        let _ = app.emit(
            "task://error",
            serde_json::json!({
                "taskId": task_id,
                "code": "E_CANCELLED",
                "message": "任务已取消",
                "detail": null,
            }),
        );
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// 系统集成
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn notify(app: AppHandle, title: String, body: String) -> Result<OkResult, String> {
    show_notification(&app, &title, &body)?;
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub fn reveal_in_folder(path: String) -> Result<(), String> {
    safety::validate_path_arg(&path, 0)?;
    let p = Path::new(&path);
    let canonical = p.canonicalize().unwrap_or_else(|_| p.to_path_buf());
    let arg = format!("/select,{}", canonical.display());
    let mut cmd = std::process::Command::new("explorer");
    cmd.arg(&arg);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd.spawn()
        .map(|_| ())
        .map_err(|e| safety::err("E_UNKNOWN", &format!("打开资源管理器失败：{e}")))
}

#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    safety::validate_path_arg(&path, 0)?;
    if !Path::new(&path).exists() {
        return Err(safety::err("E_SOURCE_MISSING", "路径不存在"));
    }
    open_with_shell(&path)
}

#[cfg(windows)]
fn open_with_shell(path: &str) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let file: Vec<u16> = std::ffi::OsStr::new(path).encode_wide().chain(std::iter::once(0)).collect();
    let op: Vec<u16> = std::ffi::OsStr::new("open").encode_wide().chain(std::iter::once(0)).collect();
    // SAFETY: 均为以 0 结尾的宽字符串，参数指向有效内存
    let rc = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            op.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    if (rc as isize) <= 32 {
        Err(safety::err("E_UNKNOWN", "无法用系统默认程序打开该路径"))
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn open_with_shell(path: &str) -> Result<(), String> {
    std::process::Command::new("xdg-open")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| safety::err("E_UNKNOWN", &format!("打开失败：{e}")))
}

// ---------------------------------------------------------------------------
// 日志
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_logs() -> Result<String, String> {
    Ok(logging::read_all())
}

#[tauri::command]
pub async fn export_logs(app: AppHandle) -> Result<Option<String>, String> {
    let stamp = chrono_stamp();
    let suggested = format!("audio-studio-logs-{stamp}.txt");
    let picked = app
        .dialog()
        .file()
        .set_file_name(&suggested)
        .add_filter("日志文件", &["txt", "log"])
        .blocking_save_file();

    let Some(picked) = picked else {
        return Ok(None); // 用户取消
    };
    let dest: PathBuf = picked
        .as_path()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| safety::err("E_INVALID_PARAM", "请选择本机磁盘上的位置"))?;
    logging::export_to(&dest)
        .map_err(|e| safety::err("E_PERMISSION", &format!("日志导出失败：{e}")))?;
    let path = dest.to_string_lossy().into_owned();
    logging::info("log", &format!("日志已导出到 {path}"));
    Ok(Some(path))
}

fn chrono_stamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // 简化的 UTC 时间戳（年月日时分秒）
    let days = (now / 86_400) as i64;
    let sod = now % 86_400;
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
    let (h, mi, s) = (sod / 3600, (sod % 3600) / 60, sod % 60);
    format!("{y:04}{m:02}{d:02}-{h:02}{mi:02}{s:02}")
}

// ---------------------------------------------------------------------------
// 设置
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    Ok(state.settings.lock().unwrap().clone())
}

#[tauri::command]
pub fn save_settings(state: State<'_, AppState>, settings: Settings) -> Result<Settings, String> {
    let sanitized = settings.sanitized();
    sanitized
        .save(&state.settings_path)
        .map_err(|e| safety::err("E_PERMISSION", &format!("设置保存失败：{e}")))?;
    *state.settings.lock().unwrap() = sanitized.clone();
    logging::info(
        "settings",
        &format!("设置已保存：并发={} 通知={}", sanitized.max_concurrent_tasks, sanitized.notifications_enabled),
    );
    Ok(sanitized)
}

// ---------------------------------------------------------------------------
// 磁盘空间
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn estimate_disk_space(path: String, needed_bytes: u64) -> Result<DiskEstimate, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let free = free_disk_bytes(Path::new(&path))?;
        Ok(DiskEstimate { ok: true, free_bytes: free, enough: free >= needed_bytes })
    })
    .await
    .map_err(|e| safety::err("E_UNKNOWN", &format!("内部线程错误：{e}")))?
}

fn free_disk_bytes(target: &Path) -> Result<u64, String> {
    // 向上回溯到第一个存在的目录（目标文件/目录可能尚未创建）
    let mut dir = if target.is_dir() {
        target.to_path_buf()
    } else {
        target.parent().map(|d| d.to_path_buf()).unwrap_or_else(|| PathBuf::from("."))
    };
    while !dir.exists() {
        match dir.parent() {
            Some(p) if !p.as_os_str().is_empty() => dir = p.to_path_buf(),
            _ => break,
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
        let wide: Vec<u16> = dir.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        let mut available: u64 = 0;
        let mut total: u64 = 0;
        let mut free: u64 = 0;
        // SAFETY: wide 以 0 结尾；三个出参指针有效
        let ok = unsafe { GetDiskFreeSpaceExW(wide.as_ptr(), &mut available, &mut total, &mut free) };
        if ok == 0 {
            return Err(safety::err("E_UNKNOWN", "无法读取磁盘剩余空间"));
        }
        Ok(available)
    }

    #[cfg(not(windows))]
    {
        let _ = dir;
        Err(safety::err("E_UNKNOWN", "当前平台不支持磁盘空间查询"))
    }
}
