# Audio Studio 项目现状审计

审计日期：2026-11-16（Asia/Shanghai）
审计范围：`E:\移动云盘同步盘\Audio Studio`，包含 `apps/web`、`apps/desktop/src-tauri`、`packages/shared`、构建脚本与 CI 配置。
审计基线：`main` 分支，初始版本 `0.2.0`，初始工作区无未提交修改。

## 1. 项目定位

Audio Studio 是一个同时面向 Windows 桌面和浏览器的音频转换与处理工具。它解决“在不依赖云端上传的情况下完成格式转换、批处理、剪辑、合并、元数据编辑和音频分析”的问题。目标用户包括音乐整理者、播客/视频制作者、语音资料维护者以及需要批量转码的普通桌面用户。

核心场景是：导入一个或多个本地音频文件，探测真实媒体信息，配置编码参数，执行转换/剪辑/合并，查看进度与日志，下载或定位输出文件，并在本地保留历史记录。

## 2. 真实技术架构

| 层 | 实际实现 | 证据 |
|---|---|---|
| 工作区 | pnpm 11 workspace，Node.js >=20 | `package.json`、`pnpm-workspace.yaml` |
| 共享核心 | TypeScript，格式注册、参数模型、状态机、错误码、路径/资源校验 | `packages/shared/src/` |
| Web UI | React 18、Vite 5、Zustand、双语/主题 | `apps/web/src/` |
| 浏览器引擎 | FFmpeg.wasm 0.12，本地 `public/ffmpeg` 核心，实例池并发执行 | `apps/web/src/engine/WasmFfmpegEngine.ts`、`loadFfmpeg.ts` |
| 桌面引擎 | Tauri 2 + Rust，原生 FFmpeg/FFprobe 子进程，Windows 文件/通知能力 | `apps/desktop/src-tauri/src/` |
| 持久化 | 浏览器 IndexedDB（历史与设置），桌面 JSON 设置/原生运行时状态 | `apps/web/src/stores/history.ts`、`settings.ts`、Rust state |
| 发布 | GitHub Actions、Web ZIP、Tauri 安装包与签名更新清单 | `.github/workflows/`、`docs/AUTO_UPDATE.md` |
| 许可证 | 项目整体 MIT；FFmpeg.wasm/FFmpeg 组件按各自上游许可证处理 | `LICENSE`、依赖清单 |

### 数据流

`Dropzone/文件选择 → SessionStore → probe → AudioEngine 抽象 → WasmFfmpegEngine 或 NativeEngine → FFmpeg → JobResult/HistoryStore → 下载、定位或桌面通知`。

任务状态机为 `queued → preparing → running → done/failed/cancelled`，队列泵根据并发设置调度，进度来自引擎事件而不是 UI 估算。

## 3. 已实现能力清单

- 13 种音频格式注册、参数派生和输出文件名模板。
- 单文件转换、批量转换、重试、暂停/取消、队列搜索和状态筛选。
- 无损剪辑（优先 `-c copy`，必要时回退重编码）、合并、淡入淡出。
- 流信息/元数据/封面/响度/频谱相关分析入口。
- Web FFmpeg.wasm 实例池与桌面原生 FFmpeg 引擎抽象。
- IndexedDB 历史记录、历史复用；本轮新增历史 JSON 导出/导入与校验。
- 中英文界面、浅色/深色主题、PWA、Tauri 更新器和 Windows 通知入口。
- 共享参数校验、文件名/路径安全检查、错误码映射、单元测试与 CI 脚本。

## 4. 基线检查结果

基线及本轮修改后的检查均采用仓库锁定命令；未关闭检查、未跳过失败用例。

| 检查 | 结果 | 说明 |
|---|---|---|
| `pnpm typecheck` | 通过 | shared、web 类型检查通过 |
| `pnpm lint` | 通过 | ESLint 通过 |
| `pnpm format:check` | 通过 | Prettier 通过 |
| `pnpm --filter @audio-studio/shared test` | 通过 | 81 passed，20 个需要系统 FFmpeg 的条件用例 skipped |
| `pnpm --filter @audio-studio/web test` | 通过 | 本轮修改后 136 tests（含 ErrorBoundary、历史导入导出、资源硬限制和 Native 设置传递覆盖） |
| `pnpm test:release-notes` | 通过 | 5 passed |
| `pnpm build:web` | 通过 | Vite 构建成功；存在动态导入与静态导入重复的 chunk warning |
| `pnpm --filter @audio-studio/desktop check` | 通过 | `cargo check` 通过 |
| `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` | 通过 | 45 passed；未安装系统 `ffmpeg`/`ffprobe`，真实进程集成部分按设计跳过 |
| 浏览器运行 | 通过 | `http://127.0.0.1:5187/` 可访问，首页、批量页、主题和中英文切换已通过 BrowserSkill 实际操作 |
| 桌面打包/真实转码 | 未完成 | 本机未发现 `ffmpeg`/`ffprobe`，且本轮未执行签名安装包安装回归 |

