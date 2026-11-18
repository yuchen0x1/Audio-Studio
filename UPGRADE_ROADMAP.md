# Audio Studio 持续升级路线图

建立日期：2026-11-16。
状态含义：`DONE` 已有代码与测试证据；`PARTIAL` 已落地但仍需桌面/发布环境验证；`PLANNED` 已确认有价值、尚未实施；`BLOCKED` 需要外部运行环境或发布权限。

## 总览

本轮形成 40 个相互独立、可验收的升级项：6 个已落地（其中 2 个需运行时复核），34 个按 P0–P3 排序的后续项。每项都绑定现有代码证据、竞品参考、实施边界和验收标准，不把同一功能机械拆分凑数。

## P0：安全、数据完整性和核心失败路径

### EV-001 浏览器大文件硬限制预检 — `DONE`

- 模块/问题/依据：Web `session` 在过去可能先把超大输入写入 FFmpeg.wasm 内存；依据 `packages/shared/src/validation.ts` 的 `WEB_SIZE_LIMIT` 与 `WasmFfmpegEngine.estimate()`。
- 参考/方案/效果：参考 FFmpeg/MediaInfo 的能力探测；引擎返回 `verdict=reject`，`executeTask` 在虚拟 FS 写入前失败并提示切换桌面版，避免 OOM 白屏。
- 文件/难度/优先级/验收：`packages/shared/src/engine.ts`、`apps/web/src/engine/WasmFfmpegEngine.ts`、`apps/web/src/stores/session.ts`、`session.test.ts`；中；P0；模拟 800 MB 以上估算时任务为 `E_OUT_OF_MEMORY` 且 `run` 未调用。

### EV-002 桌面通知与并发设置贯通 — `DONE`

- 模块/问题/依据：UI 设置曾未传入 Tauri `start_task`，导致桌面并发/通知可能与用户选择不一致；依据 `NativeEngine.ts` 与 `commands.rs` 调用链。
- 参考/方案/效果：参考 OBS 的前端/后端能力分层；传递 `notify`、`concurrency`，Rust 对旧客户端回退并将并发限制在 1–4。
- 文件/难度/优先级/验收：`apps/web/src/engine/NativeEngine.ts`、`apps/desktop/src-tauri/src/commands.rs`、`NativeEngine.test.ts`；中；P0；测试断言参数，桌面运行时启动 4 个任务时不超过 4 个并发且通知开关生效。

### EV-003 Tauri CSP 白名单硬化 — `PARTIAL`

- 模块/问题/依据：`tauri.conf.json` 原为 `security.csp: null`，扩大 WebView 注入面。
- 参考/方案/效果：参考 Tauri 安全模型与 OBS safe-mode 思路；限制脚本、连接、worker、媒体和对象来源，同时保留 FFmpeg.wasm 与 GitHub 更新所需来源。
- 文件/难度/优先级/验收：`apps/desktop/src-tauri/tauri.conf.json`；中；P0；打包后 WebView2 加载 FFmpeg、通知、更新检查均无 CSP 错误；本机未完成打包运行，故标记 PARTIAL。

### EV-004 全局渲染错误恢复面 — `DONE`

- 模块/问题/依据：未发现全局 React ErrorBoundary，渲染异常可能白屏；依据 `apps/web/src/main.tsx` 原入口。
- 参考/方案/效果：参考 Audacity/Tenacity 的可恢复桌面体验；新增 ErrorBoundary，提供重试、刷新、错误详情，且不上传日志。
- 文件/难度/优先级/验收：`apps/web/src/components/ErrorBoundary.tsx`、`main.tsx`、`ErrorBoundary.test.tsx`；低；P0；故意抛出 render error 时出现 `role=alert` 恢复界面，测试通过。

### EV-005 设置写入原子化与损坏回退 — `PARTIAL`

v0.2.3 提供同目录临时写入、落盘和原子替换。旧 JSON 继续兼容，已经损坏的配置回到默认值，自动恢复上一次备份仍待设计。

- 模块/问题/依据：Zustand persist 直接写 localStorage，极端中断或手工修改可能得到半截 JSON；依据 `apps/web/src/stores/settings.ts`。
- 参考/方案/效果：参考 Ardour session 与 beets 配置回退；增加版本号、临时键/校验和，解析失败回退默认并保留诊断。
- 文件/难度/优先级/验收：`apps/web/src/stores/settings.ts`、settings tests；中；P0；注入截断 JSON 后应用仍启动，默认值恢复且用户可导出诊断。

