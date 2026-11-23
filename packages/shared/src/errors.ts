/** 统一错误码与错误模型：Web 与 Windows 两端共享同一套错误语义 */

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
  | 'E_SOURCE_CHANGED' // 源文件在执行前被替换或修改
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
  E_SOURCE_CHANGED: { message: '源文件已被移动或修改，请重新导入后重试', retryable: false },
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
    [/file changed|size changed|source changed|content changed/, 'E_SOURCE_CHANGED'],
    // 兜底：输入打不开（非权限/路径问题）多为文件内容无效
    [/error opening input/, 'E_CORRUPT_FILE'],
  ];
  for (const [re, code] of patterns) {
    if (re.test(t)) return code;
  }
  return fallback;
}

export interface ErrorGuidance {
  /** 用户接下来应该做什么（中/英） */
  hint: { zh: string; en: string };
  /** 是否值得直接重试；区分“可重试”与“需先处理环境” */
  action: 'retry' | 'switch-engine' | 'fix-input' | 'fix-output' | 'wait' | 'none';
}

/**
 * 错误码 → 可操作建议。
 * 目的：界面不只显示“失败”，而是告诉用户下一步怎么做（参考 OBS/HandBrake 的错误提示）。
 */
export const ERROR_GUIDANCE: Record<EngineErrorCode, ErrorGuidance> = {
  E_ENGINE_INIT: {
    hint: {
      zh: '确认引擎文件完整且同源可访问；桌面版检查 FFmpeg 路径，或点击“重试初始化”。',
      en: 'Check that engine files are present and same-origin; on desktop verify the FFmpeg path, then retry initialization.',
    },
    action: 'retry',
  },
  E_UNSUPPORTED_FORMAT: {
    hint: {
      zh: '换一个输出格式，或先用“音频分析”确认源文件的真实格式。',
      en: 'Pick another output format, or use Analyze to confirm the real source format.',
    },
    action: 'fix-input',
  },
  E_CORRUPT_FILE: {
    hint: {
      zh: '源文件可能损坏或不完整，请重新导出/下载原文件后再试。',
      en: 'The source may be corrupt or truncated. Re-export or re-download it, then try again.',
    },
    action: 'fix-input',
  },
  E_ENCODER_UNAVAILABLE: {
    hint: {
      zh: '当前引擎没有该编码器；在设置页查看支持格式，或改用桌面版。',
      en: 'This engine lacks the encoder. Check supported formats in Settings or use the desktop app.',
    },
    action: 'switch-engine',
  },
  E_DECODER_UNAVAILABLE: {
    hint: {
      zh: '当前引擎无法解码该编码；可先转为 WAV/FLAC，或改用桌面版原生 FFmpeg。',
      en: 'This engine cannot decode the codec. Convert to WAV/FLAC first or use desktop FFmpeg.',
    },
    action: 'switch-engine',
  },
  E_PERMISSION: {
    hint: {
      zh: '检查源文件/输出目录权限，或在桌面版换一个可写目录。',
      en: 'Check permissions on the source and output folder, or choose a writable folder on desktop.',
    },
    action: 'fix-output',
  },
  E_DISK_FULL: {
    hint: {
      zh: '清理输出磁盘或换目录；空间释放后点击重试。',
      en: 'Free space on the output disk or change the folder, then retry.',
    },
    action: 'retry',
  },
  E_OUTPUT_EXISTS: {
    hint: {
      zh: '应用会自动改名而不是覆盖；如果仍出现，请更换输出目录或文件名模板。',
      en: 'The app renames instead of overwriting. If this persists, change the output folder or name template.',
    },
    action: 'fix-output',
  },
  E_PATH_UNSAFE: {
    hint: {
      zh: '输出名称包含非法字符或被拒绝的路径；修改文件名模板后重试。',
      en: 'The output name contains illegal characters or a rejected path. Edit the name template and retry.',
    },
    action: 'fix-output',
  },
  E_CANCELLED: {
    hint: {
      zh: '任务已停止，可从队列重新开始。',
      en: 'The job stopped; restart it from the queue.',
    },
    action: 'retry',
  },
  E_TIMEOUT: {
    hint: {
      zh: '任务被中断；关闭其他占用资源的程序后重试。',
      en: 'The job was interrupted. Close other heavy apps and retry.',
    },
    action: 'retry',
  },
  E_OUT_OF_MEMORY: {
    hint: {
      zh: '浏览器版内存有限：改用桌面版、降低并行数，或先裁剪/压缩源文件。',
      en: 'Browser memory is limited: use the desktop app, lower concurrency, or trim/compress the source.',
    },
    action: 'switch-engine',
  },
  E_NO_SPACE_CHECK: {
    hint: {
      zh: '目标磁盘空间不足；清理后重试，或改到其他磁盘。',
      en: 'Not enough space on the target disk. Free space or choose another disk.',
    },
    action: 'fix-output',
  },
  E_INVALID_PARAM: {
    hint: {
      zh: '检查比特率/采样率/声道是否与目标格式匹配，参数面板会标出不支持的项。',
      en: 'Check bitrate/sample rate/channels against the target format; unsupported values are flagged in the panel.',
    },
    action: 'fix-input',
  },
  E_SOURCE_MISSING: {
    hint: {
      zh: '源文件不在原位置；重新导入该文件后再入队。',
      en: 'The source is no longer where it was. Re-import the file and queue it again.',
    },
    action: 'fix-input',
  },
  E_SOURCE_CHANGED: {
    hint: {
      zh: '源文件在排队后发生了变化；重新导入以确保转换的是当前内容。',
      en: 'The source changed after queuing. Re-import it so the current content is converted.',
    },
    action: 'fix-input',
  },
  E_UNKNOWN: {
    hint: {
      zh: '展开错误详情查看引擎原始输出；可重试一次，仍失败请导出诊断信息。',
      en: 'Expand the details for raw engine output; retry once, then export diagnostics if it still fails.',
    },
    action: 'retry',
  },
};
