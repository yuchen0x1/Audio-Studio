/**
 * 编码参数面板：简单模式（比特率/采样率/声道）与专业模式（全部参数）。
 * 不适用当前目标格式的参数自动禁用（paramAvailability），杜绝无效控件。
 */
import { cloneElement, isValidElement, useId, useState } from 'react';
import type { EncodeParams } from '@audio-studio/shared';
import { getFormat, paramAvailability } from '@audio-studio/shared';
import { useI18n, useT } from '../i18n';

export interface ParamPanelProps {
  params: EncodeParams;
  onChange: (patch: Partial<EncodeParams>) => void;
  /** 是否显示文件名模板（批量/剪辑页可隐藏） */
  showNaming?: boolean;
}

type Mode = 'simple' | 'pro';

export function ParamPanel({ params, onChange, showNaming = true }: ParamPanelProps) {
  const lang = useI18n((s) => s.lang);
  const zh = lang !== 'en';
  const t = useT();
  const [mode, setMode] = useState<Mode>('simple');

  const def = getFormat(params.format);
  const avail = paramAvailability(params.format);
  if (!def) return null;

  const patch = (p: Partial<EncodeParams>) => onChange(p);

  return (
    <div className="col" style={{ gap: 'var(--sp-4)' }}>
      <div className="row-between">
        <span className="field-label" style={{ margin: 0 }}>
          {zh ? '编码参数' : 'Encoding parameters'}
        </span>
        <div className="segmented" role="tablist">
          <button
            role="tab"
            aria-selected={mode === 'simple'}
            className={mode === 'simple' ? 'active' : ''}
            onClick={() => setMode('simple')}
          >
            {zh ? '简单' : 'Simple'}
          </button>
          <button
            role="tab"
            aria-selected={mode === 'pro'}
            className={mode === 'pro' ? 'active' : ''}
            onClick={() => setMode('pro')}
          >
            {zh ? '专业' : 'Pro'}
          </button>
        </div>
      </div>

      {mode === 'simple' ? (
        <div className="grid-2">
          {avail.bitrate && (
            <Field label={zh ? '比特率' : 'Bitrate'}>
              <select
                className="select"
                value={params.bitrateKbps ?? def.defaultBitrateKbps ?? 192}
                onChange={(e) => patch({ bitrateKbps: Number(e.target.value), useVbr: false })}
              >
                {(def.bitrateOptionsKbps ?? [128, 192, 256, 320]).map((kbps) => (
                  <option key={kbps} value={kbps}>
                    {kbps} kbps
                  </option>
                ))}
              </select>
            </Field>
          )}
          {avail.vbr && (
            <Field
              label={zh ? 'VBR 质量' : 'VBR quality'}
              hint={zh ? '启用可变码率' : 'Variable bitrate'}
            >
              <label className="checkbox" style={{ height: 34 }}>
                <input
                  type="checkbox"
                  checked={!!params.useVbr}
                  onChange={(e) =>
                    patch({
                      useVbr: e.target.checked,
                      vbrQuality: e.target.checked ? (def.vbrQualityRange?.[1] ?? 5) : undefined,
                    })
                  }
                />
                {zh ? '使用 VBR' : 'Use VBR'}
              </label>
              {params.useVbr && def.vbrQualityRange && (
                <select
                  className="select mt-2"
                  aria-label={t('params.vbr')}
                  value={params.vbrQuality ?? def.vbrQualityRange[1]}
                  onChange={(e) => patch({ vbrQuality: Number(e.target.value) })}
                >
                  {vbrOptions(def).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          {avail.sampleRate && (
            <Field label={zh ? '采样率' : 'Sample rate'}>
              <select
                className="select"
                value={params.sampleRate}
                onChange={(e) => patch({ sampleRate: Number(e.target.value) })}
              >
                <option value={0}>{zh ? '保持源采样率' : 'Keep source'}</option>
                {def.sampleRates.map((r) => (
                  <option key={r} value={r}>
                    {r >= 1000 ? `${(r / 1000).toFixed(r % 1000 === 0 ? 1 : 2)} kHz` : `${r} Hz`}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {avail.channels && (
            <Field label={zh ? '声道' : 'Channels'}>
              <select
                className="select"
                value={params.channels}
                onChange={(e) => patch({ channels: Number(e.target.value) })}
              >
                <option value={0}>{zh ? '保持源声道' : 'Keep source'}</option>
                {def.channels.map((c) => (
                  <option key={c} value={c}>
                    {c === 1
                      ? zh
                        ? '单声道 Mono'
                        : 'Mono'
                      : c === 2
                        ? zh
                          ? '立体声 Stereo'
                          : 'Stereo'
                        : `${c} ch`}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      ) : (
        <div className="grid-2">
          {avail.bitrate && (
            <Field label={zh ? '比特率 (CBR)' : 'Bitrate (CBR)'}>
              <select
                className="select"
                value={params.bitrateKbps ?? def.defaultBitrateKbps ?? 192}
                disabled={!!params.useVbr}
                onChange={(e) => patch({ bitrateKbps: Number(e.target.value) })}
              >
                {(def.bitrateOptionsKbps ?? [128, 192, 256, 320]).map((kbps) => (
                  <option key={kbps} value={kbps}>
                    {kbps} kbps
                  </option>
                ))}
              </select>
            </Field>
          )}
          {avail.vbr && (
            <Field label={zh ? 'VBR' : 'VBR'}>
              <label className="checkbox" style={{ height: 34 }}>
                <input
                  type="checkbox"
                  checked={!!params.useVbr}
                  onChange={(e) =>
                    patch({
                      useVbr: e.target.checked,
                      vbrQuality: e.target.checked ? (def.vbrQualityRange?.[1] ?? 5) : undefined,
                    })
                  }
                />
                {zh ? '启用可变码率' : 'Enable VBR'}
              </label>
              {params.useVbr && def.vbrQualityRange && (
                <select
                  className="select mt-2"
                  aria-label={t('params.vbr')}
                  value={params.vbrQuality ?? def.vbrQualityRange[1]}
                  onChange={(e) => patch({ vbrQuality: Number(e.target.value) })}
                >
                  {vbrOptions(def).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          {avail.bitDepth && def.bitDepths && (
            <Field label={zh ? '位深度' : 'Bit depth'}>
              <select
                className="select"
                value={params.bitDepth ?? def.bitDepths[0]}
                onChange={(e) => {
                  const v = e.target.value;
                  patch({
                    bitDepth: (v === 'f32' ? 'f32' : Number(v)) as EncodeParams['bitDepth'],
                  });
                }}
              >
                {def.bitDepths.map((d) => (
                  <option key={String(d)} value={String(d)}>
                    {d === 'f32' ? '32-bit Float' : `${d}-bit`}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {avail.compression && def.compressionLevels && (
            <Field label={zh ? '压缩等级' : 'Compression'}>
              <select
                className="select"
                value={
                  params.compressionLevelId ??
                  def.defaultCompressionLevelId ??
                  def.compressionLevels[0].id
                }
                onChange={(e) => patch({ compressionLevelId: e.target.value })}
              >
                {def.compressionLevels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {avail.sampleRate && (
            <Field label={zh ? '采样率' : 'Sample rate'}>
              <select
                className="select"
                value={params.sampleRate}
                onChange={(e) => patch({ sampleRate: Number(e.target.value) })}
              >
                <option value={0}>{zh ? '保持源采样率' : 'Keep source'}</option>
                {def.sampleRates.map((r) => (
                  <option key={r} value={r}>
                    {r >= 1000 ? `${(r / 1000).toFixed(r % 1000 === 0 ? 1 : 2)} kHz` : `${r} Hz`}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {avail.channels && (
            <Field label={zh ? '声道' : 'Channels'}>
              <select
                className="select"
                value={params.channels}
                onChange={(e) => patch({ channels: Number(e.target.value) })}
              >
                <option value={0}>{zh ? '保持源声道' : 'Keep source'}</option>
                {def.channels.map((c) => (
                  <option key={c} value={c}>
                    {c === 1 ? 'Mono' : c === 2 ? 'Stereo' : `${c} ch`}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field
            label={`${zh ? '音量增益' : 'Gain'} (${params.gainDb > 0 ? '+' : ''}${params.gainDb} dB)`}
          >
            <input
              className="range"
              type="range"
              min={-60}
              max={20}
              step={1}
              value={params.gainDb}
              onChange={(e) => patch({ gainDb: Number(e.target.value) })}
            />
          </Field>
          <Field label={zh ? '响度标准化' : 'Loudness normalize'}>
            <div className="row" style={{ gap: 'var(--sp-2)' }}>
              <select
                className="select"
                aria-label={t('params.normalize')}
                value={params.normalize.enabled ? params.normalize.mode : 'off'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'off') patch({ normalize: { ...params.normalize, enabled: false } });
                  else if (v === 'peak')
                    patch({ normalize: { enabled: true, mode: 'peak', target: -1 } });
                  else patch({ normalize: { enabled: true, mode: 'lufs', target: -14 } });
                }}
              >
                <option value="off">{zh ? '关闭' : 'Off'}</option>
                <option value="peak">{zh ? '峰值归一化' : 'Peak normalize'}</option>
                <option value="lufs">{zh ? 'LUFS 响度' : 'LUFS loudness'}</option>
              </select>
              {params.normalize.enabled && (
                <input
                  className="input mono"
                  style={{ width: 84 }}
                  type="number"
                  step={0.1}
                  aria-label={t('params.normalizeTarget')}
                  min={params.normalize.mode === 'peak' ? -24 : -36}
                  max={params.normalize.mode === 'peak' ? 0 : -5}
                  value={params.normalize.target}
                  onChange={(e) =>
                    patch({ normalize: { ...params.normalize, target: Number(e.target.value) } })
                  }
                />
              )}
            </div>
          </Field>
          <Field label={zh ? '淡入 / 淡出 (ms)' : 'Fade in / out (ms)'}>
            <div className="row" style={{ gap: 'var(--sp-2)' }}>
              <input
                className="input mono"
                type="number"
                min={0}
                placeholder="In"
                aria-label={t('params.fadeIn')}
                value={params.fadeInMs || ''}
                onChange={(e) => patch({ fadeInMs: Math.max(0, Number(e.target.value) || 0) })}
              />
              <input
                className="input mono"
                type="number"
                min={0}
                placeholder="Out"
                aria-label={t('params.fadeOut')}
                value={params.fadeOutMs || ''}
                onChange={(e) => patch({ fadeOutMs: Math.max(0, Number(e.target.value) || 0) })}
              />
            </div>
          </Field>
        </div>
      )}

      {showNaming && (
        <Field
          label={zh ? '输出文件名模板' : 'Filename template'}
          hint={
            zh
              ? '{name} 源名 · {format} 格式 · {date} 日期 · {index} 序号'
              : '{name} source · {format} target · {date} date · {index} index'
          }
        >
          <input
            className="input mono"
            value={params.filenameTemplate}
            onChange={(e) => patch({ filenameTemplate: e.target.value })}
            spellCheck={false}
          />
        </Field>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  // 单个表单控件子元素：注入 id 并与 label 关联；复合控件由内部 aria-label 命名
  const isControl =
    isValidElement(children) &&
    typeof children.type === 'string' &&
    (children.type === 'input' || children.type === 'select' || children.type === 'textarea');
  return (
    <div className="field">
      {isControl ? (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      ) : (
        <span className="field-label">{label}</span>
      )}
      {isControl ? cloneElement(children, { id }) : children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

function vbrOptions(
  def: NonNullable<ReturnType<typeof getFormat>>,
): Array<{ value: number; label: string }> {
  const [min, max] = def.vbrQualityRange ?? [0, 9];
  const steps: number[] = [];
  // 均匀取 5-6 档
  const count = 5;
  for (let i = 0; i < count; i++) {
    const v = Math.round((min + ((max - min) * i) / (count - 1)) * 10) / 10;
    if (!steps.includes(v)) steps.push(v);
  }
  return steps.map((v) => ({
    value: v,
    label: def.vbrQualityLabels?.[v] ?? `Q ${v}`,
  }));
}