### EV-006 输出文件临时写入与原子提交 — `PLANNED`

- 模块/问题/依据：转换失败/进程崩溃时可能留下同名半文件；依据 Native/Rust 输出路径与 `deliverResult`。
- 参考/方案/效果：参考 fre:ac 与 LosslessCut；先写 `.part`，完成后 fsync/rename，冲突策略在任务创建前明确显示。
- 文件/难度/优先级/验收：`commands.rs`、`NativeEngine.ts`、平台下载模块；高；P0；杀掉 FFmpeg 后无可交付目标文件，成功任务只出现完整最终文件。

### EV-007 任务 journal 与崩溃恢复 — `PLANNED`

- 模块/问题/依据：刷新 Web 或桌面崩溃后运行中任务不持久化；依据 `session.ts` 仅内存的 `executing`/队列。
- 参考/方案/效果：参考 Ardour/Hydrogen session 与 OBS 崩溃恢复；记录任务快照、输入指纹、临时输出和最后事件，启动时恢复可重试状态。
- 文件/难度/优先级/验收：新增 `stores/taskJournal.ts`、Rust state；高；P0；强制杀进程后重启，任务显示“可恢复/需重试”，不重复交付已完成文件。

### EV-008 输入/输出路径竞态校验 — `PLANNED`

- 模块/问题/依据：文件在排队后被移动、替换或输出目录权限改变时，错误只能到执行阶段暴露。
- 参考/方案/效果：参考 MediaInfo probe 与 fre:ac 队列；入队保存 size/mtime/hash 前缀，执行前重新校验并给出可操作错误。
- 文件/难度/优先级/验收：`shared/validation.ts`、`session.ts`、`commands.rs`；中；P0；改变源文件后任务失败为明确 `E_SOURCE_CHANGED`，不覆盖新文件。

### EV-009 依赖、FFmpeg 与许可证 SBOM — `PLANNED`

- 模块/问题/依据：项目 MIT 与 FFmpeg/wasm/插件许可证边界分散在文档，发布前缺少机器可读清单。
- 参考/方案/效果：参考 FFmpeg、OBS、Kdenlive 发布目录；生成 lockfile、二进制、许可证、编译选项和 NOTICE 清单。
- 文件/难度/优先级/验收：新增 `scripts/license-report.mjs`、`NOTICE-THIRD-PARTY.md`、CI job；中；P0；CI 在依赖变更时生成可审计报告并拒绝缺失许可证。

### EV-010 更新包签名/安装回滚 E2E — `BLOCKED`

- 模块/问题/依据：更新器代码和工作流存在，但本轮未生成并安装真实签名 MSI/NSIS；依据 `docs/AUTO_UPDATE.md` 与 CI 配置。
- 参考/方案/效果：参考 Tauri updater、fre:ac 发布；下载、SHA-256、签名校验、备份、安装、重启、失败回滚全链路自动化。
- 文件/难度/优先级/验收：`.github/workflows/release.yml`、`apps/desktop/src-tauri/tauri.conf.json`、安装测试脚本；高；P0；在干净 Windows runner 安装旧版并升级，版本、配置、历史数据和回滚均通过；需要签名密钥/CI runner。

## P1：核心工作流与用户体验

### EV-011 历史记录版本化导入导出 — `DONE`

- 模块/问题/依据：历史只能在当前浏览器 IndexedDB 中查看，缺少迁移/备份；依据 `stores/history.ts`。
- 参考/方案/效果：参考 beets 可重放导入与 Picard 批处理；增加版本化 JSON、2 MB/5000 条上限、字段校验、去重合并、导入导出按钮。
- 文件/难度/优先级/验收：`history.ts`、`HistoryPage.tsx`、`history.test.ts`；中；P1；合法 JSON 往返保持记录，恶意/超限输入被拒绝并提示，测试通过。

### EV-012 重置设置与语言状态一致 — `DONE`

