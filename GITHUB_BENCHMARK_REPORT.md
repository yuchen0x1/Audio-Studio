# GitHub 优秀项目对标分析

研究日期：2026-11-09。目标是从公开项目的实际仓库、发行记录、许可证和官方说明中提取可验证的产品设计，不复制代码。

## 对标范围与当前项目定位

Audio Studio 是面向个人的本地音频格式转换与常见处理工具，覆盖浏览器、Windows 和 Android。它不是 DAW、音频录制器或网络媒体下载器。当前仓库实现 13 种目标格式、批量队列、剪辑、合并、分析、标签/封面、历史、主题/语言和更新提醒；Web 使用 FFmpeg.wasm，桌面和 Android 使用本机 FFmpeg。

## 仓库对照

| 项目 | 活跃度与规模（核查时） | 许可 | 从仓库/官方资料可确认的能力 | 对 Audio Studio 的启示 |
|---|---|---|---|---|
| [fre:ac](https://github.com/enzo1982/freac) | GitHub 页面约 2k stars、98 forks；官方稳定版仍为 1.1.7，下载页记录 2025-06-18 的页面更新，官方版本发布说明为 2023 年 | GPL-2.0 | 音频转换、CD 抓取、标签编辑、播放列表/cue/chapter、同一批次多目标格式和多线程转换 | 最相近的桌面产品。值得借鉴多目标格式队列、保留目录/文件名模式和对曲库工作的支持。CD 抓取依赖硬件/外部元数据，不属于当前 Web/移动端共同核心。stable release 较旧，不能仅凭源码提交活动推断稳定发行频率。citeturn663174view0turn663174view5turn663174view6 |
| [LosslessCut](https://github.com/mifi/lossless-cut) | 最新页面可见 v3.70.2，2026-10-28 发布；持续提供多平台构建与校验/许可证产物 | GPL 系列；应按仓库当前 LICENSE 与分发依赖文件核实具体义务 | 无损切割、桌面媒体工作流、多平台包、持续发行 | 借鉴清晰的片段选择、快速切分和发布资产校验。Audio Studio 的剪辑目前偏单段范围/分割导出，没有完整媒体时间线工作台；整合整套 UI 不符合产品范围。citeturn663174view4 |
| [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) | 上游近期仍有 releases；页面列出 worker 导出、Vite 示例修复等更新 | wrapper 项目 MIT；FFmpeg core 的许可取决于所构建 codecs/config，不能只看 wrapper | 浏览器 worker 运行 FFmpeg、WASM core、构建工具示例与浏览器限制说明 | 本项目已经依赖该上游。重点跟踪 worker URL/打包兼容、浏览器内存限制、core codec 许可和跨源隔离要求；不新增另一层 wasm 包装。citeturn678629search0turn663174view3turn678629search6 |
| [HandBrake](https://github.com/HandBrake/HandBrake) | GitHub 页面显示约 24.9k stars、1.7k forks、13k+ commits | GPL-2.0 | 面向 Linux/macOS/Windows 的成熟转码器，明确以设备兼容预设和视频转码为主 | 借鉴其“先选目标/预设，再暴露细节”的渐进式参数体验、错误和队列信息组织；视频预设模型不应直接移植到音频应用。citeturn678629search3turn663174view1 |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | 活跃维护的命令行下载器；仓库 README 明确区分 source 与 standalone bundle 的组成 | 项目源代码 Unlicense；发布 bundle 还包含不同许可的依赖 | 下载工作流、FFmpeg 后处理、丰富命令行错误诊断 | 不适合整合下载站点功能。可借鉴可选 FFmpeg/FFprobe 发现、能力提示和“输入/处理/输出”错误上下文。其打包许可说明也提醒本项目发布物应跟踪 FFmpeg-kit 与 codecs 的许可证。citeturn663174view2turn678629search10 |

## 横向差距

| 维度 | Audio Studio 当前证据 | 代表项目 | 差距/建议 |
|---|---|---|---|
| 核心功能 | 13 格式、处理工具覆盖广；有共享格式/参数模型 | fre:ac 批量目标格式、CD 抓取；LosslessCut 无损片段编辑 | 补齐批量目标/输出命名体验；不要承诺 CD 抓取或 DAW 时间线 |
| UI/UX | React/Compose 两套界面；统一主题和中英文本地化；页面已测试逻辑但未完成真实浏览器/设备视觉 QA | HandBrake 预设化转码；fre:ac 曲库批处理 | 优先降低参数学习成本、强化导入—队列—结果连续性；真实视觉是否达成需人工验收 |
| 架构 | TS shared + Web/WASM + Rust/Tauri + Kotlin/FFmpeg | 各竞品根据桌面/CLI 定位使用原生架构 | 当前共享核心有价值；跨端能力矩阵和测试夹具应继续统一 |
| 性能 | 浏览器需下载/初始化约 32MB wasm core；原生端调用外部 FFmpeg | fre:ac 多线程，HandBrake 有预设管线 | 观察大文件内存与移动端后台生命周期；不能从单次构建大小推断运行性能 |
| 扩展 | 当前没有公开插件 API | fre:ac CDK 组件体系 | 暂不建设通用插件市场；先抽取用户确实需要的编码器/预设能力 |
| 稳定性与测试 | shared/Web/Rust 单测和 FFmpeg 集成通过；Android 单测/Lint 通过 | 上游竞品有长期发布历史 | 需要更多跨端 fixture、Android instrumentation 和升级安装实测 |
| 安全/许可 | 本地处理；路径校验；npm prod audit 0 CVE | FFmpeg/编解码组合有多重许可 | 完成发布物 SBOM/NOTICE；明确 wasm core 和 ffmpeg-kit fork 的 LGPL 配置义务 |
| 兼容性 | Web、Windows、Android；尚无最终安装包/E2E验收 | fre:ac/LosslessCut/HandBrake 多桌面发行 | 桌面/移动设备真实验收与 Web 子路径测试仍需补齐 |

## 采用与不采用

- 本轮实际借鉴：目录导入应遍历 FileSystemDirectoryReader 返回的每一批结果，而不是假设一次能取完；建立两个回归用例覆盖多批结果和 500 文件上限。这是基于浏览器 API 行为的独立实现，没有复制竞品代码。
- 适合后续借鉴：批量多个目标格式、命名模板保留目录结构、预设/渐进披露、任务失败后可恢复的队列状态。
- 不采用：下载站点/账号、CD 抓取的云端元数据、完整 DAW/时间线、桌面插件 SDK。它们会扩大权限、依赖、许可和维护负担，不能直接改善跨端核心转换。
- 没有从任何仓库复制源代码，也没有新增依赖。

## 证据限制

Stars 和 release 时间是抓取时的 GitHub 页面值，会变化。对 fre:ac，仓库页面显示 2k stars，但官网稳定版页面仍为 1.1.7；仓库存在活动与稳定发行节奏并不等价。此研究未逐条审阅所有 Issues/PR，也未对每个竞品进行安装和功能复现。
