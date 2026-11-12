/**
 * 波形峰值计算：解码音频 → 按宽度分桶取 min/max。
 * 大文件用 OfflineAudioContext 降采样到 8kHz 单声道，内存有界。
 */

export interface PeaksResult {
  /** 交错的 [min0, max0, min1, max1, ...]，长度 = buckets * 2 */
  peaks: Float32Array;
  buckets: number;
  durationMs: number;
}

const MAX_FULL_DECODE_BYTES = 60 * 1024 * 1024; // 60MB 内全质量解码
const DOWNSAMPLE_RATE = 8000;

async function decodeFull(file: Blob): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    const buf = await file.arrayBuffer();
    return await ctx.decodeAudioData(buf);
  } finally {
    void ctx.close().catch(() => undefined);
  }
}

/** 降采样解码（大文件）：得到 8k 单声道 PCM，用于波形与粗略时长 */
async function decodeDownmixed(file: Blob, durationMsHint: number): Promise<AudioBuffer> {
  const full = await decodeFull(file); // 先拿完整 buffer 才能离线渲染
  void durationMsHint;
  if (full.sampleRate <= DOWNSAMPLE_RATE && full.numberOfChannels === 1) return full;
  const length = Math.ceil(full.duration * DOWNSAMPLE_RATE);
  const offline = new OfflineAudioContext(1, length, DOWNSAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = full;
  src.connect(offline.destination);
  src.start();
  return offline.startRendering();
}

/**
 * 计算波形峰值。
 * @param file 源文件
 * @param buckets 目标桶数（一般 = 画布 CSS 宽度 × 2）
 */
export async function computePeaks(file: Blob, buckets: number): Promise<PeaksResult> {
  const n = Math.max(16, Math.min(8192, Math.floor(buckets)));
  const useFull = file.size <= MAX_FULL_DECODE_BYTES;
  const audio = useFull ? await decodeFull(file) : await decodeDownmixed(file, 0);

  const channels = audio.numberOfChannels;
  const frames = audio.length;
  const perBucket = Math.max(1, Math.floor(frames / n));
  const peaks = new Float32Array(n * 2);

  // 合并所有声道
  const data: Float32Array[] = [];
  for (let c = 0; c < channels; c++) data.push(audio.getChannelData(c));

  for (let b = 0; b < n; b++) {
    const start = b * perBucket;
    const end = Math.min(frames, start + perBucket);
    let min = 0;
    let max = 0;
    for (let i = start; i < end; i++) {
      let v = 0;
      for (let c = 0; c < channels; c++) v += data[c][i];
      v /= channels;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    peaks[b * 2] = min;
    peaks[b * 2 + 1] = max;
  }

  return { peaks, buckets: n, durationMs: Math.round(audio.duration * 1000) };
}

/** 在画布上绘制波形 */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: Float32Array,
  opts: {
    progress?: number; // 0..1 已播放比例
    selection?: [number, number] | null; // 0..1 选区
    color?: string;
    playedColor?: string;
    selectionColor?: string;
    background?: string;
    lineJoin?: CanvasLineJoin;
  } = {},
): void {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (!cssW || !cssH) return;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, cssW, cssH);
  }

  // 选区高亮
  if (opts.selection) {
    const [a, b] = opts.selection;
    ctx.fillStyle = opts.selectionColor ?? 'rgba(79, 140, 255, 0.18)';
    ctx.fillRect(a * cssW, 0, (b - a) * cssW, cssH);
  }

  const buckets = peaks.length / 2;
  const barW = cssW / buckets;
  const mid = cssH / 2;
  const progress = opts.progress ?? 0;
  const playedX = progress * cssW;

  const baseColor = opts.color ?? 'rgba(140, 155, 190, 0.55)';
  const playedColor = opts.playedColor ?? 'rgb(79, 140, 255)';

  ctx.lineJoin = opts.lineJoin ?? 'round';
  ctx.lineWidth = Math.max(1, barW * 0.72);

  // 分两段绘制（未播放 / 已播放）以减少状态切换
  for (let pass = 0 as 0 | 1; pass <= 1; pass++) {
    ctx.strokeStyle = pass === 0 ? baseColor : playedColor;
    ctx.beginPath();
    for (let b = 0; b < buckets; b++) {
      const x = b * barW + barW / 2;
      if (pass === 0 && x > playedX) continue;
      if (pass === 1 && x <= playedX) continue;
      const min = peaks[b * 2];
      const max = peaks[b * 2 + 1];
      const y1 = mid - max * (mid - 2);
      const y2 = mid - min * (mid - 2);
      ctx.moveTo(x, Math.min(y1, y2));
      ctx.lineTo(x, Math.max(y1, y2) + 0.5);
    }
    ctx.stroke();
  }

  // 播放头
  if (progress > 0 && progress < 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(playedX - 0.5, 0, 1.5, cssH);
  }
}

/** 从 AudioBuffer 直接绘制（剪辑页已解码场景） */
export function peaksFromBuffer(audio: AudioBuffer, buckets: number): PeaksResult {
  const n = Math.max(16, Math.min(16384, Math.floor(buckets)));
  const channels = audio.numberOfChannels;
  const frames = audio.length;
  const perBucket = Math.max(1, Math.floor(frames / n));
  const peaks = new Float32Array(n * 2);
  const data: Float32Array[] = [];
  for (let c = 0; c < channels; c++) data.push(audio.getChannelData(c));
  for (let b = 0; b < n; b++) {
    const start = b * perBucket;
    const end = Math.min(frames, start + perBucket);
    let min = 0;
    let max = 0;
    for (let i = start; i < end; i++) {
      let v = 0;
      for (let c = 0; c < channels; c++) v += data[c][i];
      v /= channels;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    peaks[b * 2] = min;
    peaks[b * 2 + 1] = max;
  }
  return { peaks, buckets: n, durationMs: Math.round(audio.duration * 1000) };
}