- 模块/问题/依据：设置页重置只更新 settings store，i18n store 可能继续保留英文；依据 `SettingsPage.tsx` 与 `i18n.ts` 双持久化。
- 参考/方案/效果：参考 Audacity/Tenacity 的完整偏好重置；重置时同步 `setLang('zh')`、主题和反馈 toast。
- 文件/难度/优先级/验收：`SettingsPage.tsx`；低；P1；英文状态点击重置后语言、主题和所有默认值一致，页面显示完成反馈。

### EV-013 剪辑/合并 Undo/Redo — `PLANNED`

- 模块/问题/依据：参数弹窗和批量修改没有统一撤销栈，误操作需要重新导入；依据 pages/components 状态直接写 store。
- 参考/方案/效果：参考 Audacity 多轨编辑；为文件参数、片段列表和批量补丁建立命令栈，限制内存并支持键盘快捷键。
- 文件/难度/优先级/验收：新增 `stores/historyStack.ts`、剪辑/合并页面；中；P1；连续修改后 Ctrl/Cmd+Z、Redo 恢复完全相同的参数快照，任务执行快照不受影响。

### EV-014 批量队列拖拽/键盘排序 — `PLANNED`

- 模块/问题/依据：当前队列可搜索/筛选但缺少显式顺序调整；依据 `BatchPage.tsx`。
- 参考/方案/效果：参考 LosslessCut 片段队列与 Kdenlive 轨道排序；支持拖拽、上移/下移、键盘操作和位置播报。
- 文件/难度/优先级/验收：`BatchPage.tsx`、queue components、ARIA tests；中；P1；鼠标和键盘均能改变顺序，刷新前后任务顺序可见且不破坏并发调度。

### EV-015 桌面 FFmpeg/FFprobe 路径诊断 UI — `PLANNED`

- 模块/问题/依据：README 要求系统 PATH 或应用目录，但 UI 没有版本/路径自检入口。
- 参考/方案/效果：参考 MediaInfo 与 fre:ac 的编码器配置；设置页显示实际二进制路径、版本、能力和一键重新探测。
- 文件/难度/优先级/验收：`commands.rs`、`NativeEngine.ts`、`SettingsPage.tsx`；中；P1；缺失二进制时给出安装/选择路径指引，能力表来自真实 `-encoders/-filters`。

### EV-016 磁盘空间与临时目录预检 — `PLANNED`

- 模块/问题/依据：大文件输出可能因磁盘不足在长任务末尾失败；依据 Native 输出和无统一空间估算。
- 参考/方案/效果：参考 Kdenlive 代理/渲染和 fre:ac 批处理；按输入、预计峰值和输出格式预留安全余量，执行前/过程中提示。
- 文件/难度/优先级/验收：Rust disk-space command、shared estimator、UI；中；P1；低于阈值时任务不启动并显示所需/可用空间，空间释放后可重试。

### EV-017 输出命名预览与冲突策略 — `PLANNED`

- 模块/问题/依据：当前模板在执行时生成，冲突重命名由后端决定，用户难以预览最终路径。
- 参考/方案/效果：参考 LosslessCut/fre:ac；入队前展示样例、冲突数量和“覆盖/递增/跳过”策略，始终保护源文件。
- 文件/难度/优先级/验收：`buildOutputFileName`、Batch UI、Rust output resolver；中；P1；同一批次可预览每个目标名，冲突策略与实际结果一致。

### EV-018 任务失败分类、退避与可重试策略 — `PLANNED`

- 模块/问题/依据：当前重试按钮存在，但网络/权限/源损坏/资源不足未统一分类和退避。
- 参考/方案/效果：参考 OBS safe-mode/诊断和 Kdenlive 长任务；错误码映射为 transient/permanent/user-action，指数退避且有最大次数。
- 文件/难度/优先级/验收：`shared/errors.ts`、`session.ts`、Rust error mapping；中；P1；模拟权限、临时占用、源损坏分别得到不同提示和重试行为。

### EV-019 诊断包导出（隐私脱敏） — `PLANNED`

- 模块/问题/依据：日志散落在任务状态，用户遇到桌面 FFmpeg 问题无法一次提供环境信息。
- 参考/方案/效果：参考 OBS Log/Crash report；导出版本、平台、引擎能力、脱敏错误、任务摘要和测试命令，不包含文件内容/路径密钥。
- 文件/难度/优先级/验收：新增 `diagnostics.ts`、Settings UI、Rust command；中；P1；导出 zip/JSON 可重现问题，扫描不出现绝对用户路径和令牌。

