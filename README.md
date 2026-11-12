# Audio Studio

[![CI](https://github.com/yuchen0x1/Audio-Studio/actions/workflows/ci.yml/badge.svg)](https://github.com/yuchen0x1/Audio-Studio/actions/workflows/ci.yml)
[![Release](https://github.com/yuchen0x1/Audio-Studio/actions/workflows/release.yml/badge.svg)](https://github.com/yuchen0x1/Audio-Studio/actions/workflows/release.yml)

多平台专业音频转换工具，一套共享核心逻辑，覆盖 **Web / Windows 桌面 / Android** 三端。

支持 13 种音频格式互转、批量处理、无损剪辑、合并、元数据与封面编辑，以及频谱/响度分析。Web 端基于 FFmpeg.wasm，桌面与 Android 端调用本地原生 FFmpeg。

---

## 功能

| 模块 | 说明 |
|---|---|
| 格式转换 | 单文件转换，实时进度、剩余时间、日志输出 |
| 批量转换 | 目录/多选导入，统一参数批量执行，失败可重试 |
| 音频剪辑 | 无损截取（`-c copy` 优先），自动回退重编码 |
| 音频合并 | 多段拼接，支持淡入淡出、逐段时长探测 |
| 音频分析 | 流信息、元数据、封面、警告项检测 |
| 元数据编辑 | 标题/艺术家/专辑/年份/流派/注释与封面图读写 |
| 转换历史 | 本地持久化任务记录，可复用参数 |
| 设置 | 默认格式、比特率、采样率、输出命名规则、并发数、主题、语言 |

**支持格式**：MP3、WAV、FLAC、AAC、M4A、OGG Vorbis、Opus、WMA、AIFF、APE、AC3、AMR-NB、ALAC

**界面**：简体中文 / English 双语，浅色与深色主题。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 共享核心 | TypeScript（纯逻辑，零运行时依赖），格式化参数、命名规则、任务状态机、错误码、能力矩阵、校验规则 |
| Web | React 18 + Vite 5 + Zustand + FFmpeg.wasm 0.12（多线程实例池、IndexedDB 历史） |
| Windows 桌面 | Tauri 2 + Rust，原生 FFmpeg 进程调用，Windows 通知与文件对话框 |
| Android | Kotlin + Jetpack Compose + Media3，原生 FFmpeg，SAF/MediaStore 读写 |

Web 前端同时作为桌面版 UI（`vite build --mode desktop`），三端共用同一套交互与文案。

---

## 目录结构

```
.
├── apps/
│   ├── web/                    # React 前端（Web 版 + 桌面版 UI）
│   │   ├── src/engine/         # 引擎抽象：WasmFfmpegEngine / NativeEngine
│   │   ├── src/pages/          # 9 个功能页
│   │   ├── src/stores/         # Zustand：session / settings / history
│   │   └── scripts/            # postinstall 复制 FFmpeg 内核到 public/ffmpeg
│   ├── desktop/src-tauri/      # Rust 后端：进程管理、进度解析、文件系统
│   └── android/                # Kotlin App：Compose UI + Service + FFmpeg
├── packages/
│   └── shared/                 # 三端共享核心逻辑与单元测试
├── pnpm-workspace.yaml
└── package.json
```

---

## 快速开始

需要 **Node.js ≥ 20** 与 **pnpm 11**（仓库锁定 `pnpm@11.20.0`，建议用 corepack 启用）。

```bash
pnpm install          # 会自动把 FFmpeg.wasm 内核复制到 apps/web/public/ffmpeg
pnpm dev              # 启动 Web 开发服务器（http://localhost:5180）
```

> `apps/web/public/ffmpeg/` 是 `postinstall` 生成的产物（约 32 MB），不入版本库。

### 常用命令

```bash
pnpm typecheck        # 全量 TypeScript 类型检查
pnpm lint             # ESLint（TS/TSX + 构建脚本）
pnpm format:check     # Prettier 格式检查（pnpm format 自动修复）
pnpm test             # shared + web 单元测试
pnpm test:coverage    # 带 v8 覆盖率（输出 lcov + html）
pnpm build:web        # 构建 Web 产物到 apps/web/dist

# 桌面版（需 Rust 1.77+ 与 WebView2）
pnpm build:desktop-ui
cd apps/desktop/src-tauri && cargo run          # 开发运行
cd apps/desktop/src-tauri && cargo build        # 生成可执行文件
npx tauri build                                  # 打包 MSI / NSIS 安装包

# Android（需 JDK 17 + Android SDK 35）
cd apps/android && ./gradlew assembleDebug      # 产出 app/build/outputs/apk/debug
cd apps/android && ./gradlew testDebugUnitTest
```

### 桌面版依赖

桌面端调用系统 FFmpeg，需要保证 `ffmpeg`/`ffprobe` 在 `PATH` 中，或放在应用同目录下。

---

## 测试

| 范围 | 用例数 | 命令 |
|---|---|---|
| 共享核心 | 94 | `pnpm --filter @audio-studio/shared test` |
| Web | 95 | `pnpm --filter @audio-studio/web test` |
| Rust | 45 | `cd apps/desktop/src-tauri && cargo test` |
| Android | 24 | `cd apps/android && ./gradlew testDebugUnitTest` |

测试使用包内临时目录并串行执行，避免并发写缓存导致的偶发失败。`pnpm test:coverage` 生成 v8 覆盖率（lcov + html，共享核心约 90%）。

---

## 设计要点

- **引擎抽象**：`AudioEngine` 接口统一 `probe` / `run` / `cancel`，Web 走 wasm、桌面走原生进程，上层页面无感知。
- **参数集中在 shared**：编码器参数、采样率、声道、码率映射只在 `packages/shared` 定义一次，避免三端漂移。
- **任务状态机**：`queued → running → done/failed/canceled`，进度与日志通过统一事件流上报。
- **错误可读**：`errors.ts` 定义错误码与用户可读文案，不把 FFmpeg 原始输出直接抛给界面。

---

## 许可证

[MIT](./LICENSE)

---

## 最新更新

当前 `main` 已接入三端 GitHub Releases 更新检查、主分支发布校验、Windows 签名更新约束、Android/Web 版本对齐，以及更完整的目录导入和受限存储回退。完整记录见 [docs/releases/release-notes.md](./docs/releases/release-notes.md)。

---

## 持续集成与发布

自动更新和 GitHub Release 的完整说明见 [docs/AUTO_UPDATE.md](./docs/AUTO_UPDATE.md)。所有版本更新都从 `main` 分支发布；Windows 更新包要求 Tauri 签名，Web 和 Android 的安装方式受各自平台限制。

推送到 `main` 或提交 PR 时，CI 会并行跑三端：

| Job | 内容 |
|---|---|
| 类型检查与测试 | `tsc --noEmit`、ESLint、Prettier 格式检查、shared + web 单测与覆盖率、`vite build` |
| Windows 桌面 | `cargo fmt --check`、`clippy -D warnings`、`cargo test`、`tauri build`，产出 MSI 与 NSIS 安装包 |
| Android | `testDebugUnitTest`、`lintDebug`、`assembleDebug`，产出 APK |

发布新版本只需打标签：

```bash
git tag v0.1.0
git push origin v0.1.0
```

`Release` 工作流会先将 `RELEASE_TAG`（例如 `v0.1.0`）校验并规范化为 `0.1.0`，再将该版本注入 Web 前端和 Tauri 桌面包；本地开发和未设置发布变量时仍默认使用 `0.1.0`。工作流只读取签名私钥 Secrets，不会修改或输出私钥。

`Release` 工作流会自动构建三端产物并创建 GitHub Release：

- `AudioStudio-v0.1.0-web.zip` —— 静态站点（含 FFmpeg.wasm）
- `Audio Studio_0.1.0_x64-setup.exe` / `.msi` —— Windows 安装包；同时生成签名的 `.nsis.zip` / `.msi.zip` 更新包与 `.sig`
- `AudioStudio-v0.1.0-debug.apk` —— debug 签名，可直接安装

应用内更新行为：

- Web / Windows 桌面 / Android 的设置页都会显示当前版本、项目仓库、GitHub Release 更新日志和“立即检查”。
- 默认开启低频自动检查；应用运行期间最多每 24 小时访问一次 GitHub Releases。发现新版本后弹出更新窗口，用户点击“立即更新”即可进入更新流程。
- Web 版会等待 Service Worker 切换到已部署的最新资源并自动刷新页面；浏览器不能替换服务器文件，服务器发布仍由 GitHub Actions 或静态托管平台完成。
- Windows 桌面版使用 Tauri 签名更新包自动下载、安装、重启并打开新版本。发布前必须将对应私钥配置为仓库 Secrets：`TAURI_SIGNING_PRIVATE_KEY`（以及可选的 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`）。
- Android 当前 Release 仍为 debug APK，系统安装前需要用户确认；正式分发前应配置 release signing，Android 不会静默安装 APK。

> Android 尚未配置发布签名，Release 中提供的是 debug 签名 APK。
