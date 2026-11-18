# 第三方组件

Audio Studio 自有代码使用 MIT。各依赖按自身许可证使用，版本以 `pnpm-lock.yaml` 和 `apps/desktop/src-tauri/Cargo.lock` 为准。

| 组件 | 用途及交付方式 | 上游 |
|---|---|---|
| React、Zustand、idb | Web/桌面界面和本地数据 | [React（MIT）](https://github.com/facebook/react/blob/main/LICENSE)、[Zustand（MIT）](https://github.com/pmndrs/zustand/blob/main/LICENSE)、[idb（ISC）](https://github.com/jakearchibald/idb/blob/main/LICENSE) |
| Tauri 和插件 | Windows WebView 桥接、通知、文件对话框及签名更新 | [Tauri 许可证](https://github.com/tauri-apps/tauri#licenses) |
| 原生 FFmpeg / FFprobe | Windows 版从本机调用，由用户选择和安装构建 | [FFmpeg 许可及构建选项](https://ffmpeg.org/legal.html) |
| `@ffmpeg/ffmpeg` | Web Worker 包装与加载 | [ffmpeg.wasm 许可证说明](https://ffmpegwasm.netlify.app/docs/faq/#what-is-the-license-of-ffmpegwasm) |
| `@ffmpeg/core@0.12.10` | Web 部署者从 npm 上游获取，部署到自己的静态站 | [npm 包](https://www.npmjs.com/package/@ffmpeg/core/v/0.12.10)、[构建脚本与源树](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10) |

该 Web 核心启用了 GPL 组件。v0.2.3 起，GitHub 的 Web ZIP 提供静态应用和有固定 SHA-512 的准备脚本，Windows 安装包使用本机 FFmpeg。部署者公开分发 Web 核心时，需核对二进制对应的源代码、各链接库的许可证及分发要求。开发者本地的 `pnpm build:web` 仍可复制锁定的 npm 核心用于验证。
