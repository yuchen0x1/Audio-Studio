# Audio Studio 项目审计与升级报告

审计日期：2026-11-09  
项目目录：`C:\Users\lenmo\Desktop\Audio Studio`  
审计方式：本地源代码、配置、构建与测试检查；GitHub 竞品资料在线核查。  
Git 操作：只读检查；未提交、未推送、未发布。

## 1. 项目现状

Audio Studio 是一款本地优先的多平台音频转换与处理应用，版本 `0.1.0`，许可证 MIT。产品覆盖 Web、Windows 桌面和 Android。

| 层 | 实际技术 |
|---|---|
| Web UI | React 18、TypeScript、Vite、Zustand |
| Web 音频引擎 | FFmpeg.wasm、IndexedDB |
| 桌面 | Tauri 2、Rust、本机 FFmpeg/FFprobe |
| Android | Kotlin、Jetpack Compose、本机 FFmpeg Kit fork、SAF/MediaStore |
| 共享逻辑 | TypeScript；格式、参数、校验、命名、任务与错误模型 |
| 构建/包管理 | pnpm workspace、Cargo、Gradle |
| 数据库 | 未发现服务端数据库；偏好、历史数据使用本地存储 |

核心模块包括 `packages/shared` 共享音频规则；`apps/web/src/engine` 与 `platform` 引擎和平台适配；`pages`、`components`、`stores` Web 交互；`apps/desktop/src-tauri` Rust 命令、进程、路径安全与设置；`apps/android/app/src/main` Compose UI、转换服务、存储与更新检查。

项目功能盘点（由代码与入口检查得到）：格式转换与批量任务、剪辑、合并、分析、元数据和封面编辑、历史、设置、播放器/波形、主题与中英文本地化、跨平台引擎适配、更新提示。Web 和 Rust 均有单元测试及真实 FFmpeg 集成测试；Android 有单元与设备集成测试源文件。未逐个在真实 Android 设备上操作全部功能。

基线 Git 分支为 `main`，跟踪 `origin/main`。开始审计时已有大量用户未提交改动：114 个已跟踪修改文件和 19 个未跟踪文件（这些改动包含此前已有的大量实现和测试，不能归属为本轮单独创建）。所有改动都予以保留。

## 2. 清理记录

- 删除垃圾文件：无。无法在不冒覆盖用户现有成果风险的情况下确认哪些文件属于废弃内容。
- 删除依赖：无。没有通过静态引用关系确认可安全移除的依赖。
- 依赖清单：根包 7 个开发依赖；Web 包 12 个运行依赖和 12 个开发依赖；共享包无运行依赖、3 个开发依赖。
- 清理前后文件数/依赖数：未做破坏性清理，因此文件数和依赖数没有因清理而变化。仓库扫描看到的忽略构建目录包含 APK、FFmpeg wasm、Rust/Gradle 构建缓存等有效产物，未删除。
- npm 生产依赖安全审计：本机 pnpm 默认 registry `https://registry.npmmirror.com` 不支持 audit endpoint；改用 npm 官方 registry 查询，报告 18 个生产/可选依赖、0 个已知漏洞。该结果仅覆盖 npm 生产依赖，不等同于 Rust、Gradle 或全部传递依赖的完整 SBOM 审计。

## 3. GitHub 竞品研究

详细仓库证据和维度对比见 [GITHUB_BENCHMARK_REPORT.md](./GITHUB_BENCHMARK_REPORT.md)；完整 A–G 功能差距清单与评分依据见 [FEATURE_GAP_REPORT.md](./FEATURE_GAP_REPORT.md)。

研究按本项目的本地音频处理定位，重点参考相邻而非完全同类的开源项目。Star 数和发行日期会变化；可核对的仓库页面值、许可限制和研究边界以专题报告为准。

