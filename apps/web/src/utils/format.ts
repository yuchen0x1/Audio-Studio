/** 展示格式化工具 */

export function fmtDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return '--:--';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 毫秒 → mm:ss.mmm（剪辑用，精确到毫秒） */
export function fmtDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '00:00.000';
  const totalMs = Math.round(ms);
  const m = Math.floor(totalMs / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const mm = totalMs % 1000;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(mm).padStart(3, '0')}`;
}

/** 解析 mm:ss.mmm / mmm / 数字毫秒 → ms；无效返回 null */
export function parseTimeInput(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(parseFloat(t));
  const m = /^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/.exec(t);
  if (m) {
    const min = parseInt(m[1], 10);
    const sec = parseInt(m[2], 10);
    const frac = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
    if (sec < 60) return min * 60000 + sec * 1000 + frac;
  }
  return null;
}

export function fmtSize(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '--';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function fmtBitrate(kbps: number | undefined): string {
  if (kbps === undefined || !Number.isFinite(kbps)) return '--';
  return `${Math.round(kbps)} kbps`;
}

export function fmtSampleRate(hz: number | undefined): string {
  if (!hz) return '--';
  if (hz % 1000 === 0) return `${hz / 1000}.0 kHz`;
  return `${(hz / 1000).toFixed(2)} kHz`;
}

export function fmtChannels(n: number | undefined, layout?: string): string {
  if (layout) return layout;
  if (n === 1) return 'Mono';
  if (n === 2) return 'Stereo';
  if (n) return `${n} ch`;
  return '--';
}

export function fmtPercent(ratio: number): string {
  return `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
}
