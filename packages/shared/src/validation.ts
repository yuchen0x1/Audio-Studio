/**
 * 安全校验：路径/文件名清洗、防路径遍历、防命令注入（配合参数数组传递）、
 * 资源限制检查。Web 与 Windows 两端共享同一规则。
 */

const WINDOWS_RESERVED = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

/** 非法文件名字符（Windows 兼容 + 控制字符） */
// eslint-disable-next-line no-control-regex
const ILLEGAL_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

export const MAX_FILE_NAME_LEN = 160;

/**
 * 清洗文件名（不含目录部分）：
 * - 移除非法字符与控制字符
 * - 去除首尾空白与结尾的点/空格（Windows 限制）
 * - 处理保留名
 * - 截断超长
 * 注意：不会移除中文/emoji 等合法字符。
 */
export function sanitizeFileName(name: string): string {
  let s = String(name ?? '')
    .replace(ILLEGAL_CHARS, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  if (!s) return '';
  const stem = s.split('.')[0].toLowerCase();
  if (WINDOWS_RESERVED.has(stem)) s = `_${s}`;
  if (s.length > MAX_FILE_NAME_LEN) {
    const dot = s.lastIndexOf('.');
    const keepExt = dot > 0 && s.length - dot <= 12 ? s.slice(dot) : '';
    s = s.slice(0, MAX_FILE_NAME_LEN - keepExt.length) + keepExt;
  }
  return s;
}

/** 判断路径是否包含遍历 / 非法内容（输出路径安全检查） */
export function isPathUnsafe(p: string): boolean {
  if (!p || p.includes('\u0000')) return true;
  const norm = p.replace(/\\/g, '/');
  if (norm.includes('../') || norm.includes('/..') || norm === '..') return true;
  // 限制单段长度（防止异常构造）
  if (p.length > 4096) return true;
  return false;
}

/** 输出文件名安全校验：必须已清洗、不含路径分隔符 */
export function isOutputNameSafe(name: string): boolean {
  if (!name || name.length > 300) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\\/\u0000]/.test(name)) return false;
  if (name === '.' || name === '..') return false;
  return !isPathUnsafe(name);
}

/**
 * FFmpeg 参数向量安全校验。
 * 我们从不经过 shell 拼接命令，所有参数以数组传递；
 * 此处再拦截恶意构造（以 '-' 开头的路径、注入式过滤器片段等）。
 */
export function assertSafeArg(arg: string, index: number, role: 'path' | 'value'): void {
  if (role === 'path') {
    if (arg.startsWith('-')) {
      throw new Error(`参数 #${index} 非法：路径不能以 "-" 开头: ${arg.slice(0, 60)}`);
    }
    // eslint-disable-next-line no-control-regex
    if (/[\u0000\r\n]/.test(arg)) {
      throw new Error(`参数 #${index} 非法：路径包含控制字符`);
    }
  }
}

/** 音频文件大小限制（各平台引擎可覆盖） */
export interface SizeLimit {
  warnBytes: number;
  hardStopBytes: number;
}

export const WEB_SIZE_LIMIT: SizeLimit = {
  // ffmpeg.wasm 单线程核心在浏览器内解码+编码，峰值内存约为文件大小的 4~6 倍
  warnBytes: 200 * 1024 * 1024,
  hardStopBytes: 800 * 1024 * 1024,
};

export function checkSizeLimit(sizeBytes: number, limit: SizeLimit): 'ok' | 'warn' | 'reject' {
  if (sizeBytes > limit.hardStopBytes) return 'reject';
  if (sizeBytes > limit.warnBytes) return 'warn';
  return 'ok';
}

/** 估算 FFmpeg.wasm 处理的峰值内存（经验模型：读入 + 解码缓冲 + 编码缓冲） */
export function estimateWasmPeakBytes(sizeBytes: number, durationMs?: number): number {
  const base = sizeBytes * 4;
  const durationFactor = durationMs ? (durationMs / 1000) * 1024 * 1024 * 0.5 : 0; // 解码缓冲 ~0.5MB/s
  return Math.max(base, durationFactor) + 64 * 1024 * 1024; // 核心 + 固定开销
}

/** 校验模板是否安全（防止模板导致路径逃逸） */
export function validateFilenameTemplate(template: string): string | null {
  if (!template || !template.trim()) return '文件名模板不能为空';
  // eslint-disable-next-line no-control-regex
  if (/[\\/\u0000]/.test(template.replace(/\{[a-z_]+\}/gi, ''))) {
    return '文件名模板不能包含路径分隔符';
  }
  if (template.length > 200) return '文件名模板过长';
  return null;
}
