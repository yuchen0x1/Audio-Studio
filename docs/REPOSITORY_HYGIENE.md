# 仓库文件管理与清理记录

核查日期：2026-11-13。当前维护范围为 **Windows 电脑版和网页版**。

> 本页的“远程尚未同步”等描述记录清理阶段的审计时点。后续已按用户要求推送 `657966f`，远程当前源码只保留 Windows / Web，内部过程文件和旧报告已从 main 移除；v0.1.0 线上日志也已补全，历史 APK 保留。v0.2.0 的最终发布与下载验收见 [发布验证](releases/v0.2.0-validation.md)。

## 文件归属

| 内容 | 处理方式 |
|---|---|
| `apps/web`、`apps/desktop`、`packages/shared`、测试、图标与构建配置 | 进入源码仓库 |
| `pnpm-lock.yaml`、`Cargo.lock` | 保留，保障依赖可复现，不作为垃圾清理 |
| `docs/releases/release-notes.md` | 统一版本历史，按 Windows / Web 说明功能变化 |
| `docs/screenshots`、维护文档 | 保留可用截图和当前维护依据，避免重复报告散落根目录 |
| `node_modules`、FFmpeg.wasm 本地内核 | 保留正常开发所需文件，通过安装脚本生成，不上传 |
| `target`、`dist`、coverage、Vitest/Vite 临时目录 | 可重新生成，不上传；当前可用安装包和 Web 构建可留本地 |
| `.workbuddy` | 本地工具历史，保留且忽略，不上传 |
| `.evolution` | 旧自动分析过程文件，已经清理，并新增忽略规则 |
| EXE/MSI/APK、PDB、临时备份、环境文件、私钥/证书容器 | 默认忽略；正式安装包经 GitHub Release 分发 |

`.gitignore` 只防止普通新增文件被纳入仓库，不能从已经上传的历史提交中抹除文件，也不能替代秘密检查。

## 本地已完成的清理

用户明确选择移除 Android 工程及相关配置。本次清理包含：

- `apps/android/` 整个停止维护的工程：47 个已跟踪文件，以及未跟踪的本地构建/测试文件。
- `.evolution/` 中 6 个重复、过时的内部过程文件。
- 根目录 `FEATURE_GAP_REPORT.md`、`GITHUB_BENCHMARK_REPORT.md`、`PROJECT_AUDIT_REPORT.md` 三份已被新实施记录替代的旧报告。原有已提交版本仍可从 Git 历史追溯。
- Rust `target/debug`，release 中的依赖、指纹、构建、增量、临时打包目录，以及本地 PDB/依赖清单。
- 根目录及包内 Vitest 临时目录、Vite 缓存、上一轮依赖修复备份、临时浏览器工具和生成音频样本。

批量永久删除曾被自动安全检查拒绝；最终使用 Windows 回收站逐项清理，操作前验证绝对路径在当前项目中。没有清空回收站，没有删除其他项目或全局工具缓存。约 **7.7 GiB** 的缓存和旧文件已经移出项目；回收站仍可恢复，因此这一数字不是已经释放的磁盘空间。

Git 工作区包含 **56 个已跟踪文件的删除**：Android 47 个、内部过程文件 6 个、旧报告 3 个。此前 Windows / Web 的未提交功能改动继续保留。

保留了：

- 当前 Windows 可执行文件、两个安装包和两个签名。5 个文件的清理前后 SHA-256 完全一致；这里只验证文件未变，不等于验证了安装、签名或更新流程。
- 当前 Web 构建、FFmpeg.wasm 内核、开发依赖与依赖锁文件。
- 本地工具历史、当前截图、上一轮完整技术实施记录。实施记录顶部已标明是平台收敛前的历史快照，其中的旧目录与 Android 待办不再作为当前要求。

不含 `.git`、不跟随依赖目录链接的抽样计量中，`apps` 从约 7,919.52 MiB 降到 109.15 MiB；清理后整个项目文件约 320 MiB，主要是开发依赖、wasm 内核与保留的产物。以后运行 Rust 编译会重新生成缓存，首次编译将耗时更长。

