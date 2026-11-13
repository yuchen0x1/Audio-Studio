/**
 * 统一音频引擎契约（Web 与 Windows 两端实现同一接口，UI 完全与引擎解耦）。
 *
 * 实现方：
 * - Web:    WasmFfmpegEngine (ffmpeg.wasm, Web Worker 内运行)
 * - Desktop: NativeFfmpegEngine (Tauri Rust 进程 spawn ffmpeg.exe)
 */
import type { FormatId } from './formats';
import type { EncodeParams } from './params';

/** 引擎无关的源文件描述 */
export interface AudioSource {
  id: string;
  /** 展示名（原始文件名） */
  name: string;
  sizeBytes: number;
  lastModified?: number;
  /** Web：浏览器 File 对象（内存内，不上传） */
  file?: File;
  /** 原生平台：绝对路径 */
  path?: string;
}

export interface CoverArt {
  mime: string;
  data: Uint8Array;
}

/** 真实文件探测结果（禁止写死数据） */
export interface ProbeResult {
  /** magic/probe 识别的容器格式 */
  format: FormatId | null;
  /** 原始扩展名与实际格式不一致时提示 */
  extensionMismatch?: { declared: string; actual: string };
  codec: string;
  codecLongName?: string;
  container: string;
  durationMs?: number;
  bitrateKbps?: number;
  sampleRate?: number;
  channels?: number;
  channelLayout?: string;
  bitDepth?: number | 'f32';
  fileSizeBytes: number;
  tags: Record<string, string>;
  coverArt?: CoverArt;
  /** 附加流信息（视频封面流等） */
  streamSummary: string[];
  warnings: string[];
}

export interface FormatCapability {
  id: FormatId;
  canEncode: boolean;
  canDecode: boolean;
  encoder?: string;
  /** 不能编码的原因（展示在 UI 上，杜绝"假支持"） */
  reason?: string;
}

export interface EngineInfo {
  kind: 'wasm' | 'native' | 'mediacodec';
  name: string;
  version: string;
  /** 可执行文件/核心资源位置（诊断用） */
  location?: string;
}

export interface EngineCapabilities {
  engine: EngineInfo;
  encoders: string[];
  muxers: string[];
  filters: string[];
  formats: FormatCapability[];
}

/** 任务进度回调（引擎必须通过它上报真实进度） */
export interface TaskCallbacks {
  onProgress?: (p: {
    ratio: number;
    processedMs: number;
    totalMs?: number;
    speed?: number;
  }) => void;
  onLog?: (line: string) => void;
}

/** 统一作业类型 */
export interface ConvertJob {
  kind: 'convert';
  taskId: string;
  source: AudioSource;
  params: EncodeParams;
  /** 目标文件名（含扩展名） */
  outputFileName: string;
  /** 输出目录：Web 为虚拟目录名（下载用），原生为真实目录 */
  outputDir: string;
}

export interface TrimJob {
  kind: 'trim';
  taskId: string;
  source: AudioSource;
  /** 裁剪区间（毫秒，闭区间语义 [start, end)） */
  startMs: number;
  endMs: number;
  /** 分割点（毫秒数组）：导出多个片段时使用，为空则只导出选区 */
  splitPointsMs?: number[];
  /** 是否将每个片段作为独立文件导出 */
  exportSegments?: boolean;
  params: EncodeParams;
  outputFileName: string;
  outputDir: string;
}

export interface MergeItem {
  source: AudioSource;
  gainDb?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
}

export interface MergeJob {
  kind: 'merge';
  taskId: string;
  items: MergeItem[];
  /** 片段之间的静音间隔 ms */
  gapMs: number;
  params: EncodeParams;
  outputFileName: string;
  outputDir: string;
}

export type AudioJob = ConvertJob | TrimJob | MergeJob;

export interface JobResult {
  /** 原生平台：输出文件路径；Web：虚拟路径（下载时由前端取数据） */
  outputPath: string;
  fileName: string;
  sizeBytes: number;
  /** Web 专用：转换产物内存数据（由上层负责落盘/下载，不写死路径） */
  data?: Uint8Array;
  outputProbe?: ProbeResult;
  elapsedMs: number;
}

/** 引擎能力检测的输入约束（如浏览器内存预检） */
export interface ResourceEstimate {
  inputBytes: number;
  estimatedPeakBytes: number;
  warnings: string[];
}

export interface AudioEngine {
  readonly info: EngineInfo;
  /** 初始化（加载 wasm 核心 / 校验 ffmpeg 路径） */
  init(): Promise<EngineCapabilities>;
  /** 能力缓存后的查询（初始化后同步可用） */
  capabilities(): EngineCapabilities;
  /** 真实探测文件信息 */
  probe(source: AudioSource): Promise<ProbeResult>;
  /** 执行作业；取消请调用 cancel()，以 E_CANCELLED 拒绝 */
  run(job: AudioJob, callbacks?: TaskCallbacks): Promise<JobResult>;
  /** 取消运行中的任务 */
  cancel(taskId: string): Promise<void>;
  /** 资源预检（大文件在转换前评估） */
  estimate(source: AudioSource): ResourceEstimate;
  /** 释放资源 */
  dispose(): Promise<void>;
}
