# 平台支持与验收

Audio Studio 的核心场景是本地文件转换、剪辑、合并、分析和标签编辑。静态 Web 版本由浏览器读取用户主动选择的文件，并在 Worker 中处理。Windows 版使用系统 FFmpeg、FFprobe、文件对话框和通知，适合大文件与持续任务。两端共享格式、编码参数及任务状态机，版本依据同一 Git 标签发布。

| 平台 | 等级 | 可行性、体验和维护方式 |
|---|---|---|
| Windows 10 x64 | A | Tauri、WebView2 与 64 位 FFmpeg。原生文件、批量输出、通知可用。沿用 MSI/NSIS 及签名更新，需要单独真机兼容验收。 |
| Windows 11 x64 | A | 与 Win10 同一资产，独立运行时、系统文件选择和原生进程。签名更新由 Tauri 管理，安装、启动与卸载在 Windows CI 验证。 |
| Windows ARM64 | C | 需要独立 Tauri、FFmpeg 与更新资产，还需 ARM64 设备跑编解码及安装验收。 |
| Linux 通用、Ubuntu、Debian | C | Unix 文件路径、预装 FFmpeg、GTK/WebKitGTK 技术可行。需维护 AppImage/DEB、桌面集成、更新渠道和发行版设备矩阵。浏览器覆盖轻量场景。 |
| Fedora、Arch Linux | C | RPM/Flatpak/AUR 及系统编解码库有独立分发约束；需要验证沙箱目录、依赖和升级矩阵。 |
| macOS Intel、macOS Apple Silicon | C | Tauri 技术可行。两个架构均需原生 FFmpeg、权限适配、签名公证、安装及更新验收。当前可使用浏览器。 |
| Android 手机、Android 平板、折叠屏 | C | 原生选文件与后台任务需 SAF、前台服务、独立触控布局和设备矩阵。历史 APK 已停止维护。可使用响应式网页，前台处理且受浏览器内存限制。 |
| iOS、iPadOS | C | 可做独立产品，但沙盒文件、长任务、回写、原生库构建、商店签名及审核均需维护。iPad/iPhone 的浏览器使用需实机验收。 |
| 桌面 Web | A | HTTPS/localhost 静态站，内核同源。文件处理发生在浏览器，通过下载导出。支持格式取决于 FFmpeg.wasm 编译选项。 |
| 移动 Web、响应式 Web | A | 同一网址提供窄屏导航、触控文件选择与单列内容。受前台执行、存储配额与设备内存约束。 |
| PWA | B | 复用 Web 的同源引擎，通过图标、安装清单、独立窗口和 Service Worker 提供离线页面与更新。内核可在成功加载后缓存。 |
| Chrome、Edge、Firefox 扩展 | C | 页面功能可实现，扩展权限、WASM CSP、生命周期和商店审核会带来维护成本。浏览器已有相同工作流。 |
| Docker、NAS、私有化、云服务器 | C | 可托管 Web 静态目录。独立的远程转码会改变文件所有权与资源成本，增加上传、身份、后台队列、存储和安全维护。 |
| CLI | C | 可通过共享层扩展成 headless 模式，当前原生 FFmpeg 已覆盖直接脚本使用场景。 |

## 功能对照

| 功能 | Windows x64 | Web / PWA |
|---|---|---|
| 转换、批量队列、剪辑、合并、元数据和分析 | 本机原生 FFmpeg | FFmpeg.wasm Worker |
| 输入 / 输出 | 原生文件对话框、拖放与自选输出目录 | 文件选择/拖放，结果使用浏览器下载 |
| 进度、取消、重试、历史和用途预设 | 支持 | 支持 |
| 大文件 | 取决于本机磁盘与 FFmpeg | 取决于设备内存与 WASM 限制，有输入大小预检 |
| 设置 | WebView 本地存储及 Rust JSON | 浏览器本地存储 |
| 转换历史 | WebView IndexedDB，支持 JSON 导入导出 | IndexedDB，支持 JSON 导入导出 |
| 更新 | GitHub Releases 签名安装包 | 站点部署、已安装的候选 Worker 和确认刷新 |

## 发版验收

- 每轮检查共享测试、真实 FFmpeg 集成、Web 构建、Rust 测试和 Windows 打包。Web 使用生产构建走一次真实转换，PWA 核对装载、离线打开与等待更新。
- Windows 验证 NSIS 安装、新程序启动及卸载。真实用户身份的 UAC、MSI 生命周期、Win10、系统发布者信任及旧版自动升级另外记录。
- Web 移动验收记录准确的浏览器、操作系统和设备。遇到内存或后台限制，记录文件大小、操作和错误。
- 新增平台前提供专属用户场景、平台适配、CI 验收与长期分发渠道，再调整维护等级。
