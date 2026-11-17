# Changelog

本文件记录 Audio Studio 的产品级变更；未发布项明确标记为 Unreleased。

## Unreleased · 2026-11-17

### Changed

- 增加按浏览器/系统语言自动选择中文或 English 的界面语言能力，支持设置中手动选择和持久化。
- 核心壳层即时更新语言，用户文件、音频元数据和转换参数保持原样。

## v0.2.2 — 2026-11-17

### Changed

- 增加自动语言选择、手动切换和持久化设置，核心壳层即时更新。

## v0.2.1 — 2026-11-16

### Added

- 历史记录 JSON 导出/导入：带版本号、大小与条数上限、字段校验、去重合并。
- 全局 React ErrorBoundary，渲染异常时提供重试、刷新与脱敏诊断信息。
- 浏览器 FFmpeg.wasm 大文件硬限制预检，超过上限时在写入虚拟文件系统前给出可恢复错误。
- `PROJECT_AUDIT.md`、`COMPETITOR_ANALYSIS.md`、`UPGRADE_ROADMAP.md` 与 `UPGRADE_REPORT.md`，记录本轮审计、15 个开源项目对标和 40 项演进路线。

### Changed

- Windows 原生任务启动现在接收前端的完成通知和并发设置，Rust 端对旧调用兼容并将并发限制在 1–4。
- 设置重置同步清理语言状态并显示完成反馈。
- Tauri WebView 从 `security.csp: null` 改为显式来源白名单。

### Verification

- TypeScript、ESLint、Prettier、共享/Web/Rust 测试与 Web 构建通过。
- 本机未安装 `ffmpeg`/`ffprobe`，真实原生转码、签名安装包和桌面更新安装回归仍未宣称完成。

## v0.2.0 — 2026-11-13

- Windows/Web 双端音频转换、批量队列、剪辑、合并、元数据、分析、历史与自动更新基础能力。
- 音乐分享、语音小文件、FLAC 存档预设，以及队列搜索和状态筛选。