### EV-020 双语文案完整性审计 — `PLANNED`

- 模块/问题/依据：页面仍存在散落中文字符串，新增错误和导入导出文案需持续保持一致；依据 `rg` 对 `apps/web/src/pages` 的结果。
- 参考/方案/效果：参考 Tenacity/Audacity 的统一资源键；建立缺失键脚本和参数化文案，错误码统一从 i18n 取文案。
- 文件/难度/优先级/验收：`i18n.ts`、各页面、`scripts/check-i18n.mjs`；中；P1；CI 在中英文键集合不一致时失败，语言切换不出现原始 key。

### EV-021 全局键盘快捷键与焦点恢复 — `PLANNED`

- 模块/问题/依据：Dropzone/Modal 已有局部可访问性，但队列控制和页面切换没有统一快捷键规范。
- 参考/方案/效果：参考 Audacity/Tenacity；实现导入、开始/暂停、取消、重试、撤销、搜索聚焦，并避免输入框冲突。
- 文件/难度/优先级/验收：新增 `hooks/useShortcuts.ts`、focus manager、测试；中；P1；键盘完成主要流程，焦点始终可见且屏幕阅读器有状态反馈。

### EV-022 批量元数据表格与可撤销写入 — `PLANNED`

- 模块/问题/依据：当前元数据编辑偏单文件，缺少多文件字段填充和预览；依据 Picard/Kid3 对标。
- 参考/方案/效果：支持表格粘贴、字段模板、封面批量替换、写入前 diff 与撤销备份。
- 文件/难度/优先级/验收：新增 `MetadataBatchPage`、shared metadata patch、engine jobs；高；P1；100 个文件可预览 diff，失败文件不影响成功文件且可恢复原标签。

## P2：架构、性能与扩展能力

### EV-023 消除动态/静态重复导入 — `PLANNED`

- 模块/问题/依据：`pnpm build:web` 报 `platform/index.ts`、`engine/index.ts` 同时静态/动态导入，无法形成预期 chunk。
- 参考/方案/效果：参考 Vite 代码分割实践；统一入口并将平台实现按模式异步加载，减少初始包和警告。
- 文件/难度/优先级/验收：`apps/web/src/platform/index.ts`、`engine/index.ts`、Vite config；中；P2；构建无重复动态导入 warning，首页首包体积下降并通过运行时回归。

### EV-024 Waveform/频谱计算移出主线程 — `PLANNED`

- 模块/问题/依据：分析和波形处理可能阻塞 React 主线程；依据 `waveform.ts` 与分析页面。
- 参考/方案/效果：参考 Sonic Visualiser 图层/后台分析；使用 Web Worker/可取消任务并分块传输结果。
- 文件/难度/优先级/验收：`workers/waveform.worker.ts`、analysis store；中；P2；大文件分析期间 UI 60fps 目标不被长同步计算阻塞，取消可生效。

### EV-025 OPFS/流式大文件路径 — `PLANNED`

- 模块/问题/依据：FFmpeg.wasm 读写内存限制 800 MB 硬阈值；依据 `WasmFfmpegEngine`。
- 参考/方案/效果：参考 FFmpeg.wasm 与 LosslessCut 的流式/无损思路；在支持的浏览器使用 OPFS/分块 I/O，失败回退桌面建议。
- 文件/难度/优先级/验收：`WasmFfmpegEngine.ts`、OPFS adapter、feature detection；高；P2；1 GB 级文件不复制多份到 JS heap，内存峰值与取消行为有实测记录。

### EV-026 性能基准与回归门槛 — `PLANNED`

- 模块/问题/依据：当前只有功能测试，没有启动、probe、转码、历史导入性能基线。
- 参考/方案/效果：参考 Kdenlive benchmark/CI；固定合成样本，记录 Web/桌面耗时、峰值内存、输出大小，设可接受回归阈值。
- 文件/难度/优先级/验收：新增 `scripts/benchmark`、CI artifact；中；P2；每次核心改动生成可比较 JSON，超过阈值 CI 警告或失败。

