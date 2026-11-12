# Audio Studio 发布记录

## Unreleased（`main`）

本次 `main` 更新包含：

- Web、Windows 桌面和 Android 三端的 GitHub Releases 更新检查与更新提示。
- 统一从 `main` 历史发布，Release 标签校验、版本注入、发布清单和 SHA-256 校验文件自动生成。
- Windows Tauri 更新包启用签名版本校验；Android 更新遵循系统确认安装要求。
- Web 目录导入支持完整读取多批目录项，并保留导入上限和回归测试。
- 受限浏览器存储场景增加设置内存后备，避免应用因 `localStorage` 不可用而启动失败。
- 三端共享音频参数、任务、格式和错误模型，并补充跨端测试与发布文档。

本条记录对应当前未打标签的 `main` 提交；正式版本号和 GitHub Release 资产将在确定 SemVer 标签并通过 CI 后生成。
