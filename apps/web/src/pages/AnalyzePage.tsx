/**
 * 音频分析页：选择文件 → 引擎真实探测（probe）→ 展示编码/元数据/流/封面。
 * 所有信息均来自 engine.probe() 的真实结果，禁止写死。
 */
import { useCallback, useRef, useState } from 'react';
import type { AudioSource, ProbeResult } from '@audio-studio/shared';
import { FORMATS } from '@audio-studio/shared';
import { useI18n, useT } from '../i18n';
import { initEngine, getEngine } from '../engine';
import { pickAudioFiles } from '../platform';
import { fmtSize } from '../utils/format';
import { FileInfoTable } from '../components/FileInfoTable';
import { CoverArtView } from '../components/CoverArtView';
import { Dropzone } from '../components/Dropzone';
import { IconWarning } from '../components/Icons';

interface AnalyzeState {
  source: AudioSource | null;
  probe: ProbeResult | null;
  probing: boolean;
  error: string | null;
}

export function AnalyzePage() {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const S = lang === 'en' ? EN : ZH;

  const [state, setState] = useState<AnalyzeState>({
    source: null, probe: null, probing: false, error: null,
  });
  const reqSeq = useRef(0);

  const runProbe = useCallback(async (src: AudioSource) => {
    const seq = ++reqSeq.current;
    setState({ source: src, probe: null, probing: true, error: null });
    try {
      await initEngine();
      const probe = await getEngine().probe(src);
      if (seq !== reqSeq.current) return; // 已被更新的选择取代
      setState({ source: src, probe, probing: false, error: null });
    } catch (e) {
      if (seq !== reqSeq.current) return;
      setState({
        source: src, probe: null, probing: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const onFiles = useCallback((sources: AudioSource[]) => {
    const first = sources[0];
    if (first) void runProbe(first);
  }, [runProbe]);

  const pick = useCallback(async () => {
    const sources = await pickAudioFiles(false);
    if (sources[0]) void runProbe(sources[0]);
  }, [runProbe]);

  const { source, probe, probing, error } = state;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('analyze.title')}</h1>
          <p className="page-desc">{t('analyze.desc')}</p>
        </div>
        <button className="btn btn-primary" onClick={() => void pick()}>
          {t('analyze.pick')}
        </button>
      </div>

      {!source && (
        <Dropzone onFiles={onFiles} multiple={false} title={S.dropTitle} sub={S.dropSub} />
      )}

      {source && (
        <div className="col">
          {/* 文件卡片 */}
          <div className="card">
            <div className="row-between" style={{ flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
              <div className="row" style={{ minWidth: 0 }}>
                <strong className="truncate" title={source.name}>{source.name}</strong>
                {probe?.format && (
                  <span className="badge badge-accent">{FORMATS[probe.format].label}</span>
                )}
                <span className="badge">{fmtSize(source.sizeBytes || probe?.fileSizeBytes)}</span>
                <span className="badge">.{extOf(source.name)}</span>
              </div>
              <div className="row" style={{ gap: 'var(--sp-2)', flex: 'none' }}>
                <button className="btn btn-sm" onClick={() => void pick()}>
                  {S.reselect}
                </button>
              </div>
            </div>

            {probe?.extensionMismatch && (
              <div className="callout warning mt-3">
                <IconWarning size={16} />
                <div>
                  <strong>{t('convert.mismatch')}</strong>
                  <div className="xs muted">
                    {S.mismatch(probe.extensionMismatch.declared, probe.extensionMismatch.actual)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 探测中 */}
          {probing && (
            <div className="card row" style={{ gap: 'var(--sp-3)' }}>
              <span className="spinner" />
              <span className="secondary">{t('analyze.analyzing')}</span>
            </div>
          )}

          {/* 探测失败 */}
          {error && !probing && (
            <div className="callout danger">
              <IconWarning size={16} />
              <div className="grow">
                <strong>{S.probeFailed}</strong>
                <div className="xs mono" style={{ wordBreak: 'break-all' }}>{error}</div>
                <button className="btn btn-sm mt-2" onClick={() => void runProbe(source)}>
                  {t('common.retry')}
                </button>
              </div>
            </div>
          )}

          {/* 真实探测结果 */}
          {probe && !probing && !error && (
            <>
              <section className="card">
                <div className="card-title">{t('analyze.fileInfo')}</div>
                <FileInfoTable probe={probe} fileName={source.name} />
              </section>

              {/* 元数据 */}
              <section className="card">
                <div className="card-title">{t('analyze.metadata')}</div>
                {Object.keys(probe.tags).length ? (
                  <dl className="kv">
                    {Object.entries(probe.tags).map(([k, v]) => (
                      <div key={k} style={{ display: 'contents' }}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <span className="muted small">{S.noTags}</span>
                )}
              </section>

              {/* 流信息 */}
              <section className="card">
                <div className="card-title">{t('analyze.streams')}</div>
                {probe.streamSummary.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {probe.streamSummary.map((line, i) => (
                      <li key={i} className="mono xs" style={{ color: 'var(--fg-2)', wordBreak: 'break-word' }}>
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="muted small">{S.noStreams}</span>
                )}
              </section>

              {/* 封面 */}
              <section className="card">
                <div className="card-title">{t('analyze.cover')}</div>
                {probe.coverArt ? (
                  <CoverArtView cover={probe.coverArt} alt={t('analyze.cover')} />
                ) : (
                  <span className="muted small">{t('analyze.noCover')}</span>
                )}
              </section>

              {/* 引擎 warnings */}
              {probe.warnings.length > 0 && (
                <section className="card">
                  <div className="card-title">{t('analyze.warnings')}</div>
                  <div className="col" style={{ gap: 'var(--sp-2)' }}>
                    {probe.warnings.map((w, i) => (
                      <div key={i} className="callout warning">
                        <IconWarning size={15} />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '--';
}

const ZH = {
  dropTitle: '拖入音频文件，或点击选择',
  dropSub: '单文件分析 · 编码 / 采样率 / 元数据 / 封面',
  reselect: '重新选择',
  probeFailed: '分析失败',
  mismatch: (declared: string, actual: string) =>
    `扩展名 .${declared} 与实际格式 ${actual} 不一致，已按实际格式处理`,
  noTags: '该文件没有元数据标签',
  noStreams: '没有附加流信息',
};

const EN: typeof ZH = {
  dropTitle: 'Drop an audio file here, or click to choose',
  dropSub: 'Single-file analysis · codec / sample rate / metadata / cover',
  reselect: 'Choose another',
  probeFailed: 'Analysis failed',
  mismatch: (declared: string, actual: string) =>
    `Extension .${declared} does not match actual format ${actual}; handled as actual format`,
  noTags: 'No metadata tags in this file',
  noStreams: 'No additional stream info',
};

export default AnalyzePage;