### EV-027 FFmpeg 能力缓存与版本迁移 — `PLANNED`

- 模块/问题/依据：每次初始化可能重复扫描 encoders/muxers/filters，版本变化没有缓存失效策略。
- 参考/方案/效果：参考 MediaInfo capability schema；以引擎类型+版本+核心 hash 为键缓存，升级/缺失时自动失效。
- 文件/难度/优先级/验收：`engine/capabilities.ts`、IndexedDB/settings；低；P2；冷启动只扫描一次，换核心版本后重新探测且不使用旧能力。

### EV-028 轻量效果/插件 API — `PLANNED`

- 模块/问题/依据：格式转换参数集中但没有可扩展效果或第三方插件边界；依据 LMMS/OBS/Sonic Visualiser 对标。
- 参考/方案/效果：定义纯数据 manifest、参数 schema、能力声明和沙箱执行边界；首批只允许内置 filter graph。
- 文件/难度/优先级/验收：新增 `packages/plugin-api`、plugin registry；高；P2；第三方 manifest 可被校验、禁用、版本化，不能直接执行任意脚本。

### EV-029 预设导入导出与分享链接 — `PLANNED`

- 模块/问题/依据：当前预设是内置按钮，用户无法保存/迁移自定义参数。
- 参考/方案/效果：参考 LMMS/fre:ac；版本化 JSON 预设，过滤路径/脚本字段，支持导入、覆盖确认和只读分享文本。
- 文件/难度/优先级/验收：`stores/presets.ts`、Preset UI、schema validator；中；P2；导出的预设在另一浏览器导入后产生相同参数，非法字段拒绝。

### EV-030 可持久化项目/session 文件 — `PLANNED`

- 模块/问题/依据：任务与文件参数目前只在当前会话内存，无法保存一个可复用工作单元。
- 参考/方案/效果：参考 Ardour/Hydrogen/Kdenlive；设计 `.audiosession`，保存相对路径、指纹、参数、片段、历史版本，不嵌入原始音频。
- 文件/难度/优先级/验收：新增 shared schema、Open/Save UI、迁移器；高；P2；项目可在另一台机器打开并标记缺失源，版本迁移不丢参数。

### EV-031 分析结果持久化与可导出报告 — `PLANNED`

- 模块/问题/依据：频谱/响度分析结果没有稳定的项目级保存和 CSV/JSON 导出。
- 参考/方案/效果：参考 Sonic Visualiser；保存采样率、窗口、算法版本和结果摘要，支持重算/导出而不混淆旧结果。
- 文件/难度/优先级/验收：`analysis` store、report exporter；中；P2；同一输入/算法版本结果可重现，导出文件包含单位和版本元数据。

### EV-032 结构化 Probe schema 与长尾样本回归 — `PLANNED`

- 模块/问题/依据：probe 已有 `ProbeResult`，但流级字段和异常格式覆盖有限；依据 MediaInfo 对标。
- 参考/方案/效果：扩展 stream disposition、bit depth、layout、attached picture、chapters，并收集脱敏样本 fixture。
- 文件/难度/优先级/验收：`packages/shared/src/probe.ts`、fixture tests；中；P2；新增样本不会破坏旧字段，UI 对未知字段安全降级。

### EV-033 Worker/实例池背压与取消优化 — `PLANNED`

- 模块/问题/依据：Wasm 实例池已有并发上限，但等待者、取消和长任务内存回收缺少基准。
- 参考/方案/效果：参考 FFmpeg.wasm 多实例与 Kdenlive 队列；增加背压、优先级、空闲实例回收和取消超时。
- 文件/难度/优先级/验收：`WasmFfmpegEngine.ts`、scheduler tests；高；P2；并发 1–4 压测无任务饥饿，取消后实例可回收且无泄漏趋势。

### EV-034 离线 PWA 更新恢复 — `PARTIAL`

v0.2.3 提供整份应用资源预缓存、构建与路径隔离和候选 Worker 确认切换。缓存回收及移动浏览器的配额行为仍需实机矩阵。

- 模块/问题/依据：Service Worker 有缓存/版本逻辑，但网络中断时缺少用户可见恢复动作。
- 参考/方案/效果：参考 Web/PWA 更新实践；显示缓存版本、下载失败重试、清理旧缓存和安全回退到上一版本。
- 文件/难度/优先级/验收：`apps/web/public/sw.js`、`updates.ts`、Update UI；中；P2；模拟断网/半更新后仍可启动，恢复后只切换完整资源集。

