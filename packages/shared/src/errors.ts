/** 统一错误码与错误模型：三平台共享同一套错误语义 */

export type EngineErrorCode =
  | 'E_ENGINE_INIT' // 引擎初始化失败
  | 'E_UNSUPPORTED_FORMAT' // 输入/输出格式不支持
  | 'E_CORRUPT_FILE' // 文件损坏 / 数据非法
  | 'E_ENCODER_UNAVAILABLE' // 目标编码器不可用
  | 'E_DECODER_UNAVAILABLE' // 输入编码器不可用
  | 'E_PERMISSION' // 文件权限 / 沙箱拒绝
  | 'E_DISK_FULL' // 磁盘空间不足
  | 'E_OUTPUT_EXISTS' // 输出文件冲突（默认策略：重命名）
  | 'E_PATH_UNSAFE' // 路径不安全（遍历 / 非法字符）
  | 'E_CANCELLED' // 用户取消
  | 'E_TIMEOUT' // 处理超时
  | 'E_OUT_OF_MEMORY' // 内存不足（浏览器大文件常见）
  | 'E_NO_SPACE_CHECK' // 预检：剩余空间不够
  | 'E_INVALID_PARAM' // 参数非法
  | 'E_SOURCE_MISSING' // 源文件不存在
  | 'E_UNKNOWN'; // 未知错误

export interface EngineErrorInfo {
  code: EngineErrorCode;
  /** 人类可读的中文说明 */
  message: string;
  /** 引擎原始输出（日志/FFmpeg stderr 片段），用于诊断 */
  detail?: string;
  /** 是否可重试（网络/临时性错误才为 true） */
  retryable: boolean;
}

export class EngineError extends Error implements EngineErrorInfo {
  readonly code: EngineErrorCode;
  readonly detail?: string;
  readonly retryable: boolean;

  constructor(code: EngineErrorCode, message: string, detail?: string, retryable = false) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    this.detail = detail;
    this.retryable = retryable;
  }
}

const MESSAGES: Record<EngineErrorCode, { message: string; retryable: boolean }> = {
  E_ENGINE_INIT: { message: '音频引擎初始化失败，请检查引擎组件是否完整', retryable: true },
  E_UNSUPPORTED_FORMAT: { message: '不支持的音频格式', retryable: false },
  E_CORRUPT_FILE: { message: '音频文件已损坏或不是有效的音频数据', retryable: false },
  E_ENCODER_UNAVAILABLE: { message: '目标编码器在当前引擎中不可用', retryable: false },
  E_DECODER_UNAVAILABLE: { message: '无法解码该音频（引擎缺少对应解码器）', retryable: false },
  E_PERMISSION: { message: '文件访问被拒绝，请检查权限', retryable: false },
  E_DISK_FULL: { message: '磁盘空间不足，请清理后重试', retryable: true },
  E_OUTPUT_EXISTS: { message: '输出文件已存在', retryable: false },
  E_PATH_UNSAFE: { message: '文件路径不安全或包含非法字符', retryable: false },
  E_CANCELLED: { message: '任务已取消', retryable: false },
  E_TIMEOUT: { message: '处理超时，任务已中断', retryable: true },
  E_OUT_OF_MEMORY: { message: '内存不足，请关闭其他页面或减小文件后重试', retryable: true },
  E_NO_SPACE_CHECK: { message: '目标磁盘剩余空间不足', retryable: false },
  E_INVALID_PARAM: { message: '编码参数无效', retryable: false },
  E_SOURCE_MISSING: { message: '找不到源文件', retryable: false },
  E_UNKNOWN: { message: '处理失败', retryable: true },
};

export function makeEngineError(
  code: EngineErrorCode,
  detail?: string,
  overrides?: { message?: string },
): EngineError {
  const meta = MESSAGES[code];
  return new EngineError(code, overrides?.message ?? meta.message, detail, meta.retryable);
}

/** 把 FFmpeg / 底层 stderr 映射为统一错误码 */
export function classifyEngineOutput(
  stderrText: string,
  fallback: EngineErrorCode = 'E_UNKNOWN',
): EngineErrorCode {
  const t = stderrText.toLowerCase();
  const patterns: Array<[RegExp, EngineErrorCode]> = [
    [
      /invalid data found when processing input|could not find codec parameters|error while decoding|moov atom not found|truncat.*file|failed to read frame size|header missing/,
      'E_CORRUPT_FILE',
    ],
    [/unknown encoder|encoder .* not found/, 'E_ENCODER_UNAVAILABLE'],
    [/unknown decoder|decoder .* not found|no decoder/, 'E_DECODER_UNAVAILABLE'],
    [
      /unsupported codec|not supported|requested output format.*not|unable to find a suitable output format/,
      'E_UNSUPPORTED_FORMAT',
    ],
    [/no space left|disk (full|quota)/, 'E_DISK_FULL'],
    [/permission denied|operation not permitted|eacces/, 'E_PERMISSION'],
    [/no such file or directory|enoent/, 'E_SOURCE_MISSING'],
    [/cannot allocate memory|out of memory|std::bad_alloc|memoryerror/, 'E_OUT_OF_MEMORY'],
    [/killed|sigkill/, 'E_TIMEOUT'],
    // 兜底：输入打不开（非权限/路径问题）多为文件内容无效
    [/error opening input/, 'E_CORRUPT_FILE'],
  ];
  for (const [re, code] of patterns) {
    if (re.test(t)) return code;
  }
  return fallback;
}
