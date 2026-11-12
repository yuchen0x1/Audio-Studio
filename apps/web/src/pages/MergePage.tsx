/**
 * 音频合并页：多文件排序 + 片段增益/淡入淡出 + 间隔静音 + 真实合并进度。
 */
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { EncodeParams, MergeJob, MergeItem } from '@audio-studio/shared';
import { defaultParamsFor, createTaskId, getFormat } from '@audio-studio/shared';
import { useI18n, useT } from '../i18n';
import { pickAudioFiles, deliverResult, isDesktop } from '../platform';
import { fmtDuration, fmtSize } from '../utils/format';
import { FormatSelect } from '../components/FormatSelect';
import { ParamPanel } from '../components/ParamPanel';
import { Modal } from '../components/Modal';
import { runAdhoc, cancelAdhoc, type AdhocTaskState } from '../engine/runAdhoc';
import { toast } from '../stores/toast';
import {
  IconUpload,
  IconMusic,
  IconClose,
  IconArrowUp,
  IconArrowDown,
  IconPlay,
  IconDownload,
  IconMerge,
} from '../components/Icons';

interface MergeRow extends MergeItem {
  durationMs?: number;
  probeError?: string;
}

export function MergePage() {
  const lang = useI18n((s) => s.lang);
  const zh = lang !== 'en';
  const t = useT();
  const gapId = useId();

  const [rows, setRows] = useState<MergeRow[]>([]);
  const [gapMs, setGapMs] = useState(0);
  const [params, setParams] = useState<EncodeParams>(() => defaultParamsFor('mp3'));
  const [task, setTask] = useState<AdhocTaskState | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const urlRef = useRef<Map<string, string>>(new Map());

  const addFiles = useCallback(async () => {
    const picked = await pickAudioFiles(true);
    if (!picked.length) return;

    // 真实探测每一段（时长来自引擎 probe，不猜测）
    const { getEngine, initEngine } = await import('../engine');
    try {
      await initEngine();
    } catch {
      /* probe 失败会在单行显示 */
    }
    const engine = getEngine();

    const newRows: MergeRow[] = [];
    for (const src of picked) {
      const row: MergeRow = { source: src, fadeInMs: 0, fadeOutMs: 0 };
      try {
        const probe = await engine.probe(src);
        row.durationMs = probe.durationMs;
      } catch (e) {
        row.probeError = e instanceof Error ? e.message : String(e);
      }
      newRows.push(row);
      // Web：准备试听 URL
      if (src.file && !urlRef.current.has(src.id)) {
        urlRef.current.set(src.id, URL.createObjectURL(src.file));
      }
    }
    setRows((r) => [...r, ...newRows]);
  }, []);

  const move = (idx: number, dir: -1 | 1) => {
    setRows((r) => {
      const j = idx + dir;
      if (j < 0 || j >= r.length) return r;
      const next = [...r];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const removeAt = (idx: number) => {
    setRows((r) => r.filter((_, i) => i !== idx));
  };

  const patchRow = (idx: number, patch: Partial<MergeRow>) => {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const totalMs = useMemo(
    () =>
      rows.reduce((sum, r) => sum + (r.durationMs ?? 0), 0) + Math.max(0, rows.length - 1) * gapMs,
    [rows, gapMs],
  );

  const playRow = (idx: number) => {
    const audio = audioRef.current;
    const row = rows[idx];
    if (!audio || !row) return;
    const url = urlRef.current.get(row.source.id);
    if (!url) {
      toast.warning(zh ? '该文件无法试听' : 'Preview unavailable');
      return;
    }
    if (playingIdx === idx) {
      audio.pause();
      setPlayingIdx(null);
      return;
    }
    audio.src = url;
    void audio.play().catch(() => undefined);
    setPlayingIdx(idx);
    audio.onended = () => setPlayingIdx(null);
  };

  const [busy, setBusy] = useState(false);
  const doMerge = async () => {
    if (rows.length < 2 || busy) return;
    if (rows.some((r) => r.probeError)) {
      toast.warning(zh ? '存在无法读取的文件' : 'Some files cannot be read');
      return;
    }

    const taskId = createTaskId();
    const def = getFormat(params.format)!;
    const job: MergeJob = {
      kind: 'merge',
      taskId,
      items: rows.map((r) => ({
        source: r.source,
        gainDb: r.gainDb,
        fadeInMs: r.fadeInMs,
        fadeOutMs: r.fadeOutMs,
      })),
      gapMs,
      params,
      outputFileName: `merged.${def.extensions[0]}`,
      outputDir: '',
    };

    setBusy(true);
    setTask({ id: taskId, status: 'queued', progress: { ratio: 0, processedMs: 0, totalMs: 0 } });
    const result = await runAdhoc({
      job,
      historyKind: 'merge',
      sourceLabel: rows.map((r) => r.source.name).join(' + '),
      onState: setTask,
    });
    setBusy(false);
    if (result) setShowResult(true);
  };

  const download = async () => {
    if (!task?.result) return;
    try {
      await deliverResult({
        fileName: task.result.fileName,
        data: task.result.data,
        outputPath: task.result.outputPath,
      });
      if (isDesktop) toast.success(zh ? '已保存' : 'Saved', task.result.outputPath);
    } catch (e) {
      toast.error(zh ? '下载失败' : 'Download failed', String(e));
    }
  };

  const running = task?.status === 'running' || task?.status === 'preparing';

  return (
    <div className="page-container wide">
      {/* 头部操作 */}
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
        <div className="row" style={{ gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => void addFiles()}>
            <IconUpload size={15} /> {zh ? '添加文件' : 'Add files'}
          </button>
          <span className="xs muted">
            {zh ? '按顺序合并 · 拖动或按钮调整顺序' : 'Joined in order · reorder with buttons'}
          </span>
        </div>
        <div className="row" style={{ gap: 'var(--sp-3)' }}>
          <span className="badge">
            {rows.length} {zh ? '段' : 'items'}
          </span>
          <span className="badge badge-accent mono">{fmtDuration(totalMs)}</span>
        </div>
      </div>

      {/* 列表 */}
      {rows.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <IconMerge size={26} />
          </div>
          <div className="empty-title">
            {zh ? '添加至少两个音频文件' : 'Add at least two audio files'}
          </div>
          <div className="empty-desc">
            {zh
              ? '支持 MP3 / WAV / FLAC 等 13 种格式混合合并'
              : 'Mix MP3 / WAV / FLAC and 10 more formats'}
          </div>
        </div>
      ) : (
        <div className="col" style={{ gap: 'var(--sp-2)' }}>
          {rows.map((row, i) => (
            <div key={`${row.source.id}-${i}`} className="file-row" style={{ flexWrap: 'wrap' }}>
              <span className="badge mono" style={{ flex: 'none' }}>
                {i + 1}
              </span>
              <div className="file-icon">
                <IconMusic size={17} />
              </div>
              <div className="grow" style={{ minWidth: 160 }}>
                <div className="truncate bold small">{row.source.name}</div>
                <div className="file-meta">
                  {row.probeError ? (
                    <span style={{ color: 'var(--danger)' }}>{row.probeError}</span>
                  ) : row.durationMs !== undefined ? (
                    <span className="mono">{fmtDuration(row.durationMs)}</span>
                  ) : (
                    <span style={{ color: 'var(--accent)' }}>{zh ? '分析中…' : 'Analyzing…'}</span>
                  )}
                </div>
              </div>

              {/* 片段参数 */}
              <div className="row" style={{ gap: 'var(--sp-2)', flex: 'none', flexWrap: 'wrap' }}>
                <label className="xs muted" title={zh ? '片段音量 (dB)' : 'Clip gain (dB)'}>
                  {zh ? '音量' : 'Gain'}
                  <input
                    className="input mono"
                    style={{ width: 64, height: 26, marginLeft: 4 }}
                    type="number"
                    min={-60}
                    max={20}
                    value={row.gainDb ?? 0}
                    onChange={(e) => patchRow(i, { gainDb: Number(e.target.value) })}
                  />
                </label>
                <label className="xs muted" title={zh ? '淡入 (ms)' : 'Fade in (ms)'}>
                  {zh ? '淡入' : 'In'}
                  <input
                    className="input mono"
                    style={{ width: 64, height: 26, marginLeft: 4 }}
                    type="number"
                    min={0}
                    value={row.fadeInMs ?? 0}
                    onChange={(e) =>
                      patchRow(i, { fadeInMs: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </label>
                <label className="xs muted" title={zh ? '淡出 (ms)' : 'Fade out (ms)'}>
                  {zh ? '淡出' : 'Out'}
                  <input
                    className="input mono"
                    style={{ width: 64, height: 26, marginLeft: 4 }}
                    type="number"
                    min={0}
                    value={row.fadeOutMs ?? 0}
                    onChange={(e) =>
                      patchRow(i, { fadeOutMs: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </label>
              </div>

              {/* 操作 */}
              <div className="row" style={{ gap: 2, flex: 'none' }}>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  title={zh ? '试听' : 'Preview'}
                  aria-label={t('common.preview')}
                  aria-pressed={playingIdx === i}
                  onClick={() => playRow(i)}
                  disabled={!!row.probeError}
                >
                  {playingIdx === i ? (
                    <IconPlay size={13} style={{ color: 'var(--accent)' }} />
                  ) : (
                    <IconPlay size={13} />
                  )}
                </button>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  title={zh ? '上移' : 'Move up'}
                  aria-label={t('merge.moveUp')}
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                >
                  <IconArrowUp size={13} />
                </button>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  title={zh ? '下移' : 'Move down'}
                  aria-label={t('merge.moveDown')}
                  onClick={() => move(i, 1)}
                  disabled={i === rows.length - 1}
                >
                  <IconArrowDown size={13} />
                </button>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  title={zh ? '移除' : 'Remove'}
                  aria-label={t('merge.removeItem')}
                  onClick={() => removeAt(i)}
                  disabled={running}
                >
                  <IconClose size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 合并选项 + 参数 */}
      {rows.length > 0 && (
        <div className="grid-2" style={{ gridTemplateColumns: '1fr 340px', alignItems: 'start' }}>
          <div className="card">
            <div className="card-title">{zh ? '合并设置' : 'Merge settings'}</div>
            <div className="grid-2">
              <div className="field">
                <label className="field-label" htmlFor={gapId}>
                  {zh ? '片段间隔 (ms)' : 'Gap between clips (ms)'}
                  <span className="xs muted mono">{gapMs}</span>
                </label>
                <input
                  className="range"
                  type="range"
                  id={gapId}
                  min={0}
                  max={5000}
                  step={100}
                  value={gapMs}
                  onChange={(e) => setGapMs(Number(e.target.value))}
                />
                <span className="field-hint">
                  {zh ? '每个片段之间插入静音' : 'Silence inserted between clips'}
                </span>
              </div>
              <div className="field">
                <span className="field-label">{zh ? '输出格式' : 'Output format'}</span>
                <FormatSelect
                  value={params.format}
                  onChange={(f) => {
                    const next = defaultParamsFor(f);
                    next.filenameTemplate = params.filenameTemplate;
                    setParams(next);
                  }}
                />
              </div>
            </div>
            <hr className="divider" />
            <ParamPanel
              params={params}
              onChange={(patch) => setParams((p) => ({ ...p, ...patch }))}
              showNaming={false}
            />
          </div>

          {/* 执行面板 */}
          <div className="card">
            <div className="card-title">{zh ? '执行' : 'Execute'}</div>
            <div className="col" style={{ gap: 'var(--sp-3)' }}>
              <div className="kv xs">
                <dt>{zh ? '片段' : 'Clips'}</dt>
                <dd>{rows.length}</dd>
                <dt>{zh ? '预计总长' : 'Est. duration'}</dt>
                <dd className="mono">{fmtDuration(totalMs)}</dd>
              </div>

              {task && (
                <div className="col" style={{ gap: 'var(--sp-2)' }}>
                  <div className="row-between xs">
                    <span className="muted">
                      {task.status === 'running'
                        ? zh
                          ? '合并中…'
                          : 'Merging…'
                        : task.status === 'completed'
                          ? zh
                            ? '完成'
                            : 'Done'
                          : task.status === 'failed'
                            ? zh
                              ? '失败'
                              : 'Failed'
                            : task.status === 'cancelled'
                              ? zh
                                ? '已取消'
                                : 'Cancelled'
                              : zh
                                ? '准备中…'
                                : 'Preparing…'}
                    </span>
                    <span className="mono">{Math.round(task.progress.ratio * 100)}%</span>
                  </div>
                </div>
              )}
              {task && (
                <div
                  className={`progress${task.status === 'completed' ? ' progress-success' : task.status === 'failed' ? ' progress-danger' : ''}`}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(task.progress.ratio * 100)}
                  aria-label={t('convert.progress')}
                >
                  <div className="bar" style={{ width: `${task.progress.ratio * 100}%` }} />
                </div>
              )}
              {task?.error && (
                <div className="xs" style={{ color: 'var(--danger)' }}>
                  {task.error.message}
                </div>
              )}

              <button
                className="btn btn-primary btn-block btn-lg"
                onClick={() => void doMerge()}
                disabled={rows.length < 2 || busy || !!running}
              >
                <IconMerge size={16} />
                {running ? (zh ? '合并中…' : 'Merging…') : zh ? '开始合并' : 'Start merge'}
              </button>

              {running && (
                <button
                  className="btn btn-danger btn-block"
                  onClick={() => void cancelAdhoc(task!.id)}
                >
                  {zh ? '取消' : 'Cancel'}
                </button>
              )}

              {task?.result && (
                <button className="btn btn-success btn-block" onClick={() => void download()}>
                  <IconDownload size={15} /> {zh ? '下载结果' : 'Download'} ·{' '}
                  {fmtSize(task.result.sizeBytes)}
                </button>
              )}

              {rows.length < 2 && (
                <div className="xs muted" style={{ textAlign: 'center' }}>
                  {zh ? '至少需要两个文件' : 'At least two files required'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <audio ref={audioRef} preload="auto" />

      <Modal
        open={showResult && !!task?.result}
        title={zh ? '合并完成' : 'Merge finished'}
        onClose={() => setShowResult(false)}
        footer={
          <>
            <button className="btn" onClick={() => setShowResult(false)}>
              {zh ? '关闭' : 'Close'}
            </button>
            <button className="btn btn-primary" onClick={() => void download()}>
              <IconDownload size={14} /> {zh ? '下载' : 'Download'}
            </button>
          </>
        }
      >
        {task?.result && (
          <div className="kv">
            <dt>{zh ? '文件' : 'File'}</dt>
            <dd className="mono">{task.result.fileName}</dd>
            <dt>{zh ? '大小' : 'Size'}</dt>
            <dd className="mono">{fmtSize(task.result.sizeBytes)}</dd>
            <dt>{zh ? '时长' : 'Duration'}</dt>
            <dd className="mono">{fmtDuration(task.result.outputProbe?.durationMs)}</dd>
            {task.result.outputPath && (
              <>
                <dt>{zh ? '位置' : 'Path'}</dt>
                <dd className="mono xs">{task.result.outputPath}</dd>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
