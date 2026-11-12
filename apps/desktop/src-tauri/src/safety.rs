//! 路径 / 参数安全校验与输出路径准备。
//!
//! 与 `packages/shared/src/validation.ts` 规则保持一致：
//! - 路径参数禁止以 `-` 开头、禁止 `\0` / `\r` / `\n`
//! - 输出路径禁止 `..` 遍历、禁止非法字符、限制长度
//! - 输入 = 输出时拒绝（保护源文件）
//! - 输出目录自动创建（FFmpeg 不会创建）、文件名冲突自动加序号（不覆盖）
//!
//! FFmpeg 始终以参数数组方式 spawn（不经 shell），杜绝命令注入。

use std::path::{Path, PathBuf};

/// Windows 保留设备名
const WINDOWS_RESERVED: [&str; 22] = [
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

pub const MAX_PATH_LEN: usize = 4096;
pub const MAX_OUTPUT_NAME_LEN: usize = 300;

/// 统一错误字符串：`CODE: 中文说明`
pub fn err(code: &str, message: &str) -> String {
    format!("{code}: {message}")
}

/// 与 TS `isPathUnsafe` 对齐：遍历 / 控制字符 / 超长
pub fn is_path_unsafe(p: &str) -> bool {
    if p.is_empty() || p.contains('\0') {
        return true;
    }
    let norm = p.replace('\\', "/");
    if norm.contains("../") || norm.contains("/..") || norm == ".." {
        return true;
    }
    if p.chars().count() > MAX_PATH_LEN {
        return true;
    }
    false
}

/// 路径参数校验（`-i` 输入值与输出路径）：
/// - 不得以 `-` 开头（防止被当成选项注入）
/// - 不得含 `\0` / `\r` / `\n`
pub fn validate_path_arg(arg: &str, index: usize) -> Result<(), String> {
    if arg.starts_with('-') {
        return Err(err(
            "E_PATH_UNSAFE",
            &format!("参数 #{index} 非法：路径不能以 \"-\" 开头"),
        ));
    }
    if arg.contains('\0') || arg.contains('\r') || arg.contains('\n') {
        return Err(err(
            "E_PATH_UNSAFE",
            &format!("参数 #{index} 非法：路径包含控制字符"),
        ));
    }
    Ok(())
}

/// 输出路径安全检查（对齐 TS `isPathUnsafe` + Windows 非法字符）
pub fn validate_output_path(p: &str) -> Result<(), String> {
    if p.is_empty() {
        return Err(err("E_PATH_UNSAFE", "输出路径为空"));
    }
    if is_path_unsafe(p) {
        return Err(err("E_PATH_UNSAFE", "文件路径不安全或包含非法字符"));
    }
    if p.contains('\r') || p.contains('\n') {
        return Err(err("E_PATH_UNSAFE", "输出路径包含换行符"));
    }
    // 文件名部分（不含盘符/UNC）检查非法字符与保留名
    let name = p.rsplit(['/', '\\']).next().unwrap_or(p);
    if name.is_empty() || name == "." || name == ".." {
        return Err(err("E_PATH_UNSAFE", "输出文件名非法"));
    }
    if name.chars().count() > MAX_OUTPUT_NAME_LEN {
        return Err(err("E_PATH_UNSAFE", "输出文件名过长"));
    }
    for c in name.chars() {
        if matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*') {
            return Err(err(
                "E_PATH_UNSAFE",
                &format!("输出文件名包含非法字符 \"{c}\""),
            ));
        }
    }
    let stem = name.split('.').next().unwrap_or("").to_lowercase();
    if WINDOWS_RESERVED.contains(&stem.as_str()) {
        return Err(err(
            "E_PATH_UNSAFE",
            &format!("输出文件名使用了 Windows 保留名 \"{name}\""),
        ));
    }
    Ok(())
}

/// 任何参数都不得包含 NUL / 换行（整表扫描）
pub fn validate_no_control_chars(args: &[String]) -> Result<(), String> {
    for (i, a) in args.iter().enumerate() {
        if a.contains('\0') || a.contains('\r') || a.contains('\n') {
            return Err(err("E_INVALID_PARAM", &format!("参数 #{i} 包含控制字符")));
        }
    }
    Ok(())
}