| 仓库 | 许可证/活跃度 | 已核实的优势 | 与本项目的差距与借鉴点 |
|---|---|---|---|
| [fre:ac](https://github.com/enzo1982/freac) | 仓库页面约 2k stars；GPL-2.0；官网稳定版为 1.1.7，稳定发行日期和仓库提交活跃度需区别看待 | 跨平台批量编码、CD 抓取、标签与曲库命名 | 借鉴批量多目标和命名组织；不复制 GPL 代码，不把 CD 抓取并入 Web/移动共同核心。citeturn663174view0turn663174view5turn663174view6 |
| [LosslessCut](https://github.com/mifi/lossless-cut) | 最新可见 v3.70.2 于 2026-10-28 发布；GPL 系列许可 | 桌面无损切割、多平台发行 | 借鉴片段选择与发行资产校验；不复制 Electron 工作台或引入整套编辑器。citeturn663174view4 |
| [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) | wrapper 为 MIT；core/codecs 许可依构建配置；上游有近期发行 | 浏览器 worker + FFmpeg WebAssembly | 项目已使用该上游；关注 worker/打包、内存和 core 编码器许可。citeturn678629search0turn663174view3 |
| [HandBrake](https://github.com/HandBrake/HandBrake) | GPL-2.0；成熟多平台转码器 | 预设驱动的视频转码、编码器/队列工作流 | 借鉴渐进式预设体验，不引入视频定位或 GPL 代码。citeturn678629search3turn663174view1 |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | 源码 Unlicense；可分发 bundle 含其他许可依赖 | 下载后处理、FFmpeg 互操作 | 不增加下载功能；借鉴可选工具检测和具体错误上下文。citeturn663174view2turn678629search10 |

综合对照：Audio Studio 的优势是共享核心规则、多端入口、本地处理、Web 与原生 FFmpeg 双引擎，以及明确的保护源文件策略。与成熟桌面编辑器相比，专业轨道/快捷键工作流不足；与成熟批量编码器相比，格式探测能力和大批量队列操作仍需通过真实跨平台样本继续评估。应优先改善跨端行为一致性、格式能力可见性、错误恢复和可访问性，而不是增加下载或 DAW 功能。

## 4. 发现的问题

### 已修复

- Android 更新通知调用原先只捕获异常，没有先判断 Android 13+ 的通知运行权限，导致 Android Lint 的 `MissingPermission` 错误。本轮增加显式 `POST_NOTIFICATIONS` 权限检查；未授权时静默跳过系统通知，应用内更新检查逻辑仍可工作。
- Web 设置持久化在测试的受限环境中使用不可用的 `localStorage`，造成 Zustand 每项测试都输出存储错误。本轮为 settings store 加入可用性探测和内存后备；可用时继续使用用户浏览器 `localStorage`。
- Prettier 检查失败的 5 个文件按项目规则格式化；格式检查通过。
- Web 拖入目录原先只读 `FileSystemDirectoryReader.readEntries()` 的第一批结果，目录较大时可能漏导入。本轮提取独立目录扫描模块，循环读取到空批次，保留深度上限并将导入上限固定为 500 个音频文件；同时移除了未连接到选取流程的隐藏 input。

### 已发现、尚未解决

- Vite 构建成功，但 `platform/index.ts` 和 `engine/index.ts` 均有静态与动态混合导入警告，导致动态加载无法把这些模块单独拆分。当前不影响构建或测试，但懒加载/代码分块收益不足；重构前需先确认循环依赖和 Tauri 初始化时序。
- Android lint 最终成功，但报告仍有 28 条 warning 和 3 条 hint；Kotlin 编译另报告 `TaskRecord.kt` 的 nullable 调用警告及 `ParamPanel.kt` 的多余 `!!` 警告。应分优先级审查，避免一次性机械修改用户已有 UI/业务改动。
- 浏览器自动更新和桌面 Tauri 更新依赖 GitHub Release、部署环境与签名配置。此轮只测逻辑和构建，未实际安装新桌面包或对生产部署执行升级。
- 没有启动服务或真实设备 UI 自动化；Web 与 Android 的真实页面/文件选择器/权限工作流未做端到端手工验收。
- 按 `webapp-testing` 工作流尝试在端口 41739 做 Playwright 浏览器 UI 检查：Vite 服务成功启动，但 Playwright Chromium 报 `spawn UNKNOWN`，没有浏览器页面检查结果。服务器助手已停止本轮启动的服务；端口 41739 已释放。桌面与移动 UI 的视觉验收尚未完成。
- 桌面正式打包未跑；只跑 Cargo check/test/Clippy。Android instrumentation tests 未在连接设备/模拟器上运行。
- 竞品信息受在线索引覆盖有限影响，GitHub Star 数、所有项目当前 Issues 和完整代码架构未逐项复核；不据此声称完整市场调查。

## 5. 功能升级

- 新增/改进：Android 13+ 更新通知权限处理；设置存储受限时内存后备；修复 Web 拖入目录多批读取遗漏；为目录扫描新增 2 项回归测试；Prettier 格式一致性修复。
- 本轮没有从竞品迁移或复制代码；没有删减产品功能，也没有升级全部依赖。
- 已有工作区实现的更新提示、跨平台转换、剪辑、合并、元数据和分析等，属于审计开始前已存在的未提交工作，不能误记为本轮全新交付。

## 6. 架构升级

未做大规模重构。现有共享核心与平台适配层边界明确，足以支持后续针对明确缺陷的局部调整。新增 Web 存储回退位于 settings store 的存储适配配置；Android 通知权限逻辑留在更新检查模块。依赖声明和锁文件未调整。

## 7. UI/UX 升级

本轮未进行全站视觉重新设计。完成了静态 UI/UX 检查并记录现有 token、导航、对话框焦点管理、导入键盘交互与响应式结构；提出的音频工作流导向设计方向和问题清单见 `FEATURE_GAP_REPORT.md`。目录拖放超过首批条目时恢复完整读取；删除不可达的隐藏 input 不改变实际选取入口。由于 Playwright Chromium 无法启动，本轮无法给出真实截图或断言布局无溢出的结论。暂定 UI 分数为 68/100、UX 68/100，评分及依据见功能差距报告。

## 8. 测试报告

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | 通过 |
| `pnpm lint` | 通过 |
| `pnpm format:check` | 初始失败；修复格式后通过 |
| 共享核心测试 | 94 项通过，含本地 FFmpeg 集成用例 |
| Web 测试 | 111 项通过；存储警告修复后重跑通过 |
| Web Dropzone 目录导入测试 | 2 项通过：多批目录读取/过滤、500 文件上限 |
| Web `pnpm build:web` | 通过；保留 Vite 动态/静态混合导入警告 |
| Rust `cargo check` | 通过 |
| Rust `cargo test` | 45 项通过 |
| Rust `cargo fmt --check` | 通过 |
| Rust Clippy（`-D warnings`） | 通过 |
| Android `testDebugUnitTest --no-daemon` | 通过；先因并行 Gradle 缓存竞争失败，串行重跑通过 |
| Android `lintDebug --no-daemon` | 修复权限问题后通过；28 warnings、3 hints |
| npm 生产依赖 audit | 官方 registry：0 漏洞（18 个生产/可选依赖） |
| `git diff --check` | 通过 |
| Android 设备集成测试、浏览器 UI/E2E、桌面安装包打包 | 未运行；浏览器尝试因 Chromium `spawn UNKNOWN` 中断 |

测试没有启动本地网络服务，故没有占用项目端口，也未关闭任何进程。系统原有监听端口与长驻进程均保持不动。并行启动 Android 单元测试和 Lint 曾争用 Android 自身生成缓存；仅清理并重建 `.gitignore` 下的当前项目 Android build 目录后串行通过。

## 9. 文件修改记录

本轮直接编辑：

- `apps/android/app/src/main/java/com/audiostudio/app/updates/UpdateChecker.kt`：检查通知权限。
- `apps/web/src/stores/settings.ts`：设置持久化增加内存后备。
- `apps/web/src/__tests__/setup.ts`：测试环境仅在浏览器存储不可用时装配内存存储。
- `apps/web/src/__tests__/platform-update.test.ts`、`apps/web/src/components/UpdatePrompt.tsx`、`apps/web/src/i18n.ts`、`apps/web/src/pages/SettingsPage.tsx`、`apps/web/src/platform/index.ts`：Prettier 规范化。
- `apps/web/src/components/Dropzone.tsx`、`apps/web/src/platform/readAudioFiles.ts`、`apps/web/src/__tests__/Dropzone.test.tsx`：修复目录读取和加入回归测试。
- `PROJECT_AUDIT_REPORT.md`：本报告。
- `GITHUB_BENCHMARK_REPORT.md`、`FEATURE_GAP_REPORT.md`：新增对标报告和功能差距/评分报告。

删除/移动文件：无。工作区其他原有修改均保留。`git diff --check` 未发现空白错误；最终 Git 状态仍包含大量已有未提交修改和上述本轮文件，不可把整个工作区当作本轮单独 diff 审核。

## 10. 最终质量评估

相对审计开始时：Android 更新通知权限处理更安全；测试噪声和格式失败已解决；Web、Rust、Android 的本地自动检查覆盖充分且记录了未运行的设备/端到端项目。没有证据支持“整个产品已完成全面真实使用验收”的结论。当前更准确的评价是：核心代码构建和单元/集成检查通过，尚需人工跨端 UI/文件处理验收，并处理 lint warnings 与 Vite 分块警告。

## 11. 后续建议与验收重点

1. 在 Android 13+ 实机分别验证允许与拒绝通知权限、手动更新检查、打开 Release 页面和断网错误提示。
2. 在 Web 验收文件导入、真实转换、批量下载、Service Worker 更新切换；确认部署到子路径时 PWA 和 FFmpeg wasm 资源路径正确。
3. 在 Windows 桌面验证 FFmpeg/FFprobe 缺失、取消任务、输出文件冲突、路径权限及签名更新包安装/重启。
4. 审查并逐项修复 Android lint warnings；检查 Vite 两处动态/静态导入链，确保无循环依赖后再拆模块。
5. 为后续贡献者建立独立干净工作树/分支，先确认哪些现有未提交变更归属用户，再按文件审查并提交。
6. 当前没有提交或推送；验收期间请先检查本地差异，不要用 reset/checkout 清理当前工作区。