## P3：工程化、质量与生态

### EV-035 自动化可访问性审计 — `PLANNED`

- 模块/问题/依据：局部 Modal/Dropzone 有焦点处理，但没有 axe/键盘全页门禁。
- 参考/方案/效果：参考 Tenacity/Audacity；加入 axe、tab 顺序、对比度、ARIA 状态和窄屏检查。
- 文件/难度/优先级/验收：Playwright/axe 脚本与 CI；中；P3；主页面无严重/关键可访问性违规，键盘完成导入到下载。

### EV-036 视觉回归与多 DPI 截图 — `PLANNED`

- 模块/问题/依据：已有浏览器真实验收截图，但无基线 diff；桌面高 DPI 未覆盖。
- 参考/方案/效果：参考 Kdenlive Appium/截图测试；固定 Chromium/Windows 尺寸和 125%/150% DPI 截图，允许受控差异。
- 文件/难度/优先级/验收：`docs/screenshots`、Playwright visual suite；中；P3；导航、批量、设置和错误态差异超过阈值时 CI 失败。

### EV-037 Fuzzer/Sanitizer 持续集成 — `PLANNED`

- 模块/问题/依据：解析器、模板、FFmpeg 输出分类存在恶意/异常输入面，当前以单元样本为主。
- 参考/方案/效果：参考 Kdenlive fuzzer/sanitizer 与 FFmpeg 测试；对 probe、参数模板、日志解析做 fuzz，Rust 开启 sanitizer 任务。
- 文件/难度/优先级/验收：`.github/workflows/fuzz.yml`、fuzz targets；高；P3；每周/PR 运行固定时间预算，无 panic/越界，失败保留最小样本。

### EV-038 跨平台 CI 矩阵 — `PLANNED`

- 模块/问题/依据：当前重点为 Windows/Web，Linux/macOS 原生构建和浏览器矩阵未验证。
- 参考/方案/效果：参考 Ardour/Kdenlive/OBS 多平台 CI；加入 ubuntu/macos/windows、Chromium/Firefox/WebKit 的类型/测试/构建矩阵。
- 文件/难度/优先级/验收：`.github/workflows/ci.yml`；中；P3；三平台共享测试与至少两种浏览器通过，系统 FFmpeg 版本记录在 artifact。

### EV-039 发布物 SBOM、NOTICE 与可复现元数据 — `PLANNED`

- 模块/问题/依据：发布流程有 hash/signature，但缺少 SBOM、构建 commit、FFmpeg 配置和许可证附件。
- 参考/方案/效果：参考 OBS/Kdenlive/FFmpeg 发布；每个 ZIP/MSI 附带 SBOM、NOTICE、源 commit、构建器和 hash。
- 文件/难度/优先级/验收：release workflow/scripts；中；P3；下载的发布物能独立核对来源、依赖许可证与 SHA-256，缺件则拒绝发布。

### EV-040 已安装桌面版冒烟与长时稳定性测试 — `BLOCKED`

- 模块/问题/依据：本轮只完成 Rust check/test，未安装 MSI/NSIS，也未在有 FFmpeg 的机器运行长任务。
- 参考/方案/效果：参考 fre:ac/OBS 发布验证；安装、启动、导入、批量转码、通知、更新、卸载保留数据，并运行 2 小时队列稳定性。
- 文件/难度/优先级/验收：新增 Windows runner/安装脚本与测试资产；高；P3；干净虚拟机从安装到卸载全流程通过，内存/句柄无持续增长；需要 Windows runner、FFmpeg 和签名产物。

## 执行顺序

1. 先完成 EV-003、EV-005–010，消除数据丢失、供应链和桌面发布风险。
2. 再完成 EV-013–022，提升批量工作流、恢复能力和可访问性。
3. 随后做 EV-023–034，优化大文件、分析、扩展和项目文件架构。
4. 最后落地 EV-035–040，形成可持续发布与质量门禁。

本路线图不把“未在本机执行的桌面打包/安装”伪装成完成项；阻塞项的外部条件和验收方法已写入对应条目。
