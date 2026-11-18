# Audio Studio 维护与交付记录

## 2026-11-18 审计基线

- 工作区为 `yuchen0x1/Audio-Studio` 的干净 `main`，基线提交 `aeb4b34`。公开仓库采用 MIT，有 v0.1.0 至 v0.2.2 四个发行标签。最新稳定版 v0.2.2 提供 Windows MSI、EXE、签名、Web ZIP 和更新清单。Issues 与 Wiki 开启，Discussions 关闭，未启用 Pages。保留现有仓库名称、产品定位和历史资产。
- 执行路径为 React 页面与 Zustand 编排，TypeScript 共享参数和状态统一，浏览器端在 Worker 中运行 FFmpeg.wasm，Windows 通过 Tauri IPC 调用原生 FFmpeg 并发任务。两端保持配置与 IndexedDB 历史。当前架构无需账号、远程处理 API、服务端数据库或音频上传。功能基线见 [README](../README.md) 和 [平台矩阵](PLATFORMS.md)。
- 改造前，本机 Node 24、pnpm 11 下共享测试通过 81 项，因系统 FFmpeg 缺失跳过 20 项，Web 137 项和发布日志 5 项通过。Cargo 45 项通过，其中探测原生 FFmpeg 的条件路径当时未执行。通过 BrowserSkill 实际打开首页和批量工作台。
- 本轮接入真实 FFmpeg 后，旧合并集成用例触发淡出时长校验，因为用例缺少引擎实际会传入的逐段探测数据。测试现从 FFprobe 取得该信息，并继续核对合并输出和音频时长。

## 维护状态

| 范围 | 状态或证据入口 |
|---|---|
| Windows x64、响应式 Web、PWA | [支持范围与验收矩阵](PLATFORMS.md) |
| 源码、PR 及分支保护 | [main](https://github.com/yuchen0x1/Audio-Studio/tree/main) 要求 PR、TypeScript/测试、Windows 桌面及依赖审查，禁止强推和删除，管理员同样受约束。当前仅有仓库所有者，独立审批人数设为零。 |
| 持续集成 | [CI](https://github.com/yuchen0x1/Audio-Studio/actions/workflows/ci.yml)，包括 JS、真实 FFmpeg、Rust、Web/Windows 打包和 Windows NSIS 冒烟。覆盖率作为构建附件保留。 |
| 供应链 | Dependabot 周期更新 npm、Cargo 和 Actions。依赖审查和 npm 审计作为门禁。GitHub 私密漏洞报告、Secret Scanning 与 Push Protection 已启用。 |
| 版本、包和更新 | [最新稳定版](https://github.com/yuchen0x1/Audio-Studio/releases/latest)、[发布记录](https://github.com/yuchen0x1/Audio-Studio/actions/workflows/release.yml)、[下载巡检](https://github.com/yuchen0x1/Audio-Studio/actions/workflows/release-health.yml) 与 [更新说明](AUTO_UPDATE.md)。 |
| 测试与平台技术债 | [升级路线图](../UPGRADE_ROADMAP.md)。还需扩大 Win10、MSI、移动浏览器的实机覆盖，以及升级、断网、磁盘不足和回滚验收。 |
| 竞品与产品演进 | [31 个研究对象](../COMPETITOR_ANALYSIS.md#2026-11-18-研究补充31-个对象) 与 [候选清单](../UPGRADE_ROADMAP.md)。 |

受支持平台的发行由同一标签锁定。新功能提 PR 时应提交平台影响和必要回归记录。标签流水线要求两个分发目标均构建通过，再校验签名与上传资产。故障修复走同一分支保护与验证流程。

系统发布者证书、从已装 v0.2.2 到新稳定版的实机自动升级，以及安装之后的自动回滚，需要独立验收。仓库巡检以 GitHub 下载、哈希与元数据为证据。
