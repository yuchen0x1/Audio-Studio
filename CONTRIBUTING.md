# 贡献

使用 Node.js 22.13+、仓库声明的 pnpm 版本和 `pnpm install --frozen-lockfile`。Windows 开发另需 Rust、MSVC、WebView2 和可用的 FFmpeg/FFprobe。

从 `main` 创建工作分支，按 PR 模板说明平台影响、验证结果和兼容性。常规与紧急修复均经 CI 后合入 `main`。涉及产品行为的变更应更新 README 和对应版本的发布日志。

提交前执行 `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm test` 和 `pnpm build:web`。修改原生代码后还应执行 Cargo fmt、Clippy 和测试。参考 [平台验收](docs/PLATFORMS.md) 和 [发布及更新](docs/AUTO_UPDATE.md)。
