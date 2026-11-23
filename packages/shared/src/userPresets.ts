/**
 * 用户自定义预设：版本化、可导入导出、可分享的纯数据模型。
 *
 * 设计约束（参考 fre:ac / LMMS 的预设迁移问题）：
 * - 只保存编码参数与名称模板，不保存路径、脚本或任意代码；
 * - 导入时逐字段白名单校验，未知字段丢弃，非法值拒绝；
 * - 版本号独立于应用版本，未来新增字段可通过迁移函数补齐。
 */
import { FORMATS, type FormatId } from './formats';
import { defaultParamsFor, validateParams, type EncodeParams } from './params';
import { validateFilenameTemplate } from './validation';

export const USER_PRESET_VERSION = 1;
export const MAX_USER_PRESETS = 50;
export const MAX_PRESET_JSON_BYTES = 128 * 1024;

export interface UserPreset {
  id: string;
  name: string;
  /** 预设说明（可选，展示用） */
  description?: string;
  /** 完整编码参数快照 */
  params: EncodeParams;
  createdAt: number;
  updatedAt: number;
  /** 内置用途预设的 id（若由某个内置预设定制而来） */
  basedOn?: string;
}

export interface UserPresetExport {
  version: number;
  exportedAt: number;
  presets: UserPreset[];
}

export type UserPresetValidation = { ok: true; preset: UserPreset } | { ok: false; error: string };

const UUID_RE = /^[A-Za-z0-9_-]{6,64}$/;

export function createUserPresetId(): string {
  return `up_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** 以目标格式的默认参数为底，合并用户的合法字段，避免字段缺失导致半成品预设。 */
export function normalizePresetParams(value: unknown): EncodeParams | null {
  if (!isRecord(value)) return null;
  const format = value.format;
  if (typeof format !== 'string' || !(format in FORMATS)) return null;
  const base = defaultParamsFor(format as FormatId);
  const next: EncodeParams = { ...base };

  if (finite(value.bitrateKbps) && value.bitrateKbps > 0) next.bitrateKbps = value.bitrateKbps;
  if (finite(value.vbrQuality)) next.vbrQuality = value.vbrQuality;
  if (typeof value.useVbr === 'boolean') next.useVbr = value.useVbr;
  if (finite(value.sampleRate) && value.sampleRate >= 0) next.sampleRate = value.sampleRate;
  if (finite(value.channels) && value.channels >= 0) next.channels = value.channels;
  if (
    value.bitDepth === 16 ||
    value.bitDepth === 24 ||
    value.bitDepth === 32 ||
    value.bitDepth === 'f32'
  )
    next.bitDepth = value.bitDepth;
  if (typeof value.encoder === 'string' && value.encoder.length <= 64) next.encoder = value.encoder;
  if (typeof value.compressionLevelId === 'string')
    next.compressionLevelId = value.compressionLevelId;
  if (finite(value.gainDb)) next.gainDb = value.gainDb;
  if (isRecord(value.normalize)) {
    const n = value.normalize;
    next.normalize = {
      enabled: n.enabled === true,
      mode: n.mode === 'peak' ? 'peak' : 'lufs',
      target: finite(n.target) ? n.target : base.normalize.target,
    };
  }
  if (finite(value.fadeInMs) && value.fadeInMs >= 0) next.fadeInMs = value.fadeInMs;
  if (finite(value.fadeOutMs) && value.fadeOutMs >= 0) next.fadeOutMs = value.fadeOutMs;
  if (typeof value.filenameTemplate === 'string' && value.filenameTemplate.trim())
    next.filenameTemplate = value.filenameTemplate;

  if (validateFilenameTemplate(next.filenameTemplate)) return null;
  if (validateParams(next).length) return null;
  return next;
}

export function validateUserPreset(value: unknown): UserPresetValidation {
  if (!isRecord(value)) return { ok: false, error: '预设必须是对象' };
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!name) return { ok: false, error: '预设名称不能为空' };
  if (name.length > 80) return { ok: false, error: '预设名称过长' };
  const id = typeof value.id === 'string' && UUID_RE.test(value.id) ? value.id : '';
  if (!id) return { ok: false, error: '预设 ID 非法' };
  const params = normalizePresetParams(value.params);
  if (!params) return { ok: false, error: `预设“${name}”的参数非法` };
  const createdAt = finite(value.createdAt) ? value.createdAt : Date.now();
  const updatedAt = finite(value.updatedAt) ? value.updatedAt : createdAt;
  return {
    ok: true,
    preset: {
      id,
      name,
      description:
        typeof value.description === 'string' ? value.description.slice(0, 280) : undefined,
      params,
      createdAt,
      updatedAt,
      basedOn: typeof value.basedOn === 'string' ? value.basedOn : undefined,
    },
  };
}

export function serializeUserPresets(presets: UserPreset[]): string {
  const payload: UserPresetExport = {
    version: USER_PRESET_VERSION,
    exportedAt: Date.now(),
    presets: presets.slice(0, MAX_USER_PRESETS),
  };
  return JSON.stringify(payload, null, 2);
}

/** 解析导入文件：整份有效才导入，避免一半合法一半损坏的混合状态。 */
export function parseUserPresets(text: string): UserPreset[] {
  if (new TextEncoder().encode(text).byteLength > MAX_PRESET_JSON_BYTES) {
    throw new Error('预设文件过大');
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('预设文件不是有效 JSON');
  }
  const raw = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.presets)
      ? payload.presets
      : null;
  if (!raw) throw new Error('预设文件缺少 presets 数组');
  if (raw.length > MAX_USER_PRESETS) throw new Error('预设数量超过上限');
  const out: UserPreset[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const result = validateUserPreset(entry);
    if (!result.ok) throw new Error(result.error);
    if (seen.has(result.preset.id)) continue;
    seen.add(result.preset.id);
    out.push(result.preset);
  }
  return out;
}

/** 重命名/更新时保持 id 与创建时间，只更新内容与 updatedAt。 */
export function updateUserPreset(
  presets: UserPreset[],
  id: string,
  patch: Partial<Pick<UserPreset, 'name' | 'description' | 'params'>>,
): UserPreset[] {
  return presets.map((p) =>
    p.id === id
      ? {
          ...p,
          ...patch,
          name: patch.name?.trim() || p.name,
          params: patch.params ?? p.params,
          updatedAt: Date.now(),
        }
      : p,
  );
}