## 5. 优势

1. **核心逻辑复用度高**：格式、参数、状态机、错误和安全校验在 `packages/shared` 统一，降低 Web/桌面漂移。
2. **业务链路是真实执行**：进度、探测、转换和失败状态来自 FFmpeg 引擎事件，不是静态演示按钮。
3. **桌面/浏览器边界清晰**：同一套 React UI 通过 `AudioEngine` 切换 Wasm 与原生能力。
4. **测试基础较完整**：共享核心、Web UI、Rust 命令、更新器均有测试，且已有真实浏览器验收脚本。
5. **安全意识较好**：参数以数组传递而非 shell 拼接，共享层做路径遍历、文件名和资源限制校验，更新器校验 GitHub URL。

## 6. 缺陷、风险与技术债务

### P0/P1 风险

- **浏览器大文件内存风险**：FFmpeg.wasm 需要把输入和输出放入内存；过去只生成 warning，未在执行前阻止超过硬限制的文件。本轮已增加 `verdict=reject` 预检，但仍需要更成熟的流式/OPFS 方案。
- **桌面配置曾有前后端脱节**：通知和并发设置没有完整传入 Rust；本轮已修复调用链，但需要打包运行时验证。
- **桌面 CSP 原为 `null`**：本轮已改为最小化 CSP，仍需 Tauri 打包后的 WebView2 回归。
- **任务恢复不足**：刷新页面或进程崩溃后，运行中任务不能从持久化 journal 自动恢复。
- **外部 FFmpeg 依赖**：当前环境没有 `ffmpeg`/`ffprobe`，无法宣称已完成原生真实转码回归。

### P2/P3 技术债务

- `platform/index.ts`、`engine/index.ts` 同时被静态和动态导入，Vite 无法产生预期分块。
- 没有统一的诊断包、结构化日志导出和错误遥测（当前是有意的隐私友好设计，但排障能力不足）。
- 没有插件/效果扩展 API、项目/session 文件、预设导入导出和批量元数据编辑。
- 缺少磁盘空间预检、输出冲突策略预览、原子输出文件提交和更细粒度的重试退避。
- 缺少自动化可访问性、视觉回归、模糊测试、跨平台矩阵及已安装 MSI/NSIS 的冒烟测试。

## 7. 本轮已落地改进

- 浏览器引擎在写入虚拟文件系统前执行硬大小限制并返回可读错误。
- NativeEngine 将 `notifyOnDone` 和 `concurrency` 传入 Tauri `start_task`，Rust 端兼容旧调用并限制范围。
- 增加全局 React ErrorBoundary，渲染异常提供重试/刷新入口，避免白屏。
- 历史记录增加版本化 JSON 导入/导出、大小上限、记录校验、去重合并和 5000 条裁剪。
- 重置设置时同步重置语言 store，并显示完成反馈。
- 将 Tauri `security.csp` 从 `null` 改为显式白名单策略。

## 8. 成熟度判断

当前为“**功能完整的 0.2.x beta，具备继续发布基础，但尚未完成生产级桌面发布验收**”。Web 端核心流程和自动化测试较成熟；桌面端架构清晰、Rust 测试通过，但受本机缺少 FFmpeg、未安装验证签名包、未完成崩溃恢复和跨平台矩阵的限制，不能声称生产级全链路已验证。

## 9. 下一步方向

优先顺序应是：真实桌面 FFmpeg/FFprobe 与签名安装包回归 → 任务 journal/崩溃恢复和原子输出 → 磁盘/内存预检与流式大文件 → 可访问性与视觉回归 → 项目文件/插件/预设生态 → 跨平台 CI 与安全供应链报告。详细 EV 编号见 [UPGRADE_ROADMAP.md](UPGRADE_ROADMAP.md)。
