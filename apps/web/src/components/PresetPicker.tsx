/**
 * 预设置区：内置用途预设 + 用户自定义预设。
 * 用户预设只承载编码参数（见 shared/userPresets），可保存、重命名、删除、导入导出。
 */
import { useMemo, useRef, useState } from 'react';
import {
  ENCODE_PRESETS,
  MAX_USER_PRESETS,
  type EncodeParams,
  type EncodePresetId,
} from '@audio-studio/shared';
import { useI18n, useT } from '../i18n';
import { useSession } from '../stores/session';
import { usePresets } from '../stores/presets';
import { getEngine } from '../engine';
import { toast } from '../stores/toast';
import { IconDownload, IconEdit, IconPlus, IconTrash, IconUpload } from './Icons';

export interface PresetPickerProps {
  onSelect: (id: EncodePresetId) => void;
  /** 应用用户预设（完整参数替换） */
  onApplyUserPreset: (params: EncodeParams) => void;
  /** 当前参数：保存为用户预设置时快照 */
  currentParams: EncodeParams;
  disabled?: boolean;
}

export function PresetPicker({
  onSelect,
  onApplyUserPreset,
  currentParams,
  disabled = false,
}: PresetPickerProps) {
  const lang = useI18n((s) => s.lang) === 'en' ? 'en' : 'zh';
  const zh = lang === 'zh';
  const t = useT();
  const engineState = useSession((s) => s.engineState);
  const presets = usePresets((s) => s.presets);
  const savePreset = usePresets((s) => s.save);
  const renamePreset = usePresets((s) => s.rename);
  const removePreset = usePresets((s) => s.remove);
  const importFrom = usePresets((s) => s.importFrom);
  const exportAll = usePresets((s) => s.exportAll);

  const [name, setName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const importInput = useRef<HTMLInputElement>(null);

  const capabilities = useMemo(() => {
    if (engineState !== 'ready') return undefined;
    try {
      return getEngine().capabilities();
    } catch {
      return undefined;
    }
  }, [engineState]);

  const canEncode = (id: string) =>
    capabilities === undefined || capabilities.formats.some((f) => f.id === id && f.canEncode);

  const onSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.warning(zh ? '请输入预设名称' : 'Enter a preset name');
      return;
    }
    const exists = presets.some((p) => p.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
    if (exists && !window.confirm(zh ? `覆盖预设“${trimmed}”？` : `Overwrite “${trimmed}”?`))
      return;
    const saved = savePreset({ name: trimmed, params: currentParams });
    if (!saved) {
      toast.error(
        zh ? '无法保存' : 'Unable to save',
        zh ? `最多 ${MAX_USER_PRESETS} 个预设` : `Limit is ${MAX_USER_PRESETS} presets`,
      );
      return;
    }
    setName('');
    toast.success(zh ? '预设已保存' : 'Preset saved', saved.name);
  };

  const onRename = (id: string) => {
    const trimmed = renamingValue.trim();
    if (!trimmed) return;
    renamePreset(id, trimmed);
    setRenamingId(null);
    setRenamingValue('');
  };

  const onExport = () => {
    if (!presets.length) return;
    const blob = new Blob([exportAll()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audio-studio-presets-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast.success(zh ? '已导出预设' : 'Presets exported', String(presets.length));
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const count = importFrom(await file.text());
      toast.success(zh ? '已导入预设' : 'Presets imported', String(count));
    } catch (e) {
      toast.error(zh ? '导入失败' : 'Import failed', e instanceof Error ? e.message : String(e));
    } finally {
      if (importInput.current) importInput.current.value = '';
    }
  };

  return (
    <div className="preset-picker" role="group" aria-label={zh ? '用途预设' : 'Encoding presets'}>
      <div className="preset-intro">
        <span className="bold">{zh ? '从用途开始' : 'Start with a purpose'}</span>
        <span className="xs muted">
          {zh ? '应用后仍可调整全部参数' : 'Every parameter stays editable'}
        </span>
      </div>
      {ENCODE_PRESETS.map((preset) => (
        <button
          key={preset.id}
          className="btn preset-option"
          disabled={disabled || !canEncode(preset.format)}
          onClick={() => onSelect(preset.id)}
        >
          <span className="bold">{preset.label[lang]}</span>
          <span className="xs muted">{preset.detail[lang]}</span>
        </button>
      ))}

      {presets.length > 0 && (
        <div className="preset-user-list">
          <div className="preset-user-head">
            <span className="bold">{zh ? '我的预设' : 'My presets'}</span>
            <span className="xs muted">
              {presets.length}/{MAX_USER_PRESETS}
            </span>
          </div>
          {presets.map((p) => (
            <div key={p.id} className="preset-user-row">
              {renamingId === p.id ? (
                <input
                  className="input preset-rename"
                  autoFocus
                  value={renamingValue}
                  aria-label={t('aria.presetName')}
                  onChange={(e) => setRenamingValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onRename(p.id);
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  onBlur={() => onRename(p.id)}
                />
              ) : (
                <button
                  className="btn preset-option grow"
                  disabled={disabled || !canEncode(p.params.format)}
                  onClick={() => onApplyUserPreset(p.params)}
                  onDoubleClick={() => {
                    setRenamingId(p.id);
                    setRenamingValue(p.name);
                  }}
                  title={zh ? '单击应用，双击重命名' : 'Click to apply, double-click to rename'}
                >
                  <span className="bold">{p.name}</span>
                  <span className="xs muted">
                    {p.params.format.toUpperCase()}
                    {p.params.bitrateKbps ? ` · ${p.params.bitrateKbps} kbps` : ''}
                  </span>
                </button>
              )}
              <button
                className="btn btn-ghost btn-icon btn-sm"
                aria-label={t('aria.renamePreset')}
                title={zh ? '重命名' : 'Rename'}
                onClick={() => {
                  setRenamingId(p.id);
                  setRenamingValue(p.name);
                }}
              >
                <IconEdit size={13} />
              </button>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                aria-label={t('aria.deletePreset')}
                title={zh ? '删除预设' : 'Delete preset'}
                onClick={() => {
                  if (window.confirm(zh ? `删除预设“${p.name}”？` : `Delete “${p.name}”?`))
                    removePreset(p.id);
                }}
              >
                <IconTrash size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="preset-save">
        <input
          className="input"
          value={name}
          maxLength={80}
          placeholder={zh ? '把这组参数保存为预设…' : 'Save these settings as a preset…'}
          aria-label={t('aria.presetName')}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave();
          }}
        />
        <button className="btn btn-sm" onClick={onSave} disabled={disabled}>
          <IconPlus size={13} /> {zh ? '保存预设' : 'Save preset'}
        </button>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={onExport}
          disabled={!presets.length}
          title={zh ? '导出全部预设' : 'Export all presets'}
          aria-label={t('aria.exportPresets')}
        >
          <IconDownload size={13} />
        </button>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={() => importInput.current?.click()}
          title={zh ? '导入预设' : 'Import presets'}
          aria-label={t('aria.importPresets')}
        >
          <IconUpload size={13} />
        </button>
        <input
          ref={importInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => void onImport(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
