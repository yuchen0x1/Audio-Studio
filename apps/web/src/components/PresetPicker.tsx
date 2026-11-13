import { useMemo } from 'react';
import { ENCODE_PRESETS, type EncodePresetId } from '@audio-studio/shared';
import { useI18n } from '../i18n';
import { useSession } from '../stores/session';
import { getEngine } from '../engine';

export function PresetPicker({
  onSelect,
  disabled = false,
}: {
  onSelect: (id: EncodePresetId) => void;
  disabled?: boolean;
}) {
  const lang = useI18n((s) => s.lang) === 'en' ? 'en' : 'zh';
  const engineState = useSession((s) => s.engineState);
  const capabilities = useMemo(() => {
    if (engineState !== 'ready') return undefined;
    try {
      return getEngine().capabilities();
    } catch {
      return undefined;
    }
  }, [engineState]);
  return (
    <div
      className="preset-picker"
      role="group"
      aria-label={lang === 'zh' ? '用途预设' : 'Encoding presets'}
    >
      <div className="preset-intro">
        <span className="bold">{lang === 'zh' ? '从用途开始' : 'Start with a purpose'}</span>
        <span className="xs muted">
          {lang === 'zh' ? '应用后仍可调整全部参数' : 'Every parameter stays editable'}
        </span>
      </div>
      {ENCODE_PRESETS.map((preset) => (
        <button
          key={preset.id}
          className="btn preset-option"
          disabled={
            disabled ||
            (capabilities !== undefined &&
              !capabilities.formats.some((f) => f.id === preset.format && f.canEncode))
          }
          onClick={() => onSelect(preset.id)}
        >
          <span className="bold">{preset.label[lang]}</span>
          <span className="xs muted">{preset.detail[lang]}</span>
        </button>
      ))}
    </div>
  );
}
