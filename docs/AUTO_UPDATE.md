# Audio Studio 自动更新与发布

本文说明当前 main 为 Windows 电脑版与网页版实现的更新方案。两端使用 GitHub Releases 发现版本，安装或资源切换由平台能力决定。历史 v0.1.0 的发行附件不包含当前签名更新清单，不将方案实现视为该旧版本的安装升级已经验证。

[当前稳定版](https://github.com/yuchen0x1/Audio-Studio/releases/latest)提供安装包、`latest.json` 和 SHA-256 校验文件。Tauri 更新签名用于应用内验签。Windows 系统的发布者认证需要单独的 Authenticode 证书。

## 方案总览

| 平台 | 版本发现 | 安装/切换方式 | 完整性保护 |
|---|---|---|---|
| Web / PWA | GitHub Releases API 的最新稳定版 | Service Worker 拉取已部署资源，用户确认后切换并刷新 | HTTPS、锁定依赖、CI 构建检查；浏览器不能替换服务器文件 |
| Windows / Tauri | Tauri updater `latest.json` | 下载签名更新包，校验通过后被动安装并重启 | HTTPS + Tauri 公钥验签；`requireSignedVersion=true` |

当前客户端默认只查询稳定版。带 `-beta`、`-rc` 等 SemVer 预发布标签的 Release 会被 GitHub 标记为 prerelease，不会被 `/releases/latest` 返回给稳定客户端。

## 自动检查行为

- Web 和 Windows 共享 `apps/web/src/updates.ts`：启动时检查，成功检查后 24 小时内不重复请求；网络失败不阻止应用启动。
- 设置页支持手动检查、启用/关闭自动检查，并显示发布时间、更新日志和发布文件大小。
- Windows 的“立即更新”走 `tauri-plugin-updater`，下载进度来自真实下载事件；安装完成后调用 Tauri relaunch。
- 选择“稍后提醒”会暂停对该标签的自动弹窗，设置页仍可手动打开。
- Web 候选 Worker 会先完整缓存页面资源。点击“立即更新”后，只有候选部署就绪并触发 `controllerchange` 才会刷新。候选部署失败时继续使用当前版本。

## Windows 签名配置

Tauri 更新包必须使用与 `apps/desktop/src-tauri/tauri.conf.json` 中公钥对应的私钥签名。私钥只能放在 GitHub Actions Secrets：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（如果私钥设置了密码）

私钥不能写入源代码、工作流明文、Release 资产或日志。工作流在构建前会主动拒绝空私钥，避免发布未签名更新包。

## 发布流程

所有更新都从 `main` 发布：

先通过 PR 把带统一版本和更新日志的代码合入 `main`，同步至本地。在已通过 CI 的提交上创建并推送版本标签。可先用 `python scripts/verify-release.py v0.2.3` 检查标签、工作区版本和锁文件是否一致，需 Python 3.11+。

在创建标签前，把“未发布”内容整理到准确的版本标题，例如 `## v0.1.1 — YYYY-MM-DD`，并保留所有旧版本记录。可以先预览对应正文：

```powershell
node scripts/release-notes.mjs v0.1.0 .vitest-tmp/release-notes/v0.1.0.md
pnpm test:release-notes
```

推送 `v*` 标签会触发 `.github/workflows/release.yml`。工作流会：

1. 校验标签符合 `vMAJOR.MINOR.PATCH`（可带预发布后缀）。
2. 确认标签提交位于 `main` 历史中，并用该提交的 SHA 构建两端。
3. 运行 Web/shared 类型检查、Lint、格式检查和测试。
4. 构建 Web ZIP 和 Windows MSI/NSIS 签名包。
5. 从 `docs/releases/release-notes.md` 提取准确版本段落，缺少、重复或空日志时拒绝发布；同一段落用于 GitHub Release 正文和 Tauri `latest.json` 的更新说明。
6. 根据实际产物生成 `release-manifest.json` 和 `SHA256SUMS.txt`。
7. 先验证 Windows 安装冒烟和 minisign 公钥验签，再创建草稿、上传资产并逐一核对 GitHub 返回的 SHA-256，通过后公开发布。预发布版本标记为 prerelease。
8. 每周从稳定版下载资产，复查 SHA-256、发布清单和更新 URL。

正式发布前必须确认 Actions 使用了正确的 Secrets，并检查 Release 资产是否包含：

- `latest.json`
- Windows 安装包及对应 `.sig`
- Web zip
- `release-manifest.json`
- `SHA256SUMS.txt`

## 失败处理与限制

- 版本检查失败、GitHub 不可访问或 Release 不存在时，应用继续使用当前版本。
- Tauri 更新在验签通过前不会安装；下载/签名失败会保留旧版本。
- Web 更新失败时保留当前缓存。若已上线的版本有问题，部署者可以恢复上一份完整站点目录（含匹配的引擎），并验证浏览器切换；部署需要保留前一份归档。
- Windows 下载或验签失败可直接重试。安装失败后由维护者检查安装器和系统记录。需要回退时，先备份用户设置与历史，再在隔离环境验证旧版本安装。应用内更新拒绝降级，当前没有安装后自动回滚。
- 仅有代码、构建成功或历史 Release，不足以证明签名更新可安装；需旧客户端发现、验签、安装并启动新版的实际证据。

## 本地测试

```powershell
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build:web
```

桌面端还需要具备 Rust/Cargo 与 Windows 构建环境，运行 CI 对应的原生检查。真实更新验收应在隔离测试 Release 上验证：同版本、升级版本、网络中断、签名错误、损坏下载、用户取消和重启流程。

## 历史平台说明

当前已经移除 Android 工程与 CI/发布任务。历史 v0.1.0 曾附带 APK，具体资产状态以 GitHub Release 页面为准；本地移除不代表远程附件已删除。
