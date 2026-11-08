/** 输出文件名模板系统（三平台共享） */

import { FormatDef } from './formats';
import { sanitizeFileName } from './validation';

export interface NamingContext {
  /** 源文件名（不含扩展名） */
  sourceName: string;
  /** 源格式（展示用小写） */
  sourceFormat?: string;
  /** 目标格式定义 */
  format: FormatDef;
  /** 任务序号（批量时从 1 开始） */
  index?: number;
  /** 元数据（可选，标签编辑后可用） */
  tags?: Record<string, string>;
  /** 运行时刻 */
  now?: Date;
}

export const NAMING_TOKENS: Array<{ token: string; desc: string }> = [
  { token: '{name}', desc: '源文件名（不含扩展名）' },
  { token: '{format}', desc: '目标格式（小写，如 mp3）' },
  { token: '{source_format}', desc: '源格式' },
  { token: '{date}', desc: '日期 YYYYMMDD' },
  { token: '{time}', desc: '时间 HHMMSS' },
  { token: '{index}', desc: '批量序号' },
  { token: '{artist}', desc: '艺术家标签' },
  { token: '{title}', desc: '标题标签' },
  { token: '{album}', desc: '专辑标签' },
];

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

export function applyTemplate(template: string, ctx: NamingContext): string {
  const now = ctx.now ?? new Date();
  const tags = ctx.tags ?? {};
  const map: Record<string, string> = {
    name: ctx.sourceName,
    format: ctx.format.extensions[0].toLowerCase(),
    source_format: (ctx.sourceFormat ?? '').toLowerCase(),
    date: `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
    time: `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
    index: ctx.index !== undefined ? String(ctx.index) : '',
    artist: tags.artist ?? tags.ARTIST ?? '',
    title: tags.title ?? tags.TITLE ?? '',
    album: tags.album ?? tags.ALBUM ?? '',
  };
  const out = template.replace(/\{([a-z_]+)\}/gi, (m, key: string) => {
    const v = map[key.toLowerCase()];
    return v !== undefined ? v : m;
  });
  // 清理：连续空格/下划线折叠为单个，去掉首尾分隔符（不破坏 " - " 这类有意分隔）
  return out
    .replace(/[ ]{2,}/g, ' ')
    .replace(/_{2,}/g, '_')
    .replace(/^[ _-]+/, '')
    .replace(/[ _]+$/, '');
}

/**
 * 生成最终输出文件名：
 * 1) 应用模板
 * 2) 清洗非法字符
 * 3) 扩展名由目标格式决定（保证"所选即所得"）
 */
export function buildOutputFileName(
  template: string,
  ctx: NamingContext,
  opts?: { forceExt?: boolean },
): string {
  let base = applyTemplate(template, ctx);
  base = sanitizeFileName(base);
  if (!base) base = `output_${ctx.index ?? 1}`;
  const ext = ctx.format.extensions[0].toLowerCase();

  const m = /\.([a-z0-9]+)$/i.exec(base);
  if (m) {
    const givenExt = m[1].toLowerCase();
    const knownAudioExt = isKnownAudioExt(givenExt);
    if (ctx.format.extensions.includes(givenExt)) {
      // 扩展名已正确（如 .m4a 且目标 m4a）
      return base;
    }
    if (knownAudioExt || opts?.forceExt) {
      // 已知音频扩展名但与目标不符 → 替换，保证扩展名 = 所选格式
      return `${base.slice(0, m.index)}.${ext}`;
    }
    // 非音频扩展名 → 视为文件名的一部分，追加正确扩展名
    return `${base}.${ext}`;
  }
  return `${base}.${ext}`;
}

const KNOWN_AUDIO_EXTS = new Set([
  'mp3', 'wav', 'wave', 'flac', 'aac', 'm4a', 'm4b', 'mp4', 'ogg', 'oga',
  'opus', 'wma', 'aiff', 'aif', 'ape', 'ac3', 'amr', 'alac', 'au', 'voc',
  'mid', 'midi', 'mka', 'mpc', 'oga', 'spx', 'tta', 'wv', 'dsf', 'dff',
]);

export function isKnownAudioExt(ext: string): boolean {
  return KNOWN_AUDIO_EXTS.has(ext.replace(/^\./, '').toLowerCase());
}