/// 提取所有 `-i` 后面的输入路径参数
pub fn collect_input_paths(args: &[String]) -> Vec<(usize, String)> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < args.len() {
        if args[i] == "-i" {
            if let Some(v) = args.get(i + 1) {
                out.push((i + 1, v.clone()));
            }
            i += 2;
        } else {
            i += 1;
        }
    }
    out
}

/// 路径归一化比较（分隔符统一、Windows 下忽略大小写、去掉末尾分隔符）
pub fn normalize_key(p: &str) -> String {
    let mut s = p.replace('\\', "/");
    while s.len() > 1 && s.ends_with('/') {
        s.pop();
    }
    if cfg!(windows) {
        s.to_lowercase()
    } else {
        s
    }
}

/// 判断两个路径是否指向同一文件（存在则用 canonical，否则退化为归一化字符串比较）
pub fn same_path(a: &str, b: &str) -> bool {
    let (pa, pb) = (Path::new(a), Path::new(b));
    if let (Ok(ca), Ok(cb)) = (pa.canonicalize(), pb.canonicalize()) {
        return ca == cb;
    }
    // 至少一侧不存在：比较父目录 canonical + 文件名
    let key = |p: &Path| -> String {
        let name = p
            .file_name()
            .map(|n| n.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        match p.parent().and_then(|d| d.canonicalize().ok()) {
            Some(dir) => format!(
                "{}/{}",
                dir.display().to_string().replace('\\', "/").to_lowercase(),
                name
            ),
            None => normalize_key(&p.to_string_lossy()),
        }
    };
    key(pa) == key(pb)
}

/// 创建输出目录（FFmpeg 不会自动创建）
pub fn ensure_output_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if parent.as_os_str().is_empty() {
            return Ok(());
        }
        std::fs::create_dir_all(parent).map_err(|e| {
            if e.kind() == std::io::ErrorKind::PermissionDenied {
                err("E_PERMISSION", &format!("无法创建输出目录：{e}"))
            } else {
                err("E_UNKNOWN", &format!("创建输出目录失败：{e}"))
            }
        })?;
    }
    Ok(())
}

/// 文件名冲突 → 自动加序号：`file.mp3` → `file (1).mp3` → `file (2).mp3` …（绝不覆盖）
pub fn unique_output_path(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }
    let dir = path.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "output".into());
    let ext = path.extension().map(|s| s.to_string_lossy().into_owned());
    for n in 1..10_000 {
        let name = match &ext {
            Some(e) => format!("{stem} ({n}).{e}"),
            None => format!("{stem} ({n})"),
        };
        let candidate = dir.join(name);
        if !candidate.exists() {
            return candidate;
        }
    }
    path.to_path_buf()
}

/// FFmpeg 参数向量的输出定位：输出永远是数组最后一个位置参数
/// （`packages/shared/src/args.ts` 的 build*Args 均把输出 push 到末尾）。
fn output_index(args: &[String]) -> Option<usize> {
    let last = args.last()?;
    // `-f null -`（测量作业）：`-` 表示丢弃输出，不涉及真实文件
    if last == "-" {
        return None;
    }
    if last.starts_with('-') {
        return None;
    }
    Some(args.len() - 1)
}

/// 输出路径准备结果
#[derive(Debug)]
pub struct PreparedOutput {
    /// 替换/追加输出后的参数向量
    pub args: Vec<String>,
    /// 最终（去重后）的真实输出路径；`None` 表示无文件输出（`-f null -`）
    pub final_output: Option<PathBuf>,
}

