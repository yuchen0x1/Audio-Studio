/**
 * 能力检测解析器在共享包（Web 与 Windows 两端统一），此处保留薄封装以便 Web 引擎引用。
 */
export {
  parseEncoders,
  parseMuxers,
  parseFilters,
  buildFormatCapabilities,
  assembleCapabilities,
  findCapability,
} from '@audio-studio/shared';
