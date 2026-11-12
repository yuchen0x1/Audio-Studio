/**
 * 目标格式选择器：只展示引擎能力检测通过（canEncode）的格式，
 * 不支持的格式显示为禁用并给出原因 —— 杜绝"假支持"。
 */
import { useEffect, useId, useMemo } from 'react';
import type { FormatId } from '@audio-studio/shared';
import { FORMATS, getFormat } from '@audio-studio/shared';
import { useSession } from '../stores/session';
import { getEngine } from '../engine';
import { useI18n } from '../i18n';

export interface FormatSelectProps {
  value: FormatId;
  onChange: (id: FormatId) => void;
  /** 禁用（如任务执行中） */
  disabled?: boolean;
  id?: string;
}

export function FormatSelect({ value, onChange, disabled, id }: FormatSelectProps) {
  const lang = useI18n((s) => s.lang);
  const engineState = useSession((s) => s.engineState);
  // 未显式传 id 时自动生成，保证 label 与 select 始终关联
  const autoId = useId();
  const selectId = id ?? autoId;

  // 能力表：引擎就绪后从 capabilities() 读取（真实检测结果）
  const caps = useMemo(() => {
    if (engineState !== 'ready') return null;
    try {
      return getEngine().capabilities();
    } catch {
      return null;
    }
  }, [engineState]);

  const options = useMemo(() => {
    return (Object.keys(FORMATS) as FormatId[]).map((id) => {
      const def = getFormat(id)!;
      const cap = caps?.formats.find((f) => f.id === id);
      const canEncode = cap ? cap.canEncode : engineState !== 'ready'; // 未就绪时先全部可选，就绪后收窄
      const reason =
        cap && !cap.canEncode
          ? (cap.reason ?? (lang === 'en' ? 'Encoder unavailable' : '编码器不可用'))
          : undefined;
      return { id, def, canEncode, reason, encoder: cap?.encoder };
    });
  }, [caps, engineState, lang]);

  const enabled = options.filter((o) => o.canEncode);
  const current = options.find((o) => o.id === value);

  // 当前值在能力检测后不可用 → 自动回退到第一个可用格式（防止假支持进入队列）
  useEffect(() => {
    if (engineState === 'ready' && current && !current.canEncode && enabled.length) {
      onChange(enabled[0].id);
    }
  }, [engineState, current, enabled, onChange]);

  return (
    <div className="field">
      <label className="field-label" htmlFor={selectId}>
        <span>{lang === 'en' ? 'Target format' : '目标格式'}</span>
        {current?.encoder && <span className="xs mono muted">{current.encoder}</span>}
      </label>
      <select
        id={selectId}
        className="select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as FormatId)}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={!o.canEncode}>
            {o.def.label}
            {!o.canEncode ? ` — ${lang === 'en' ? 'unavailable' : '不可用'}` : ''}
            {o.def.kind === 'lossless' ? ' · 无损' : ''}
          </option>
        ))}
      </select>
      {current && (
        <span className="field-hint">
          {current.reason ?? current.def.note ?? ''}
          {current.canEncode && current.def.lossless && lang === 'en' ? ' · lossless' : ''}
        </span>
      )}
    </div>
  );
}