/// 完整的输出准备流程：
/// a) 校验 path 参数；b) 输出路径安全检查；c) 创建输出目录；
/// d) 冲突加序号；e) 输入输出同路径拒绝；f) 把最终路径写回参数向量。
pub fn prepare_output(args: &[String], output_path: &str) -> Result<PreparedOutput, String> {
    validate_no_control_chars(args)?;

    let inputs = collect_input_paths(args);
    for (idx, p) in &inputs {
        validate_path_arg(p, *idx)?;
    }

    // 无文件输出（测量作业 / 前端未给 outputPath）
    if output_path.trim().is_empty() || output_path.trim() == "-" {
        return Ok(PreparedOutput {
            args: args.to_vec(),
            final_output: None,
        });
    }

    validate_output_path(output_path)?;
    for (idx, p) in &inputs {
        if same_path(output_path, p) {
            return Err(err(
                "E_INVALID_PARAM",
                &format!(
                    "输入与输出是同一个文件，已拒绝（保护源文件）：{output_path}（参数 #{idx}）"
                ),
            ));
        }
    }

    let out = PathBuf::from(output_path);
    ensure_output_dir(&out)?;
    let final_path = unique_output_path(&out);

    let final_str = final_path.to_string_lossy().into_owned();
    let mut new_args = args.to_vec();
    let target_key = normalize_key(output_path);

    match output_index(args) {
        Some(i) if normalize_key(&args[i]) == target_key => {
            new_args[i] = final_str.clone();
        }
        Some(i) => {
            // 参数末位是输出位但与 outputPath 写法不一致：以 outputPath 契约为准
            new_args[i] = final_str.clone();
        }
        None => {
            // 末位不是可识别输出（如 `-`）或数组为空：按契约追加输出路径
            if args.last().map(|s| s.as_str()) == Some("-") {
                new_args.pop();
                new_args.push(final_str.clone());
            } else {
                new_args.push(final_str.clone());
            }
        }
    }

    // 替换后再次确认输入 ≠ 输出
    for (idx, p) in collect_input_paths(&new_args) {
        if same_path(&final_str, &p) {
            return Err(err(
                "E_INVALID_PARAM",
                "输入与输出是同一个文件，已拒绝（保护源文件）",
            ));
        }
        let _ = idx;
    }

    Ok(PreparedOutput {
        args: new_args,
        final_output: Some(final_path),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn args(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    fn tmp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("as-safety-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    // a) 路径安全校验

    #[test]
    fn rejects_double_dot_traversal() {
        assert!(is_path_unsafe("../etc/passwd"));
        assert!(is_path_unsafe("a/../../b"));
        assert!(is_path_unsafe("a\\..\\b"));
        assert!(is_path_unsafe(".."));
        assert!(is_path_unsafe("C:/ok/..\\x"));
        assert!(!is_path_unsafe("D:/Music/out/track.mp3"));
    }

    #[test]
    fn rejects_path_starting_with_dash() {
        let e = validate_path_arg("-rf something", 0).unwrap_err();
        assert!(e.starts_with("E_PATH_UNSAFE"), "got {e}");
        assert!(validate_path_arg("C:/a/b.mp3", 0).is_ok());
    }

    #[test]
    fn rejects_control_chars_in_paths() {
        assert!(validate_path_arg("a\nb", 0).is_err());
        assert!(validate_path_arg("a\rb", 0).is_err());
        assert!(validate_path_arg("a\0b", 0).is_err());
        assert!(validate_no_control_chars(&args(&["-i", "ok\npath"])).is_err());
        assert!(validate_no_control_chars(&args(&["-i", "ok", "out.mp3"])).is_ok());
    }

    #[test]
    fn rejects_unsafe_output_names() {
        assert!(validate_output_path("").is_err());
        assert!(validate_output_path("out/../evil.mp3").is_err());
        assert!(validate_output_path("bad<name>.mp3").is_err());
        assert!(validate_output_path("con.mp3").is_err());
        assert!(validate_output_path("a/b/file.mp3").is_ok());
    }

    // 输入 = 输出拒绝

    #[test]
    fn rejects_same_input_and_output() {
        let dir = tmp("same");
        let src = dir.join("song.mp3");
        fs::write(&src, "x").unwrap();
        let a = args(&[
            "-hide_banner",
            "-nostdin",
            "-y",
            "-i",
            src.to_str().unwrap(),
            "-c:a",
            "libmp3lame",
            src.to_str().unwrap(),
        ]);
        let e = prepare_output(&a, src.to_str().unwrap()).unwrap_err();
        assert!(e.starts_with("E_INVALID_PARAM"), "got {e}");
        // 分隔符/大小写不同的同一路径也要拦住
        let alt = src.to_string_lossy().replace('\\', "/");
        let e2 = prepare_output(&a, &alt).unwrap_err();
        assert!(e2.starts_with("E_INVALID_PARAM"), "got {e2}");
        let _ = fs::remove_dir_all(&dir);
    }

    // b) 输出目录自动创建

    #[test]
    fn creates_missing_output_dir() {
        let dir = tmp("mkdir");
        let out = dir.join("a/b/c").join("track.wav");
        assert!(!out.parent().unwrap().exists());
        let a = args(&["-i", "in.wav", "-c:a", "pcm_s16le", out.to_str().unwrap()]);
        let prepared = prepare_output(&a, out.to_str().unwrap()).unwrap();
        assert!(out.parent().unwrap().exists(), "输出目录应被自动创建");
        assert_eq!(prepared.final_output.as_deref(), Some(out.as_path()));
        let _ = fs::remove_dir_all(&dir);
    }

    // c) 文件名冲突加序号

    #[test]
    fn conflicts_get_numbered_suffix() {
        let dir = tmp("conflict");
        let out = dir.join("mix.mp3");
        fs::write(&out, "old").unwrap();
        let a = args(&["-i", "in.wav", out.to_str().unwrap()]);
        let prepared = prepare_output(&a, out.to_str().unwrap()).unwrap();
        let final_path = prepared.final_output.unwrap();
        assert_eq!(final_path, dir.join("mix (1).mp3"));
        // 参数向量中的输出已被替换为去重后的路径
        assert_eq!(
            prepared.args.last().unwrap(),
            &final_path.to_string_lossy().to_string()
        );
        // 第二次冲突 → (2)
        fs::write(dir.join("mix (1).mp3"), "old2").unwrap();
        let p2 = unique_output_path(&out);
        assert_eq!(p2, dir.join("mix (2).mp3"));
        // 原文件未被触碰
        assert_eq!(fs::read_to_string(&out).unwrap(), "old");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn unique_handles_no_extension() {
        let dir = tmp("noext");
        let out = dir.join("voice");
        fs::write(&out, "x").unwrap();
        assert_eq!(unique_output_path(&out), dir.join("voice (1)"));
        let _ = fs::remove_dir_all(&dir);
    }

    // 参数向量输出替换

    #[test]
    fn replaces_output_arg_with_resolved_path() {
        let dir = tmp("replace");
        let out = dir.join("final.flac");
        let out_str = out.to_string_lossy().into_owned();
        let a = args(&[
            "-hide_banner",
            "-y",
            "-i",
            "in.wav",
            "-c:a",
            "flac",
            &out_str,
        ]);
        let prepared = prepare_output(&a, &out_str).unwrap();
        assert_eq!(prepared.args.last().unwrap(), &out_str);
        assert_eq!(prepared.final_output, Some(out));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn null_output_measure_args_left_untouched() {
        // `-f null -`：测量作业无真实输出文件
        let a = args(&[
            "-hide_banner",
            "-y",
            "-i",
            "in.wav",
            "-af",
            "volumedetect",
            "-f",
            "null",
            "-",
        ]);
        let prepared = prepare_output(&a, "-").unwrap();
        assert!(prepared.final_output.is_none());
        assert_eq!(prepared.args, a);
        let prepared2 = prepare_output(&a, "").unwrap();
        assert!(prepared2.final_output.is_none());
    }

    #[test]
    fn input_paths_extracted() {
        let a = args(&["-f", "lavfi", "-i", "anullsrc", "-i", "x.wav", "out.mp3"]);
        let inputs = collect_input_paths(&a);
        assert_eq!(inputs.len(), 2);
        assert_eq!(inputs[0].1, "anullsrc");
        assert_eq!(inputs[1].1, "x.wav");
    }
}
