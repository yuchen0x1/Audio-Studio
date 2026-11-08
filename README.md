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

需要 **Node.js ≥ 20** 与 **pnpm 9+**。

```bash
pnpm install          # 会自动把 FFmpeg.wasm 内核复制到 apps/web/public/ffmpeg
pnpm dev              # 启动 Web 开发服务器（http://localhost:5180）
```

> `apps/web/public/ffmpeg/` 是 `postinstall` 生成的产物（约 32 MB），不入版本库。

### 常用命令

```bash
pnpm typecheck        # 全量 TypeScript 类型检查
pnpm test             # shared + web 单元测试
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
| 共享核心 | 88 | `pnpm --filter @audio-studio/shared test` |
| Web | 21 | `pnpm --filter @audio-studio/web test` |
| Rust | 45 | `cd apps/desktop/src-tauri && cargo test` |
| Android | 24 | `cd apps/android && ./gradlew testDebugUnitTest` |

测试使用包内临时目录并串行执行，避免并发写缓存导致的偶发失败。

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

## 持续集成与发布

推送到 `main` 或提交 PR 时，CI 会并行跑三端：

| Job | 内容 |
|---|---|
| 类型检查与测试 | `tsc --noEmit`、shared 88 + web 21 单测、`vite build` |
| Windows 桌面 | `cargo test`、`tauri build`，产出 MSI 与 NSIS 安装包 |
| Android | `testDebugUnitTest`、`assembleDebug`，产出 APK |

发布新版本只需打标签：

```bash
git tag v0.1.0
git push origin v0.1.0
```

`Release` 工作流会自动构建三端产物并创建 GitHub Release：

- `AudioStudio-v0.1.0-web.zip` —— 静态站点（含 FFmpeg.wasm）
- `Audio Studio_0.1.0_x64-setup.exe` / `.msi` —— Windows 安装包
- `AudioStudio-v0.1.0-debug.apk` —— debug 签名，可直接安装

> Android 尚未配置发布签名，Release 中提供的是 debug 签名 APK。
