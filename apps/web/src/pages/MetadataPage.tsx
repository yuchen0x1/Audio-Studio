/**
 * 元数据编辑页：probe → 表单 → 「另存为…」真实写入标签（源文件永不修改）。
 *
 * Web：loadFfmpeg() 直接 writeFile → exec(带 -metadata) → readFile → deliverResult 下载。
 * 桌面：invoke('start_task', { taskId, args, outputPath })，监听 task://done / task://error，
 *       完成后 revealOutput。桌面端无法写入临时封面文件，故上传封面在桌面禁用（保留/移除原封面可用）。
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { AudioSource, FormatId, ProbeResult } from '@audio-studio/shared';
import { FORMATS, buildOutputFileName } from '@audio-studio/shared';
import { useI18n, useT } from '../i18n';
import { initEngine, getEngine } from '../engine';
import { loadFfmpeg } from '../engine/loadFfmpeg';
import { pickAudioFiles, isDesktop, deliverResult, revealOutput, baseName } from '../platform';
import { useSettings } from '../stores/settings';
import { toast } from '../stores/toast';
import { Dropzone } from '../components/Dropzone';
import { CoverArtView } from '../components/CoverArtView';
import { FileInfoTable } from '../components/FileInfoTable';
import { IconWarning, IconUpload, IconTrash, IconCheck } from '../components/Icons';

type CoverState =
  | { kind: 'none' }
  | { kind: 'original' }
  | { kind: 'custom'; dataUrl: string; bytes: Uint8Array; mime: string };

interface FormState {
  title: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
  track: string;
  comment: string;
}

const EMPTY_FORM: FormState = {
  title: '', artist: '', album: '', year: '', genre: '', track: '', comment: '',
};

interface PickState {
  source: AudioSource | null;
  probe: ProbeResult | null;
  probing: boolean;
  error: string | null;
}

export function MetadataPage() {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const S = lang === 'en' ? EN : ZH;

  const [pick, setPick] = useState<PickState>({ source: null, probe: null, probing: false, error: null });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [cover, setCover] = useState<CoverState>({ kind: 'none' });
  const [saving, setSaving] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const reqSeq = useRef(0);

  const { source, probe, probing, error } = pick;
  const format: FormatId | null = probe?.format ?? null;
  const def = format ? FORMATS[format] : null;
  const tagSystem = def?.tagSystem ?? 'none';
  const editable = !!def && tagSystem !== 'none';

  const runProbe = useCallback(async (src: AudioSource) => {
    const seq = ++reqSeq.current;
    setPick({ source: src, probe: null, probing: true, error: null });
    setForm(EMPTY_FORM);
    setCover({ kind: 'none' });
    try {
      await initEngine();
      const pr = await getEngine().probe(src);
      if (seq !== reqSeq.current) return;
      setPick({ source: src, probe: pr, probing: false, error: null });
      setForm(formFromTags(pr.tags));
      setCover(pr.coverArt ? { kind: 'original' } : { kind: 'none' });
    } catch (e) {
      if (seq !== reqSeq.current) return;
      setPick({
        source: src, probe: null, probing: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const onFiles = useCallback((sources: AudioSource[]) => {
    if (sources[0]) void runProbe(sources[0]);
  }, [runProbe]);

  const pickFile = useCallback(async () => {
    const sources = await pickAudioFiles(false);
    if (sources[0]) void runProbe(sources[0]);
  }, [runProbe]);

  // 输出文件名预览（与保存逻辑同源）
  const outName = useMemo(() => {
    if (!source || !def) return '';
    return buildOutputFileName('{name}_meta', {
      sourceName: baseName(source.name).replace(/\.[^.]+$/, ''),
      format: def,
      index: 1,
      tags: probe?.tags,
    });
  }, [source, def, probe]);

  const set = (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const onCoverFile = useCallback((file: File) => {
    if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
      toast.warning(S.badCoverType, S.badCoverTypeHint);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      const bytes = dataUrlToBytes(dataUrl);
      if (!bytes) {
        toast.error(S.badCoverType, S.badCoverTypeHint);
        return;
      }
      setCover({ kind: 'custom', dataUrl, bytes, mime: file.type });
    };
    reader.onerror = () => toast.error(S.badCoverType, S.badCoverTypeHint);
    reader.readAsDataURL(file);
  }, [S]);

  const save = useCallback(async () => {
    if (!source || !probe || !def || !editable || saving) return;
    if (!probe.format) return;

    const pairs: Array<[string, string]> = [];
    const add = (k: string, v: string) => {
      const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
      if (s) pairs.push([k, s]);
    };
    add('title', form.title);
    add('artist', form.artist);
    add('album', form.album);
    add('date', form.year);
    add('genre', form.genre);
    add('track', form.track);
    add('comment', form.comment);

    // 格式不支持封面 → 忽略封面并提示（不阻断标签写入）
    let effectiveCover = cover;
    if (cover.kind !== 'none' && !def.coverArt) {
      toast.warning(S.coverIgnored, S.coverIgnoredHint(def.label));
      effectiveCover = { kind: 'none' };
    }

    setSaving(true);
    try {
      if (isDesktop) {
        await saveDesktop({ source, outName, pairs, cover: effectiveCover, def });
        toast.success(t('meta.saved'), outName);
        return;
      }
      await saveWeb({ source, outName, pairs, cover: effectiveCover, def });
      toast.success(t('meta.saved'), outName);
    } catch (e) {
      toast.error(S.saveFailed, e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [source, probe, def, editable, saving, form, cover, outName, t, S]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('meta.title')}</h1>
          <p className="page-desc">{t('meta.desc')}</p>
        </div>
        <button className="btn btn-primary" onClick={() => void pickFile()}>
          {t('analyze.pick')}
        </button>
      </div>

      {!source && (
        <Dropzone onFiles={onFiles} multiple={false} title={S.dropTitle} sub={S.dropSub} />
      )}

      {source && (
        <div className="col">
          {/* 文件卡片 + 标签体系徽章 */}
          <div className="card">
            <div className="row-between" style={{ flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
              <div className="row" style={{ minWidth: 0 }}>
                <strong className="truncate" title={source.name}>{source.name}</strong>
                {def && <span className="badge badge-accent">{def.label}</span>}
                <span className="badge">
                  {t('meta.tagSystem')}: <b style={{ marginLeft: 4 }}>{tagSystem}</b>
                </span>
              </div>
              <button className="btn btn-sm" onClick={() => void pickFile()}>
                {S.reselect}
              </button>
            </div>
          </div>

          {probing && (
            <div className="card row" style={{ gap: 'var(--sp-3)' }}>
              <span className="spinner" />
              <span className="secondary">{t('convert.probing')}</span>
            </div>
          )}

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

          {probe && !probing && !error && (
            <>
              {!editable && (
                <div className="callout warning">
                  <IconWarning size={16} />
                  <span>
                    {def ? t('meta.notSupported') : S.unknownFormat}
                  </span>
                </div>
              )}

              {/* 源文件信息 */}
              <section className="card">
                <div className="card-title">{t('analyze.fileInfo')}</div>
                <FileInfoTable probe={probe} fileName={source.name} />
              </section>

              {/* 标签表单 */}
              <section className="card">
                <div className="card-title">{t('meta.title')}</div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: 'var(--sp-4)',
                  }}
                >
                  <Field label={t('meta.titleField')}>
                    <input className="input" value={form.title} disabled={!editable || saving} onChange={set('title')} />
                  </Field>
                  <Field label={t('meta.artist')}>
                    <input className="input" value={form.artist} disabled={!editable || saving} onChange={set('artist')} />
                  </Field>
                  <Field label={t('meta.album')}>
                    <input className="input" value={form.album} disabled={!editable || saving} onChange={set('album')} />
                  </Field>
                  <Field label={t('meta.year')}>
                    <input className="input" value={form.year} disabled={!editable || saving} onChange={set('year')} placeholder="2024" />
                  </Field>
                  <Field label={t('meta.genre')}>
                    <input className="input" value={form.genre} disabled={!editable || saving} onChange={set('genre')} />
                  </Field>
                  <Field label={t('meta.track')}>
                    <input className="input" value={form.track} disabled={!editable || saving} onChange={set('track')} placeholder="1/12" />
                  </Field>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Field label={t('meta.comment')}>
                      <textarea
                        className="textarea"
                        rows={3}
                        value={form.comment}
                        disabled={!editable || saving}
                        onChange={set('comment')}
                      />
                    </Field>
                  </div>
                </div>
              </section>

              {/* 封面 */}
              <section className="card">
                <div className="card-title">{t('meta.cover')}</div>
                <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-start', gap: 'var(--sp-4)' }}>
                  <div className="row" style={{ gap: 'var(--sp-3)', alignItems: 'flex-start' }}>
                    {cover.kind === 'custom' && (
                      <CoverArtView src={cover.dataUrl} alt={t('meta.cover')} />
                    )}
                    {cover.kind === 'original' && probe.coverArt && (
                      <CoverArtView cover={probe.coverArt} alt={t('meta.cover')} />
                    )}
                    {(cover.kind === 'none' || (!probe.coverArt && cover.kind === 'original')) && (
                      <span className="muted small">{t('analyze.noCover')}</span>
                    )}
                  </div>

                  <div className="col" style={{ gap: 'var(--sp-2)' }}>
                    <div className="row" style={{ gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-sm"
                        disabled={!editable || saving || isDesktop}
                        title={isDesktop ? S.desktopNoUpload : undefined}
                        onClick={() => coverInputRef.current?.click()}
                      >
                        <IconUpload size={14} />
                        {t('meta.uploadCover')}
                      </button>
                      {cover.kind !== 'none' && (
                        <button
                          className="btn btn-sm"
                          disabled={!editable || saving}
                          onClick={() => setCover({ kind: 'none' })}
                        >
                          <IconTrash size={14} />
                          {t('meta.removeCover')}
                        </button>
                      )}
                      {cover.kind === 'none' && probe.coverArt && (
                        <button
                          className="btn btn-sm"
                          disabled={!editable || saving}
                          onClick={() => setCover({ kind: 'original' })}
                        >
                          <IconCheck size={14} />
                          {t('meta.copyFrom')}
                        </button>
                      )}
                    </div>
                    <span className="field-hint">
                      {t('meta.coverFormat')}
                      {isDesktop && ` · ${S.desktopNoUpload}`}
                    </span>
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/jpeg,image/png"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onCoverFile(f);
                        e.target.value = '';
                      }}
                    />
                  </div>
                </div>
              </section>

              {/* 另存为 */}
              <section className="card">
                <div className="row-between" style={{ flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="xs muted">{t('convert.outputFile')}</div>
                    <div className="mono truncate" title={outName}>{outName}</div>
                  </div>
                  <button
                    className="btn btn-primary"
                    disabled={!editable || saving || !outName}
                    onClick={() => void save()}
                  >
                    {saving && <span className="spinner" />}
                    {saving ? S.saving : t('meta.saveAs')}
                  </button>
                </div>
                {!editable && (
                  <div className="field-hint mt-2">{t('meta.notSupported')}</div>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="field-label"><span>{label}</span></label>
      {children}
    </div>
  );
}

/** 从 probe.tags 初始化表单（兼容大小写键） */
function formFromTags(tags: Record<string, string>): FormState {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags)) lower[k.toLowerCase()] = v;
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      const v = lower[k];
      if (v !== undefined && v !== '') return v;
    }
    return '';
  };
  const date = get('date', 'year', 'created');
  return {
    title: get('title'),
    artist: get('artist', 'album_artist', 'albumartist'),
    album: get('album'),
    year: /^\d{4}/.exec(date)?.[0] ?? '',
    genre: get('genre'),
    track: get('track', 'tracknumber', 'track_number'),
    comment: get('comment', 'description'),
  };
}

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const m = /^data:[^;,]*;base64,(.*)$/.exec(dataUrl);
  if (!m) return null;
  try {
    const bin = atob(m[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  } catch {
    return null;
  }
}

interface SaveCtx {
  source: AudioSource;
  outName: string;
  pairs: Array<[string, string]>;
  cover: CoverState;
  def: (typeof FORMATS)[FormatId];
}

/** 拼装 ffmpeg 参数（封面分支与规格一致） */
function buildMetaArgs(ctx: SaveCtx, inName: string, coverName: string | null): string[] {
  const args = ['-hide_banner', '-nostdin', '-y', '-i', inName];
  if (ctx.cover.kind === 'custom' && coverName) {
    // 用户上传的封面作为第二输入
    args.push(
      '-i', coverName,
      '-map', '1', '-map', '0:a', '-c', 'copy',
      '-disposition:v:0', 'attached_pic',
    );
  } else if (ctx.cover.kind !== 'none') {
    // 保留原封面流（cover.kind==='original' 时 probe.coverArt 必然存在，视频流确定存在）
    args.push(
      '-map', '0:a:0', '-map', '0:v:0',
      '-c', 'copy',
      '-disposition:v:0', 'attached_pic',
    );
  } else {
    args.push('-map', '0:a:0', '-vn', '-c:a', 'copy');
  }
  for (const [k, v] of ctx.pairs) args.push('-metadata', `${k}=${v}`);
  if (ctx.def.muxer) args.push('-f', ctx.def.muxer);
  return args;
}

/** Web：ffmpeg.wasm 虚拟文件系统内完成写标签，产物直接下载 */
async function saveWeb(ctx: SaveCtx): Promise<void> {
  if (!ctx.source.file) throw new Error('浏览器需要 File 对象');
  const ff = await loadFfmpeg();
  const stamp = Date.now().toString(36);
  const srcExt = /\.([a-z0-9]+)$/i.exec(ctx.source.name)?.[1]?.toLowerCase() ?? 'bin';
  const inName = `meta_in_${stamp}.${srcExt}`;
  const written: string[] = [];
  const logs: string[] = [];
  const onLog = ({ message }: { message: string }) => { logs.push(message); };

  try {
    const bytes = new Uint8Array(await ctx.source.file.arrayBuffer());
    await ff.writeFile(inName, bytes);
    written.push(inName);

    let coverName: string | null = null;
    if (ctx.cover.kind === 'custom' && ctx.def.coverArt) {
      coverName = `meta_cover_${stamp}.${ctx.cover.mime === 'image/png' ? 'png' : 'jpg'}`;
      await ff.writeFile(coverName, ctx.cover.bytes);
      written.push(coverName);
    }

    const args = buildMetaArgs(ctx, inName, coverName);
    args.push(ctx.outName);
    written.push(ctx.outName);

    ff.on('log', onLog);
    let code = 0;
    try {
      code = await ff.exec(args);
    } finally {
      ff.off('log', onLog);
    }
    if (code !== 0) {
      throw new Error(logs.slice(-8).join('\n') || `ffmpeg exit ${code}`);
    }

    const out = await ff.readFile(ctx.outName);
    const data = typeof out === 'string' ? strToBytes(out) : out;
    if (!data.length) throw new Error('输出文件为空');
    await deliverResult({ fileName: ctx.outName, data });
  } finally {
    for (const f of written) {
      try { await ff.deleteFile(f); } catch { /* 清理失败不阻断 */ }
    }
  }
}

/** 桌面：start_task 真实执行，等待 task://done / task://error */
async function saveDesktop(ctx: SaveCtx): Promise<void> {
  if (!ctx.source.path) throw new Error('缺少源文件路径');
  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');

  const taskId = `meta_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const dir = useSettings.getState().outputDirName || '';
  const outPath = dir ? `${dir}/${ctx.outName}` : ctx.outName;

  const args = buildMetaArgs(ctx, ctx.source.path, null);
  args.push(outPath);

  // 监听解绑函数放进数组：赋值发生在 async 闭包内，用局部变量会被 TS 控制流窄化为 null
  const unsubs: Array<() => void> = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const result = await new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        fn();
      };
      timer = setTimeout(
        () => finish(() => reject(new Error(S_TIMEOUT))),
        10 * 60 * 1000,
      );

      // 先注册完两个监听再启动任务，避免 done 事件早于监听就绪
      void (async () => {
        const [u1, u2] = await Promise.all([
          listen<{ taskId: string; outputPath: string }>('task://done', (e) => {
            if (e.payload.taskId !== taskId) return;
            finish(() => resolve(e.payload.outputPath || outPath));
          }),
          listen<{ taskId: string; message?: string }>('task://error', (e) => {
            if (e.payload.taskId !== taskId) return;
            finish(() => reject(new Error(e.payload.message || '任务失败')));
          }),
        ]);
        unsubs.push(u1, u2);
        if (settled) { u1(); u2(); return; }
        await invoke('start_task', { taskId, args, outputPath: outPath, notify: true });
      })().catch((err) => finish(() => reject(
        err instanceof Error ? err : new Error(String(err)),
      )));
    });

    void revealOutput(result).catch(() => undefined);
  } finally {
    for (const off of unsubs) {
      try { off(); } catch { /* ignore */ }
    }
    if (timer) clearTimeout(timer);
  }
}

const S_TIMEOUT = '处理超时（10 分钟），请重试';

function strToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

const ZH = {
  dropTitle: '拖入音频文件，或点击选择',
  dropSub: '编辑标签并另存为新文件，不修改源文件',
  reselect: '重新选择',
  probeFailed: '分析失败',
  unknownFormat: '无法识别文件格式，无法编辑标签',
  saving: '写入中…',
  saveFailed: '写入失败',
  badCoverType: '封面格式不支持',
  badCoverTypeHint: '请选择 JPEG 或 PNG 图片',
  coverIgnored: '封面已忽略',
  coverIgnoredHint: (label: string) => `${label} 格式不支持内嵌封面，本次仅写入文字标签`,
  desktopNoUpload: '桌面版暂不支持上传封面（可保留或移除原封面）',
};

const EN: typeof ZH = {
  dropTitle: 'Drop an audio file here, or click to choose',
  dropSub: 'Edit tags and save as a new file — source is never modified',
  reselect: 'Choose another',
  probeFailed: 'Analysis failed',
  unknownFormat: 'Cannot recognize the file format; tags are unavailable',
  saving: 'Writing…',
  saveFailed: 'Write failed',
  badCoverType: 'Unsupported cover type',
  badCoverTypeHint: 'Please choose a JPEG or PNG image',
  coverIgnored: 'Cover ignored',
  coverIgnoredHint: (label: string) =>
    `${label} does not support embedded covers; only text tags were written`,
  desktopNoUpload: 'Desktop cannot upload covers yet (original cover can be kept or removed)',
};

export default MetadataPage;