## 远程仓库核查

通过 Git SSH 与 GitHub API 只读检查了 [Audio-Studio](https://github.com/yuchen0x1/Audio-Studio)。核查时远程 `main` 与本地 HEAD 均为 `d554a52d6012faac20440118a9079bc651bc9c88`；读取到的完整源码快照包含 182 个文件，约 1.35 MiB。

| 发现 | 当前状态 |
|---|---|
| 已上传 `.evolution` 6 个文件 | 适合从当前源码树移除；本地已准备删除，远程尚未同步 |
| 已上传根目录三份旧审计报告 | 本地已准备删除，远程尚未同步 |
| 远程仍有 Android 源码及构建配置 | 本地已移除工程并修改 CI/Release；远程尚未同步 |
| node_modules、target、dist、安装包、APK、PDB 误入 main 源码 | 文件路径检查未发现；最大的已跟踪文件是约 134 KiB 的 Cargo.lock |
| 远程历史 Release 的 Android APK | 仍在 [v0.1.0 Release](https://github.com/yuchen0x1/Audio-Studio/releases/tag/v0.1.0)，资产名 `AudioStudio-v0.1.0-debug.apk`，大小 110,823,909 字节；没有删除远程附件 |
| 远程 Release 说明只有下载表 | 本地已补齐准确版本的分平台日志，可用提取脚本生成正文；没有修改远程说明 |

核查范围是当前远程 main 源码树、版本标签与 Release 元数据；没有遍历全部分支/历史提交进行秘密取证。文件名与选定源码的高置信度秘密模式检查未发现命中，不能据此承诺历史中没有秘密。

本轮 **没有提交、推送、重写 Git 历史、删除远程分支、发布版本或下架远程附件**。当前的本地删除和工作流修改，只有后续获准提交并推送后才会改变远程源码。

## 更新日志的维护方式

目前核实到唯一发布标签为 `v0.1.0`。已经补全该版本的 Windows / Web 功能与下载限制，并保留当时附带 Android APK 的事实；当前 main 和本地新功能位于“未发布”，没有虚构 v0.1.1 等新发行版本。

后续发版前，在规范日志中创建准确版本标题并填写真实内容。新增的 `scripts/release-notes.mjs` 按精确版本提取正文；未找到、重复或空条目会失败，避免把最新开发说明误写到旧版。发布工作流使用同一正文填写 GitHub Release 和 Windows `latest.json` 的更新说明，同时修复 JSON/校验清单生成中的换行转义问题。

## 本轮验证

| 检查 | 结果 |
|---|---|
| TypeScript / ESLint / Prettier | PASS |
| 共享测试 | PARTIAL：81 PASS，20 个真实系统 FFmpeg 测试因工具不在 PATH 而 SKIP |
| Web 测试 | PASS：131 项 |
| 精确版本日志提取测试 | PASS：5 项；覆盖准确版本、旧版本末尾、缺失/空/重复条目、预发布与稳定版本 |
| Web / desktop UI 构建 | PASS；仍有原有的静态/动态混合导入警告 |
| CI/Release YAML 与任务依赖 | PASS：CI 只有 js/desktop；Release 只有 version/web/desktop/publish |
| 更新日志、latest.json、发布清单、SHA-256 生成 | PASS：在独立合成产物目录实际执行工作流内两段 Python，解析 JSON 并逐项复核哈希；该检查不是签名安装测试 |
| 清理后的 Windows 产物 | PASS：5 个保留文件哈希与清理前一致 |
| 拟纳入源码的现存文件 | PASS：未发现依赖、构建产物、临时目录、Android 工程或密钥容器路径 |
| Rust 完整重编译、安装器、跨版本更新、远程 CI | 本轮未重新执行；没有 Rust 业务改动，不将此前结果冒充本轮安装验证 |

检查后再次清理了测试产生的临时目录，保留可重复运行的源码测试与脚本。浏览器真实音频流程的上一轮证据保存在 [实施记录](EVOLUTION_2026-11-13.md) 与截图中，本轮未因文档和平台清理重新操作 GUI。
