# Audio Studio 项目进化报告

审计日期：2026-11-12  
项目根目录：`E:\移动云盘同步盘\Audio Studio`  
仓库：`https://github.com/yuchen0x1/Audio-Studio.git`  
分支：`main`  

## 结论

Audio Studio 已具备 Web、Windows Tauri 和 Android 三端的本地音频转换产品骨架：共享 TypeScript 核心、FFmpeg.wasm、本机 FFmpeg、批量队列、剪辑/合并/分析、元数据、历史、主题和更新提示均能在源码中确认。本轮进一步加固了 GitHub Releases 自动更新链路：Tauri 强制签名版本、Release 只接受 `main` 历史、Android/Web 对齐发布版本、发布清单与 SHA-256 文件自动生成。Web/shared 工程检查通过，但原生工具链、浏览器运行环境和真实签名 Release 安装验证缺失，因此交付状态为 **PARTIAL，不是发布批准**。

工作区在开始时已有大量未提交用户改动（114 个已跟踪文件，另有未跟踪文件）。本轮没有 reset、checkout、删除、切换分支、提交或推送，也没有把既有改动冒记为本轮新功能；只新增了本目录下的 `.evolution/` 证据文件。

## 1. 项目原始情况

- 类型：本地优先的 Web / Windows 桌面 / Android 音频工具。
- 技术：pnpm workspace、React/Vite/Zustand、FFmpeg.wasm、Tauri 2/Rust、Kotlin/Compose、原生 FFmpeg。
- 支持范围：格式转换、批量、剪辑、合并、分析、元数据/封面、历史、设置、主题和中英文本地化。
- 当前提交：`194b41b355a53d480e255d1f28fed1d8c999ced8`；工作树有既有未提交改动。

## 2. 竞品研究

已建立 15 个候选、8 个短名单、5 个深度研究记录，详见 [research.json](./research.json)。重点结论：

- fre:ac：借鉴批量多目标和命名组织，不复制 GPL 代码或 CD 抓取。
- LosslessCut：借鉴清晰的片段选择和发布资产纪律，不引入完整桌面编辑器范围。
- FFmpeg.wasm：继续使用现有 worker/wasm 抽象，不增加第二套封装。
- HandBrake：借鉴“先预设、后细项”的渐进参数体验，限定为音频。
- yt-dlp：借鉴 FFmpeg 能力发现和可操作错误上下文，不增加下载功能。

## 3. 功能差距

详见 [feature_gap.json](./feature_gap.json)。当前最高价值缺口是：

1. 目的导向的语音/音乐/无损预设。
2. 脱敏结构化诊断包导出。
3. 大队列、真实浏览器、Windows 安装更新和 Android 后台任务的验收证据。
4. 安装 FFmpeg CLI 后执行完整格式、剪辑、合并和异常矩阵。

下载器、CD 抓取、DAW 多轨时间线、云账号和插件市场暂不建议开发。

## 4. 本轮实际移植、UI 和架构改动

本轮没有复制竞品代码；在保留既有 dirty diff 的前提下，实际增量修改了更新链路相关源码、Tauri 配置、Android 版本注入、Release 工作流、README 和自动更新文档。新增/更新交付物包括：

- `.evolution/project_identity.json`
- `.evolution/progress.json`
- `.evolution/research.json`
- `.evolution/feature_gap.json`
- `.evolution/test_report.json`
- `.evolution/final_report.md`

更新链路源码/配置改动另见第 7 节，未覆盖其他既有用户改动。

## 5. 测试与验证

详见 [test_report.json](./test_report.json)。已执行并通过：

- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- Web 111 项测试
- 共享核心 74 项测试
- Web 生产构建
- npm 生产依赖审计：无已知漏洞
- `git diff --check`

限制：共享核心的 20 项真实 FFmpeg 集成测试因 `ffmpeg`/`ffprobe` 不在 PATH 而跳过；桌面 Rust 检查已通过；Android Gradle wrapper 下载 Gradle 9.8.2 时本地网络超时；Python Playwright 未安装。Vite 构建保留两处静态/动态导入分块警告。

## 6. 自动更新实际改造

- Tauri `requireSignedVersion=true`，构建工作流缺少 `TAURI_SIGNING_PRIVATE_KEY` 时直接失败。
- Release 标签必须指向 `main` 历史；SemVer 预发布标签自动创建 prerelease。
- Android `versionName` 从 `RELEASE_VERSION` 注入，Web/Tauri/Android 版本一致。
- GitHub Release 自动生成 Tauri `latest.json`、`release-manifest.json` 和 `SHA256SUMS.txt`；签名文件必须与安装包成对存在。
- Web 和 Android 更新信息显示真实发布文件名与大小；Android 继续遵守系统要求，由用户确认安装 APK。
- 完整运维说明见 [docs/AUTO_UPDATE.md](../docs/AUTO_UPDATE.md)。

## 7. 修改文件清单

自动更新相关修改包括：`.github/workflows/release.yml`、`apps/desktop/src-tauri/tauri.conf.json`、`apps/android/app/build.gradle.kts`、`apps/android/app/src/main/java/com/audiostudio/app/updates/UpdateChecker.kt`、Android 更新设置界面/文案、`apps/web/src/updates.ts`、`apps/web/src/components/UpdatePrompt.tsx`、`apps/web/src/i18n.ts`、`README.md` 和 `docs/AUTO_UPDATE.md`；同时更新 `.evolution/` 状态文件。没有提交、推送或创建 Release。

## 8. 评分（基于本轮证据，不等同于发布批准）

| 维度 | 分数 | 依据 |
|---|---:|---|
| 功能完整度 | 72/100 | 核心工作流源码齐全，原生/真实格式矩阵未在本机复验 |
| UI 与用户体验 | 68/100 | 组件、主题和测试存在，真实浏览器视觉验收未完成 |
| 稳定性 | 70/100 | Web/shared 检查通过，桌面/Android 运行证据缺失 |
| 架构与代码质量 | 75/100 | shared + 平台适配边界清楚，构建仍有分块警告 |
| 性能与安全 | 70/100 | npm 生产审计通过、本地处理；缺少设备和大文件基准 |
| 文档与工程交付 | 78/100 | README、CI、报告和状态文件齐全；发布安装验收未完成 |

改造前分数不可可靠重建：审计开始前工作区已经包含大量未提交实现，因此不虚构“本轮前”基线。上述分数是当前证据评分。

## 9. 下一阶段建议

1. 在具备 Rust、JDK、Android SDK 和 ffmpeg/ffprobe 的专用环境中重跑原生与真实媒体测试。
2. 配置 Playwright + Chromium，完成导入、批量、剪辑、更新提示和窄屏视觉检查。
3. 先实现 shared 音频预设，再补跨 Web/Tauri/Android 的参数一致性测试。
4. 添加脱敏诊断导出，并覆盖绝对路径、标签和密钥不泄漏测试。
5. 在整理既有 dirty diff、确认文件归属后，再考虑提交和发布；本报告不代表已上传、发布或安装到外部环境。
