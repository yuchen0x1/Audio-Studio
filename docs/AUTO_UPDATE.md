# Audio Studio 自动更新与发布

本文说明当前 main 为 Windows 电脑版与网页版实现的更新方案。两端使用 GitHub Releases 发现版本，安装或资源切换由平台能力决定。历史 v0.1.0 的发行附件不包含当前签名更新清单，不将方案实现视为该旧版本的安装升级已经验证。

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
- Web 的“立即更新”只负责切换 waiting Service Worker 并刷新；它不能替换服务器上的旧部署。

## Windows 签名配置

Tauri 更新包必须使用与 `apps/desktop/src-tauri/tauri.conf.json` 中公钥对应的私钥签名。私钥只能放在 GitHub Actions Secrets：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（如果私钥设置了密码）

私钥不能写入源代码、工作流明文、Release 资产或日志。工作流在构建前会主动拒绝空私钥，避免发布未签名更新包。

## 发布流程

所有更新都从 `main` 发布：

```powershell
git switch main
git pull --ff-only
# 完成修改、测试并提交
git tag v0.1.1
git push origin main
git push origin v0.1.1
```

在创建标签前，把“未发布”内容整理到准确的版本标题，例如 `## v0.1.1 — YYYY-MM-DD`，并保留所有旧版本记录。可以先预览对应正文：

```powershell
node scripts/release-notes.mjs v0.1.0 .vitest-tmp/release-notes/v0.1.0.md
pnpm test:release-notes
```

推送 `v*` 标签会触发 `.github/workflows/release.yml`。工作流会：

1. 校验标签符合 `vMAJOR.MINOR.PATCH`（可带预发布后缀）。
2. 对推送标签确认其提交位于 `main` 历史中。
3. 运行 Web/shared 类型检查、Lint、格式检查和测试。
4. 构建 Web ZIP 和 Windows MSI/NSIS 签名包。
5. 从 `docs/releases/release-notes.md` 提取准确版本段落，缺少、重复或空日志时拒绝发布；同一段落用于 GitHub Release 正文和 Tauri `latest.json` 的更新说明。
6. 根据实际产物生成 `release-manifest.json` 和 `SHA256SUMS.txt`。
7. 创建 GitHub Release；预发布版本自动标记为 prerelease。

正式发布前必须确认 Actions 使用了正确的 Secrets，并检查 Release 资产是否包含：

- `latest.json`
- Windows 安装包及对应 `.sig`
- Web zip
- `release-manifest.json`
- `SHA256SUMS.txt`

## 失败处理与限制

- 版本检查失败、GitHub 不可访问或 Release 不存在时，应用继续使用当前版本。
- Tauri 更新在验签通过前不会安装；下载/签名失败会保留旧版本。
- Web 更新失败时不会删除当前缓存资源；浏览器刷新仍使用现有部署。
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
