# Audio Studio 全球开源竞品与邻近项目对标

研究日期：2026-11-16。研究对象不是“看过宣传页”的名单，而是按仓库主页、README/源码目录、许可证、Release/更新记录和可见 Issues/PR 活跃度进行分层核验。由于不同项目的 GitHub 镜像、正式发行站和仓库状态不同，表中的“证据等级”明确区分了已直接核对与只适合作为方向参考的内容。

## 1. 研究对象（15 个）

| 项目 | 定位/可借鉴能力 | 许可证 | 更新/发行核验 | 证据等级 | 对 Audio Studio 的结论 |
|---|---|---|---|---|---|
| [Audacity](https://github.com/audacity/audacity) | 多轨编辑、录音、效果、宏/批处理、自动保存 | GPL-3.0-or-later | GitHub Release 与源码目录可见，4.x 持续维护 | A | 借鉴自动保存、宏/批处理与可访问性；不复制 GPL 代码 |
| [Ardour](https://github.com/Ardour/ardour) | 专业 DAW、会话文件、路由、插件、无头工具 | GPL-2.0-or-later | 主仓库提交历史活跃；正式发行不完全依赖 GitHub Releases | A- | 借鉴可恢复 session、后台任务与插件边界 |
| [Tenacity](https://codeberg.org/tenacityteam/tenacity) | Audacity 衍生编辑器、脚本/插件、可访问性 | GPL-2.0-or-later | Codeberg 为主要维护位置，GitHub 镜像不完整 | B+ | 借鉴可访问性与脚本扩展，避免复制实现 |
| [LMMS](https://github.com/LMMS/lmms) | 模块化音乐制作、插件、自动化、跨平台 | GPL-2.0-or-later | Release/alpha 与 CI 配置可见 | A- | 借鉴模块化效果/插件 API 与批量渲染思路 |
| [OBS Studio](https://github.com/obsproject/obs-studio) | 实时媒体管线、场景、插件、诊断/安全模式 | GPL-2.0-or-later | Release、平台后端和 libobs/frontend 分层清晰 | A | 借鉴能力探测、插件隔离、safe mode 与诊断包 |
| [FFmpeg](https://github.com/FFmpeg/FFmpeg) | 编解码、滤镜图、探测、命令行/库分层 | LGPL-2.1-or-later（可选 GPL/nonfree 部件） | 官方仓库与版本历史持续维护 | A | 继续通过参数数组和能力探测使用，不直接拷贝实现 |
| [Kdenlive](https://github.com/KDE/kdenlive) | Qt/KDE 非线性编辑、MLT 管线、代理/渲染 | GPL-3.0-or-later | 源码、fuzzer、benchmark、Appium 测试目录可见 | A- | 借鉴代理/任务队列、场景测试和长任务反馈 |
| [Hydrogen](https://github.com/hydrogen-music/hydrogen) | 鼓机、模式、MIDI/OSC、样本管理 | GPL-2.0-or-later | GitHub Releases 与源码活跃 | A- | 借鉴项目文件、模式化批处理与 MIDI/OSC 扩展边界 |
| [LosslessCut](https://github.com/mifi/lossless-cut) | 快速无损切割、合并、流抽取、跨平台 FFmpeg GUI | GPL-2.0 | GitHub Release 3.70.2 及资产可见 | A | 最直接的剪辑竞品；借鉴片段队列、输出冲突提示和恢复体验 |
| [Sonic Visualiser](https://github.com/sonic-visualiser/sonic-visualiser) | 波形/频谱/标注、多图层、Vamp 特征插件 | GPL-2.0-or-later | 5.x 下载与源码说明可见 | A | 借鉴分析结果可保存、图层/插件 API；不把分析做成一次性弹窗 |
| [MusicBrainz Picard](https://github.com/metabrainz/picard) | MusicBrainz 音乐识别、批量标签与封面、插件 | GPL-2.0 | GitHub Release、插件文档和仓库活跃度可见 | A- | 借鉴批量匹配预览、可撤销写入和插件化元数据源 |
| [Kid3](https://github.com/KDE/kid3) | 专业标签编辑、批量字段、脚本/多平台 | GPL | 官方站/SourceForge 发行信息与 KDE 源码可见 | B+ | 借鉴批量元数据表格与脚本化操作 |
| [beets](https://github.com/beetbox/beets) | CLI 音乐库整理、MusicBrainz 匹配、插件、SQLite | MIT | v2.14.x Release 与插件生态可见 | A- | 借鉴可重放导入、重复处理策略和外部库适配 |
| [MediaInfo](https://github.com/MediaArea/MediaInfo) | 音视频技术元数据、CLI/GUI、统一库 API | BSD-2-Clause | 26.10 Release 与 2,900+ 提交记录可见 | A | 借鉴结构化 probe schema、长尾格式兼容与崩溃修复习惯 |
| [fre:ac](https://github.com/enzo1982/freac) | 跨平台批量音频转换、CD 抓取、外部编码器 | GPL-2.0 | 源码 README、1.1.8 变更记录、连续构建可见 | A- | 借鉴独立编码线程、配置持久化和便携安装体验 |

### 研究边界

- “A/A-”表示已核对仓库/源码目录与至少一项 Release、README 或测试/插件证据；“B+”表示项目主要开发位置或正式发行不完全在 GitHub，功能结论只用于方向参考。
- 本表没有把 Issues 中的愿望清单当作已实现功能，也没有把截图当作业务完成证据。
- GPL/AGPL 项目只用于架构与交互研究；Audio Studio 的 MIT 主体不直接复制其代码或不可兼容依赖。FFmpeg 组件的许可证与编译选项必须继续在发布物中单独核验。

## 1.1 更新历史与社区信号摘要

| 项目 | 最近可见的维护信号 | 对 Audio Studio 的启示 |
|---|---|---|
| Audacity | 4.x 仍有正式发行、宏/效果/可访问性持续演进 | 复杂功能也要保留可恢复与可访问入口 |
| Ardour | 主仓库提交长期活跃，发行渠道与源码仓库分离 | 不能只看 GitHub Releases 判断项目是否维护 |
| Tenacity | 维护位置迁移到 Codeberg，GitHub 镜像可能滞后 | 记录主维护平台，避免把镜像停更误判为项目停更 |
| LMMS | alpha/CI 与插件、自动化能力持续推进 | 插件边界应先稳定 manifest，再扩展效果 |
| OBS | 33.x 发行、平台后端和诊断/安全模式持续维护 | safe mode 与诊断包是稳定性产品能力，不是附属功能 |
| FFmpeg | 版本、滤镜、解码器和安全修复持续发布 | 运行时能力必须探测，不能按旧格式表硬编码 |
| Kdenlive | 源码、fuzzer、benchmark、Appium 测试并行维护 | 测试资产本身是产品竞争力 |
| Hydrogen | 发行版与 MIDI/OSC/模式功能持续维护 | 复杂工作流需要项目文件和可重放状态 |
| LosslessCut | 桌面发行资产持续更新，重点仍是快速无损操作 | 先优化剪辑/输出反馈，再扩展重型 DAW 能力 |
| Sonic Visualiser | 分析/插件/标注生态持续维护 | 分析结果应该能保存、比较和重算 |
| MusicBrainz Picard | 发行、插件与批量匹配文档持续维护 | 批量元数据要有预览、来源和撤销 |
| Kid3 | KDE/SourceForge 发布渠道持续存在 | 表格化标签编辑仍是独立高价值场景 |
| beets | Python 插件与音乐库整理持续维护 | 导入报告、重复策略和可重放命令值得借鉴 |
| MediaInfo | 库/CLI/GUI 与长尾格式兼容持续更新 | probe schema 应独立于 UI，并有异常样本回归 |
| fre:ac | 跨平台构建、编码器和安装包持续维护 | 原生发布验收要覆盖便携与安装体验 |

这些信号用于确定路线优先级，不把某个项目的 Issue 愿望或镜像页面当作已实现功能。具体 commit/Release/Issue 链接保留在各项目官方仓库与发行页中，发布前应再次按日期刷新。

## 2. 逐项优势与取舍

| 对标项目 | 对方更强的地方 | 为什么能做到 | Audio Studio 当前优势 | 取舍与升级动作 |
|---|---|---|---|---|
| Audacity | 深度编辑、宏、自动保存、可访问性 | 长期 C++ 模块化与成熟桌面工作流 | Audio Studio 上手更轻、Web + Windows 双形态、批量转码路径更短 | P1 增加 session 自动保存、宏式批处理；不引入完整 DAW 复杂度 |
| Ardour | 会话恢复、路由与插件生态 | 以可恢复工程文件为核心的 DAW 架构 | Audio Studio 资源占用与配置门槛更低 | 借鉴 session journal；不做专业混音路由 |
| Tenacity | 键盘/无障碍与脚本 | 社区长期维护的编辑器可访问性实践 | Audio Studio UI 更现代、状态机更易测试 | 增加快捷键/ARIA 自动审计 |
| LMMS | 插件/自动化 | 模块化音频节点和参数自动化 | Audio Studio 参数模型更简单、批处理更直接 | 建立轻量效果/插件接口，避免全量 DAW 化 |
| OBS | 插件边界、safe mode、诊断 | libobs/frontend/platform 分层与故障隔离 | Audio Studio 的共享核心更小、纯离线隐私更强 | 增加诊断包、能力缓存、safe mode |
| FFmpeg | 格式覆盖、滤镜图、探测稳定性 | 成熟 C 库/CLI 分层与庞大测试历史 | Audio Studio 把复杂参数封装成面向普通用户的任务模型 | 继续使用能力探测；不 fork FFmpeg |
| Kdenlive | 长任务、代理、复杂媒体项目 | MLT 管线、代理文件与大量自动化测试 | Audio Studio 的单一任务反馈更简单 | 增加大文件/长任务预检和可恢复队列 |
| Hydrogen | 项目/模式化工作流 | 以 session、pattern、MIDI/OSC 组织复杂任务 | Audio Studio 转换任务更聚焦 | 采用项目文件概念，暂不引入 MIDI 子系统 |
| LosslessCut | 无损剪辑效率与输出反馈 | 直接利用 FFmpeg stream copy，片段队列清晰 | Audio Studio 的元数据、分析和批量编码更完整 | 优先完善剪辑时间轴、片段预览、冲突策略 |
| Sonic Visualiser | 分析可视化与插件 | 图层模型 + Vamp 外部特征插件 | Audio Studio 已有分析入口但更轻量 | 保存分析结果，设计只读分析插件接口 |
| Picard | 批量标签/封面与外部知识库 | MusicBrainz 匹配、预览后写入、插件 | Audio Studio 支持离线编辑且不强依赖账号 | 增加批量元数据表格与可撤销写入；网络匹配设为可选 |
| Kid3 | 标签编辑效率 | 面向字段的表格/脚本工作流 | Audio Studio 的转换参数与任务队列更统一 | 增加批量元数据编辑与模板 |
| beets | 大库整理与插件/重复策略 | SQLite、可重放导入、插件命令 | Audio Studio 有浏览器/PWA 与 GUI | 借鉴导入报告、重复处理和可回滚操作 |
| MediaInfo | 长尾格式 probe 与统一 API | 专门的库/CLI/GUI 分层与持续安全修复 | Audio Studio 的 probe 结果直接服务转换决策 | 扩展结构化 probe schema，补充异常样本回归 |
| fre:ac | 批量转换稳定性、便携发布 | 编码线程与多平台打包长期打磨 | Audio Studio Web/桌面代码复用度更高 | 补独立 worker、磁盘预检、便携模式和安装冒烟 |

## 3. 按维度的结论

### 产品功能

Audio Studio 已覆盖“转换 + 批量 + 剪辑/合并 + 元数据 + 分析”的主链路，强项是参数快照、跨 Web/桌面一致体验和低门槛。明显短板是工程/session 恢复、批量元数据、分析结果持久化、插件与项目文件。

### UX/UI

竞品普遍把长任务状态、输出冲突、自动保存和错误恢复做成一等功能；Audio Studio 的界面已经有状态筛选、主题和双语，但需要补键盘快捷键、可访问性自动审计、磁盘/内存预检和更细的空/错状态。

### 技术架构

Audio Studio 的 `AudioEngine` + `packages/shared` 是正确方向；下一步应吸收 OBS 的分层/诊断、Ardour/Kdenlive 的 session/队列思想、MediaInfo 的结构化 probe，而不是把桌面专用 C++/Qt 代码搬进 Web。

### 性能

FFmpeg.wasm 的内存复制是 Web 端硬边界；LosslessCut 的 stream-copy、fre:ac 的独立编码线程和 Kdenlive 的代理/长任务反馈值得借鉴。优先级高于视觉微调。

### 安全与许可证

当前参数数组调用、路径校验和更新器 URL 校验优于许多小型工具；主要风险是 Tauri CSP、外部 FFmpeg 供应链、签名安装包和许可证/NOTICE 自动化。所有借鉴以“重新实现接口/行为”为原则，逐项保留上游版权与许可证记录。

### 工程化

Audio Studio 已有 TypeScript/Rust 测试和 GitHub Actions，但缺少真实安装包冒烟、跨平台矩阵、SBOM/许可证报告、fuzzer/视觉回归和崩溃恢复测试。OBS、Kdenlive、MediaInfo 和 fre:ac 的工程实践是最值得吸收的部分。

## 4. 最值得优先借鉴的 8 个方案

1. **FFmpeg + MediaInfo**：以真实能力探测和结构化 probe 驱动 UI，而不是硬编码格式。
2. **LosslessCut**：无损剪辑和片段输出冲突的低摩擦工作流。
3. **OBS**：能力分层、safe mode、诊断包、插件边界。
4. **Ardour/Hydrogen**：可恢复 session 与项目文件思想。
5. **Kdenlive/fre:ac**：长任务、独立 worker、代理/磁盘预检和跨平台发布。
6. **Sonic Visualiser**：分析图层和可插拔特征提取。
7. **Picard/Kid3/beets**：批量元数据、匹配预览、重复策略和可回滚导入。
8. **Audacity/Tenacity/LMMS**：键盘无障碍、宏/脚本和轻量插件 API。

详细可执行项和验收标准见 [UPGRADE_ROADMAP.md](UPGRADE_ROADMAP.md)。


## 2026-11-18 研究补充（31 个对象）

复查 30 个 GitHub 源码仓库的 README 或项目简介、默认分支目录、最近提交、可见发行记录和最新更新的公开 Issue，并核对 Tenacity 官方入口。星数和 Fork 为当日 GitHub 快照。活跃分组以默认分支最近提交日期计算，镜像和独立发行站可能与 GitHub 元数据不同。Issue 链接是抽样信号，频次仍需另行统计。

| 项目 | 类型 / 技术 | 许可 | Stars / Forks | 默认分支活动 | GitHub 最新发行 | 查阅证据 / 实施取舍 |
|---|---|---|---|---|---|---|
| [audacity/audacity](https://github.com/audacity/audacity) | 邻近／桌面多轨 · C++ | 见上文 | 19101 / 2736 | [2026-11-18](https://github.com/audacity/audacity/commit/b1c8dbe10d09f7a0d94cdd35b5ef9dc879278fb9) · ≤30 天 | [Audacity-4.0.2](https://github.com/audacity/audacity/releases/tag/Audacity-4.0.2) | `au3`、`buildscripts`、`docs`、`help` · [近期 Issue](https://github.com/audacity/audacity/issues/12790)；多轨宏与恢复可参考，保持轻量界面 |
| [Ardour/ardour](https://github.com/Ardour/ardour) | 邻近／桌面 DAW · C++ | GPL（源码许可） | 5441 / 1029 | [2026-11-18](https://github.com/Ardour/ardour/commit/c453ffb46913eeefea24f740fc21f29cf51c15b6) · ≤30 天 | GitHub API 未返回 | `MSVCMixbus3`、`MSVCardour3`、`MSVCvst_scan`、`doc`；保存会话与原生处理边界 |
| [LMMS/lmms](https://github.com/LMMS/lmms) | 邻近／桌面音乐制作 · C++ | GPL-2.0 | 10686 / 1326 | [2026-11-16](https://github.com/LMMS/lmms/commit/6b00eab040d8d51320cbaab32f54f7584b5cfe00) · ≤30 天 | [v1.2.2](https://github.com/LMMS/lmms/releases/tag/v1.2.2) | `buildtools`、`cmake`、`data`、`doc` · [近期 Issue](https://github.com/LMMS/lmms/issues/7536)；将渲染与播放解耦 |
| [obsproject/obs-studio](https://github.com/obsproject/obs-studio) | 技术／多平台媒体 · C | GPL-2.0 | 79707 / 11297 | [2026-11-18](https://github.com/obsproject/obs-studio/commit/717cfa8b7e633853cd21ad2cc656185b3b4255bb) · ≤30 天 | [33.0.1](https://github.com/obsproject/obs-studio/releases/tag/33.0.1) | `additional_install_files`、`build-aux`、`cmake`、`deps` · [近期 Issue](https://github.com/obsproject/obs-studio/issues/12724)；按实际引擎能力报告可用功能 |
| [FFmpeg/FFmpeg](https://github.com/FFmpeg/FFmpeg) | 技术／跨平台 CLI · C | LGPL/GPL（构建相关） | 67541 / 14672 | [2026-11-18](https://github.com/FFmpeg/FFmpeg/commit/9aa0ad8985af33474929e8451b0e900d9f512cf2) · ≤30 天 | GitHub API 未返回 | `compat`、`doc`、`fairy`、`ffbuild`；继续通过结构化参数和能力探测调用 |
| [KDE/kdenlive](https://github.com/KDE/kdenlive) | 邻近／桌面非线性编辑 · C++ | GPL-3.0 | 6139 / 579 | [2026-11-18](https://github.com/KDE/kdenlive/commit/ac7dd6c3568bb0a0d20cbbd0250bc37977521606) · ≤30 天 | GitHub API 未返回 | `LICENSES`、`appiumtests`、`benchmark`、`cmake`；渲染队列与进度反馈 |
| [hydrogen-music/hydrogen](https://github.com/hydrogen-music/hydrogen) | 邻近／桌面节奏制作 · C++ | GPL-2.0 | 1356 / 188 | [2026-10-03](https://github.com/hydrogen-music/hydrogen/commit/00509be4aae5d4ca64a95428c9f33d08210e4f96) · 31–90 天 | [1.2.7](https://github.com/hydrogen-music/hydrogen/releases/tag/1.2.7) | `cmake`、`data`、`docs`、`doxygen` · [近期 Issue](https://github.com/hydrogen-music/hydrogen/issues/2357)；项目模板与模式持久化 |
| [mifi/lossless-cut](https://github.com/mifi/lossless-cut) | 直接／桌面剪切 · TypeScript | GPL-2.0 | 46154 / 2341 | [2026-11-03](https://github.com/mifi/lossless-cut/commit/4c7ab1cb0c9acaefabb48e997bc909562dc3624d) · ≤30 天 | [v3.70.2](https://github.com/mifi/lossless-cut/releases/tag/v3.70.2) | `docs`、`locales`、`script`、`src` · [近期 Issue](https://github.com/mifi/lossless-cut/issues/3227)；先保证无损路径、输出冲突反馈与异常恢复 |
| [sonic-visualiser/sonic-visualiser](https://github.com/sonic-visualiser/sonic-visualiser) | 邻近／桌面分析 · C++ | GPL-2.0 | 921 / 89 | [2026-10-18](https://github.com/sonic-visualiser/sonic-visualiser/commit/967a1efd195b572bffbd4570149d4bf762f94077) · 31–90 天 | [sv_v5.2.1](https://github.com/sonic-visualiser/sonic-visualiser/releases/tag/sv_v5.2.1) | `deploy`、`export-tests`、`i18n`、`icons` · [近期 Issue](https://github.com/sonic-visualiser/sonic-visualiser/issues/40)；分析报告、标注和导出可分阶段实施 |
| [metabrainz/picard](https://github.com/metabrainz/picard) | 直接／桌面标签 · Python | GPL-2.0 | 5382 / 480 | [2026-11-16](https://github.com/metabrainz/picard/commit/7b6587886b8d84e3e79c0e77b72667eb755b6a82) · ≤30 天 | [release-3.0.5](https://github.com/metabrainz/picard/releases/tag/release-3.0.5) | `docs`、`installer`、`picard`、`po`；批量改标签先预览，清晰显示写入来源 |
| [KDE/kid3](https://github.com/KDE/kid3) | 直接／桌面标签 · C++ | GPL（见源码 LICENSE） | 213 / 16 | [2026-11-18](https://github.com/KDE/kid3/commit/fe84a81335cba6754428b7e5bea7938be567a677) · ≤30 天 | GitHub API 未返回 | `android`、`deb`、`doc`、`linux`；适合研究表格、批量处理和可撤销编辑 |
| [beetbox/beets](https://github.com/beetbox/beets) | 邻近／终端音库 · Python | MIT | 15950 / 2199 | [2026-11-16](https://github.com/beetbox/beets/commit/d3631b205a1bc47f62639b95b2cfcb0c124ec909) · ≤30 天 | [v2.14.1](https://github.com/beetbox/beets/releases/tag/v2.14.1) | `beets`、`beetsplug`、`docs`、`extra` · [近期 Issue](https://github.com/beetbox/beets/issues/231)；操作预览与重复处理检测 |
| [MediaArea/MediaInfo](https://github.com/MediaArea/MediaInfo) | 邻近／跨平台探测 · C++ | BSD-2-Clause | 2070 / 201 | [2026-11-14](https://github.com/MediaArea/MediaInfo/commit/447b20d44dd9d404800667f1c0015841c752d134) · ≤30 天 | [v26.10](https://github.com/MediaArea/MediaInfo/releases/tag/v26.10) | `Contrib`、`Project`、`Release`、`Source` · [近期 Issue](https://github.com/MediaArea/MediaInfo/issues/1021)；结构化探测便于跨引擎回归 |
| [enzo1982/freac](https://github.com/enzo1982/freac) | 直接／桌面转码 · C++ | GPL-2.0 | 2016 / 97 | [2026-11-17](https://github.com/enzo1982/freac/commit/10d73f2022e92356640a2fcb689f128646d8746f) · ≤30 天 | [v1.1.7](https://github.com/enzo1982/freac/releases/tag/v1.1.7) | `components`、`i18n`、`icons`、`include` · [近期 Issue](https://github.com/enzo1982/freac/issues/829)；转换输出采用编码队列与一致命名 |
| [ffmpegwasm/ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) | 技术／浏览器 WASM · C | MIT | 17970 / 1127 | [2025-09-17](https://github.com/ffmpegwasm/ffmpeg.wasm/commit/f876f907c7e9b9bf51d4ed0b913a855a63ae63fc) · >180 天 | [v12.15](https://github.com/ffmpegwasm/ffmpeg.wasm/releases/tag/v12.15) | `apps`、`build`、`packages`、`scripts` · [近期 Issue](https://github.com/ffmpegwasm/ffmpeg.wasm/issues/597)；首次准备保持同源，核对包装层和内核许可证 |
| [flacon/flacon](https://github.com/flacon/flacon) | 直接／桌面分轨 · C++ | LGPL-2.1 | 545 / 36 | [2026-07-26](https://github.com/flacon/flacon/commit/2dcc83ecc2528b5769e1629488a6f5a6706362dc) · 91–180 天 | [v13.0.2](https://github.com/flacon/flacon/releases/tag/v13.0.2) | `cmake`、`converter`、`doc`、`formats_in` · [近期 Issue](https://github.com/flacon/flacon/issues/117)；分轨有各轨预览及模板命名需求 |
| [HandBrake/HandBrake](https://github.com/HandBrake/HandBrake) | 邻近／桌面编码 · C | GPL（见源码 COPYING） | 25046 / 1757 | [2026-11-18](https://github.com/HandBrake/HandBrake/commit/28cae12c062ff68c6851fed5621fdbd56ca00cb7) · ≤30 天 | [1.11.2](https://github.com/HandBrake/HandBrake/releases/tag/1.11.2) | `contrib`、`graphics`、`gtk`、`libhb` · [近期 Issue](https://github.com/HandBrake/HandBrake/issues/6968)；任务、预设、运行时版本分离 |
| [complexlogic/rsgain](https://github.com/complexlogic/rsgain) | 邻近／CLI 响度 · C++ | 见许可证 | 738 / 47 | [2026-10-11](https://github.com/complexlogic/rsgain/commit/aae8cc74190de9dafce41576f3e407e62420a51d) · 31–90 天 | [v3.8](https://github.com/complexlogic/rsgain/releases/tag/v3.8) | `config`、`docs`、`src` · [近期 Issue](https://github.com/complexlogic/rsgain/issues/210)；响度扫描与标签写入应独立 |
| [naomiaro/waveform-playlist](https://github.com/naomiaro/waveform-playlist) | 技术／浏览器多轨 · TypeScript | MIT | 1695 / 316 | [2026-11-16](https://github.com/naomiaro/waveform-playlist/commit/fa05cb7457ca11e388d09f400970a0ac653da3aa) · ≤30 天 | [transport-engine-improvements](https://github.com/naomiaro/waveform-playlist/releases/tag/transport-engine-improvements) | `debug`、`docs`、`e2e`、`examples` · [近期 Issue](https://github.com/naomiaro/waveform-playlist/issues/832)；波形和时间线可分模块复用，当前无多轨需求 |
| [katspaugh/wavesurfer.js](https://github.com/katspaugh/wavesurfer.js) | 技术／浏览器波形 · TypeScript | BSD-3-Clause | 10480 / 1761 | [2026-11-12](https://github.com/katspaugh/wavesurfer.js/commit/eef9057e391698370e1a58788646432a562d63a5) · ≤30 天 | [8.1.0](https://github.com/katspaugh/wavesurfer.js/releases/tag/8.1.0) | `cypress`、`examples`、`scripts`、`src` · [近期 Issue](https://github.com/katspaugh/wavesurfer.js/issues/4433)；键盘操作与峰值 API 可借鉴 |
| [bbc/audiowaveform](https://github.com/bbc/audiowaveform) | 技术／CLI 波形 · C++ | GPL-3.0 | 2171 / 253 | [2025-08-24](https://github.com/bbc/audiowaveform/commit/9edb233cd84c5e3c0669a9ecb55dad56dac5f93f) · >180 天 | [1.10.3](https://github.com/bbc/audiowaveform/releases/tag/1.10.3) | `cmake`、`debian`、`doc`、`rpm` · [近期 Issue](https://github.com/bbc/audiowaveform/issues/223)；大文件可预计算峰值避免主线程阻塞 |
| [pdeljanov/Symphonia](https://github.com/pdeljanov/Symphonia) | 技术／Rust 解码 · Rust | MPL-2.0 | 3487 / 276 | [2026-11-08](https://github.com/pdeljanov/Symphonia/commit/5f879df0bf309246a48d57caae457fd8c0e2a5cb) · ≤30 天 | [v0.6.1](https://github.com/pdeljanov/Symphonia/releases/tag/v0.6.1) | `benchtest`、`docs`、`symphonia-bundle-flac`、`symphonia-bundle-mp3` · [近期 Issue](https://github.com/pdeljanov/Symphonia/issues/586)；将来可评估独立只读探测层 |
| [libsndfile/libsndfile](https://github.com/libsndfile/libsndfile) | 技术／原生文件库 · C | LGPL-2.1 | 1731 / 486 | [2026-10-28](https://github.com/libsndfile/libsndfile/commit/396a715daeae7316f047ee220b364ab983b66df4) · ≤30 天 | [1.2.2](https://github.com/libsndfile/libsndfile/releases/tag/1.2.2) | `Octave`、`Scripts`、`Win32`、`cmake` · [近期 Issue](https://github.com/libsndfile/libsndfile/issues/1118)；可验证波形输入兼容和错误语料 |
| [Borewit/music-metadata](https://github.com/Borewit/music-metadata) | 技术／Node/Web 标签 · TypeScript | MIT | 1337 / 123 | [2026-11-17](https://github.com/Borewit/music-metadata/commit/fd9c0836c7803376da391e6e59759780b20a206f) · ≤30 天 | [v12.7.0](https://github.com/Borewit/music-metadata/releases/tag/v12.7.0) | `doc-gen`、`doc`、`example`、`image`；可研究只读标签探测对复杂容器的边界 |
| [Rikorose/DeepFilterNet](https://github.com/Rikorose/DeepFilterNet) | 技术／原生音频降噪 · Python | 代码/模型分开核对 | 5047 / 559 | [2026-11-06](https://github.com/Rikorose/DeepFilterNet/commit/7b14b895fe7fc42cab72b4a4c1e49c982bd6404b) · ≤30 天 | [v0.5.6](https://github.com/Rikorose/DeepFilterNet/releases/tag/v0.5.6) | `DeepFilterNet`、`assets`、`demo`、`ladspa` · [近期 Issue](https://github.com/Rikorose/DeepFilterNet/issues/704)；模型与实时处理成本较高，暂缓 |
| [MTG/essentia](https://github.com/MTG/essentia) | 技术／原生音频分析 · C++ | AGPL-3.0 | 3810 / 645 | [2026-11-05](https://github.com/MTG/essentia/commit/23ae7baddecfc3227ba23ad69fa11f73ac5293a4) · ≤30 天 | [v2.0.1](https://github.com/MTG/essentia/releases/tag/v2.0.1) | `debian`、`doc`、`packaging`、`src` · [近期 Issue](https://github.com/MTG/essentia/issues/969)；分析特征适合具备明确场景再引入 |
| [JorenSix/TarsosDSP](https://github.com/JorenSix/TarsosDSP) | 技术／Java DSP · Java | GPL-3.0 | 2192 / 495 | [2026-06-18](https://github.com/JorenSix/TarsosDSP/commit/41476b268b8b34664d3e43997fb05c95cec29e3d) · 91–180 天 | GitHub API 未返回 | `core`、`examples`、`gradle`、`jvm` · [近期 Issue](https://github.com/JorenSix/TarsosDSP/issues/206)；频谱与取样做参考，避免新增 JVM |
| [tauri-apps/plugins-workspace](https://github.com/tauri-apps/plugins-workspace) | 技术／Tauri 多平台插件 · Rust | Apache-2.0 / MIT | 1843 / 640 | [2026-11-16](https://github.com/tauri-apps/plugins-workspace/commit/21f01aa3d5d171f7e5deb5262480bb6ae20e3d0c) · ≤30 天 | [persisted-scope-v2.4.3](https://github.com/tauri-apps/plugins-workspace/releases/tag/persisted-scope-v2.4.3) | `examples`、`packages`、`plugins`、`shared` · [近期 Issue](https://github.com/tauri-apps/plugins-workspace/issues/3716)；构建签名、版本绑定和 Windows 资产验证 |
| [pkalogiros/AudioMass](https://github.com/pkalogiros/AudioMass) | 直接／浏览器编辑 · JavaScript | 自定义（见 LICENSE） | 3059 / 352 | [2026-08-20](https://github.com/pkalogiros/AudioMass/commit/21f5ee1362a47be6f0dbe6e4969a15e43d21b044) · 31–90 天 | GitHub API 未返回 | `src` · [近期 Issue](https://github.com/pkalogiros/AudioMass/issues/132)；本地剪辑缩短操作路径，参考 Worker 缓存；移动文件选择需实机验证 |
| [staxrip/staxrip](https://github.com/staxrip/staxrip) | 邻近／Windows 编码 · Visual Basic .NET | MIT | 3046 / 151 | [2026-09-26](https://github.com/staxrip/staxrip/commit/2283bfd0a892542feecdbb813b1fcda144f7d610) · 31–90 天 | [v2.52.6](https://github.com/staxrip/staxrip/releases/tag/v2.52.6) | `Docs`、`Images`、`Source` · [近期 Issue](https://github.com/staxrip/staxrip/issues/2014)；原生编码调用、可升级工具目录值得参考 |
| [Tenacity](https://tenacityaudio.org/) | 邻近／桌面多轨 · C++ | GPL（见上表） | Codeberg 主站 | [源码与发行](https://codeberg.org/tenacityteam/tenacity)；当日主站未完成计数 | [官方发行入口](https://codeberg.org/tenacityteam/tenacity/releases) | 键盘可编辑、屏幕阅读支持，作为剪辑交互可达性验证依据。 |

### 功能差距与本轮决策

| 方向 | Audio Studio v0.2.2 | 参考现有实现 | 价值、成本和实施决定 |
|---|---|---|---|
| 本地队列与编码能力 | Windows/Web 有预设、筛选和真实进度，FFmpeg 集成测试会在无依赖时跳过 | fre:ac 的编码管线、FFmpeg 的格式探测 | A。补齐 CI 的真实编码和签名产物检查，保留原工作流。 |
| Web 离线与更新确认 | 有 Worker、缓存范围过宽，缺少安装图标文件 | AudioMass 的缓存更新，Tauri 插件的版本绑定 | A。完整缓存候选构建、保留前一构建、等待确认、失败保留当前版本。 |
| Windows 设置写入 | JSON 直接覆盖，失败时回到默认 | StaxRip 的独立配置目录、Ardour 的会话持久化 | A。先保护现有设置落盘。备份轮换和崩溃队列恢复按路线表继续评估。 |
| Web 引擎分发 | ZIP 包含上游预构建核心 | ffmpeg.wasm 的 Docker 构建选项和单独 npm 包 | A。发布 ZIP 提供相同版本的校验脚本，继续使用站点同源引擎；Windows 使用系统安装的 FFmpeg。 |
| 剪辑和标签交互 | 单文件或分段工作流，标签主要为单文件 | LosslessCut 的分段队列、Picard/Kid3 的写入前检查 | B。先保持现有编辑行为。撤销、批量标签和项目文件需单独处理数据一致性。 |
| 波形和分析进阶 | 当前可预览和分析，资源压力取决于文件及设备 | WaveSurfer 的峰值输入、Sonic Visualiser 的图层、MediaInfo 的结构化信息 | B。主线程峰值处理、分析导出与可访问性纳入后续候选。 |
| 原生新增平台、降噪、多轨 DAW | 未纳入当前产品 | Ardour、Hydrogen、DeepFilterNet、Essentia | C/D。要增加原生分发、设备测试、系统权限或重型处理；优先维护 Windows、响应式 Web 和 PWA。 |

保留工作台导航、用途预设和任务队列这三条主路径。更新详情增加当前版、目标版与可点击的发行页。其余候选继续在 [40 项路线图](UPGRADE_ROADMAP.md) 按优先级维护。每月轻量查看引擎和发布技术变更，大版本前复查默认分支、Issues、关键源码和发行资产。若借鉴第三方代码，先单独核对许可证与分发影响。

GitHub 与官方站用于核对实现，社区链接用于了解取舍。例如 [Hacker News 的 LosslessCut 讨论](https://news.ycombinator.com/item?id=33969490) 提到打包可复现性和独立系统依赖之间的取舍。Gitee、GitLab 与 Reddit 的搜索未作为本轮实施依据。
