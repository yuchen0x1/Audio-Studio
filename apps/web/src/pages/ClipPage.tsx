/**
 * 音频剪辑页：波形可视化 + 选区 + 分割点 + 淡入淡出 + 导出。
 * 波形来自真实解码（decodeAudioData），导出走引擎 TrimJob（真实进度）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EncodeParams, AudioSource, TrimJob } from '@audio-studio/shared';
import { defaultParamsFor, createTaskId, getFormat } from '@audio-studio/shared';
import { useI18n } from '../i18n';
import { pickAudioFiles, deliverResult, isDesktop } from '../platform';
import { drawWaveform, peaksFromBuffer } from '../audio/waveform';
import { fmtDurationMs, parseTimeInput, fmtSize } from '../utils/format';
import { ParamPanel } from '../components/ParamPanel';
import { FormatSelect } from '../components/FormatSelect';
import { Modal } from '../components/Modal';
import { runAdhoc, cancelAdhoc, type AdhocTaskState } from '../engine/runAdhoc';
import { toast } from '../stores/toast';
import {
  IconUpload, IconPlay, IconStop, IconScissors, IconClose, IconDownload,
  IconTrash,
} from '../components/Icons';

type Tool = 'select' | 'split';

export function ClipPage() {
  const lang = useI18n((s) => s.lang);
  const zh = lang !== 'en';

  const [source, setSource] = useState<AudioSource | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [loading, setLoading] = useState(false);

  const [selStart, setSelStart] = useState(0);   // ms
  const [selEnd, setSelEnd] = useState(0);
  const [splits, setSplits] = useState<number[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [playhead, setPlayhead] = useState(0);   // ms

  const [params, setParams] = useState<EncodeParams>(() => defaultParamsFor('mp3'));
  const [task, setTask] = useState<AdhocTaskState | null>(null);
  const [showResult, setShowResult] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const dragRef = useRef<{ startMs: number; moved: boolean } | null>(null);
  const rafRef = useRef(0);

  const durationMs = audioBuffer ? Math.round(audioBuffer.duration * 1000) : 0;

  /* ---------- 加载 ---------- */
  const loadFile = useCallback(async (src: AudioSource) => {
    setLoading(true);
    try {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
      setSource(src);
      setSplits([]);
      setTask(null);

      const buf = await src.file!.arrayBuffer();
      const ctx = new AudioContext();
      let decoded: AudioBuffer;
      try {
        decoded = await ctx.decodeAudioData(buf);
      } finally {
        void ctx.close().catch(() => undefined);
      }
      setAudioBuffer(decoded);
      const width = wrapRef.current?.clientWidth ?? 800;
      const res = peaksFromBuffer(decoded, Math.max(200, Math.min(2048, Math.round(width * 2))));
      setPeaks(res.peaks);
      setSelStart(0);
      setSelEnd(res.durationMs);
      setPlayhead(0);
      objectUrlRef.current = URL.createObjectURL(src.file!);
      toast.success(zh ? '已加载' : 'Loaded', src.name);
    } catch (e) {
      toast.error(zh ? '解码失败' : 'Decode failed', e instanceof Error ? e.message : String(e));
      setSource(null);
      setAudioBuffer(null);
      setPeaks(null);
    } finally {
      setLoading(false);
    }
  }, [zh]);

  const pick = useCallback(async () => {
    const list = await pickAudioFiles(false);
    if (list.length) await loadFile(list[0]);
  }, [loadFile]);

  /* ---------- 绘制 ---------- */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || !durationMs) return;
    const selection: [number, number] | null = durationMs
      ? [selStart / durationMs, selEnd / durationMs]
      : null;
    drawWaveform(canvas, peaks, {
      progress: durationMs ? playhead / durationMs : 0,
      selection,
      selectionColor: 'hsla(217, 95%, 62%, 0.16)',
      playedColor: 'hsl(217, 95%, 62%)',
    });
    // 分割点竖线
    const ctx = canvas.getContext('2d');
    if (ctx && splits.length) {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = canvas.clientWidth;
      ctx.strokeStyle = 'rgba(255, 169, 64, 0.9)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      for (const s of splits) {
        const x = (s / durationMs) * w;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.clientHeight); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }, [peaks, durationMs, selStart, selEnd, playhead, splits]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  /* ---------- 播放（选区试听） ---------- */
  const playSelection = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !objectUrlRef.current || !durationMs) return;
    if (audio.src !== objectUrlRef.current) {
      audio.src = objectUrlRef.current;
    }
    audio.currentTime = selStart / 1000;
    void audio.play().catch(() => undefined);

    const stop = () => {
      if (audio.currentTime * 1000 >= selEnd) {
        audio.pause();
        cancelAnimationFrame(rafRef.current);
      } else {
        setPlayhead(audio.currentTime * 1000);
        rafRef.current = requestAnimationFrame(stop);
      }
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(stop);
  }, [selStart, selEnd, durationMs]);

  const stopPlay = useCallback(() => {
    const audio = audioRef.current;
    audio?.pause();
    cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  /* ---------- 波形交互 ---------- */
  const msAt = (clientX: number): number => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * durationMs);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!durationMs) return;
    const ms = msAt(e.clientX);
    if (tool === 'split') {
      if (ms > 0 && ms < durationMs && !splits.includes(ms)) {
        setSplits((s) => [...s, ms].sort((a, b) => a - b));
      }
      return;
    }
    dragRef.current = { startMs: ms, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!durationMs) return;
    if (dragRef.current) {
      const ms = msAt(e.clientX);
      if (Math.abs(ms - dragRef.current.startMs) > 30) dragRef.current.moved = true;
      if (dragRef.current.moved) {
        setSelStart(Math.min(dragRef.current.startMs, ms));
        setSelEnd(Math.max(dragRef.current.startMs, ms));
      }
      setPlayhead(ms);
    } else {
      setPlayhead(msAt(e.clientX));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!durationMs) return;
    if (dragRef.current && !dragRef.current.moved) {
      // 单击：设置播放头
      setPlayhead(msAt(e.clientX));
    }
    dragRef.current = null;
  };

  /* ---------- 时间输入 ---------- */
  const commitTime = (raw: string, which: 'start' | 'end') => {
    const ms = parseTimeInput(raw);
    if (ms === null) { draw(); return; }
    const clamped = Math.max(0, Math.min(durationMs, ms));
    if (which === 'start') setSelStart(Math.min(clamped, selEnd - 1));
    else setSelEnd(Math.max(clamped, selStart + 1));
  };

  /* ---------- 导出 ---------- */
  const [exportMode, setExportMode] = useState<'selection' | 'segments'>('selection');
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    if (!source || !durationMs || busy) return;
    if (selEnd <= selStart) { toast.warning(zh ? '选区为空' : 'Empty selection'); return; }

    const taskId = createTaskId();
    const base = source.name.replace(/\.[^.]+$/, '');
    const def = getFormat(params.format)!;
    const job: TrimJob = {
      kind: 'trim',
      taskId,
      source,
      startMs: selStart,
      endMs: selEnd,
      splitPointsMs: exportMode === 'segments' ? splits : undefined,
      exportSegments: exportMode === 'segments' && splits.length > 0,
      params,
      outputFileName: `${base}_clip.${def.extensions[0]}`,
      outputDir: '',
    };

    setBusy(true);
    setTask({ id: taskId, status: 'queued', progress: { ratio: 0, processedMs: 0, totalMs: 0 } });
    const result = await runAdhoc({
      job,
      historyKind: 'trim',
      sourceLabel: source.name,
      sourceFormat: source.name.split('.').pop()?.toUpperCase(),
      onState: setTask,
    });
    setBusy(false);
    if (result) setShowResult(true);
  };

  const download = async () => {
    if (!task?.result) return;
    try {
      await deliverResult({ fileName: task.result.fileName, data: task.result.data, outputPath: task.result.outputPath });
      if (isDesktop) toast.success(zh ? '已保存' : 'Saved', task.result.outputPath);
    } catch (e) {
      toast.error(zh ? '下载失败' : 'Download failed', String(e));
    }
  };

  const hasSelection = selEnd > selStart && durationMs > 0;
  const segCount = splits.length + 1;

  return (
    <div className="page-container wide">
      {/* 工具栏 */}
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
        <div className="row" style={{ gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => void pick()}>
            <IconUpload size={15} /> {source ? (zh ? '更换音频' : 'Change file') : (zh ? '加载音频' : 'Load audio')}
          </button>
          {source && (
            <span className="badge badge-accent truncate" style={{ maxWidth: 260 }} title={source.name}>
              {source.name}
            </span>
          )}
        </div>

        {source && (
          <div className="row" style={{ gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
            <div className="segmented">
              <button className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')}>
                {zh ? '选区' : 'Select'}
              </button>
              <button className={tool === 'split' ? 'active' : ''} onClick={() => setTool('split')}>
                {zh ? '分割点' : 'Split'}
              </button>
            </div>
            <button className="btn btn-sm btn-icon" title={zh ? '清除分割点' : 'Clear splits'} onClick={() => setSplits([])} disabled={!splits.length}>
              <IconTrash size={14} />
            </button>
          </div>
        )}
      </div>

      {/* 波形 */}
      <div
        className="wave-canvas-wrap"
        ref={wrapRef}
        style={{ height: 220, opacity: loading ? 0.5 : 1 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <canvas ref={canvasRef} />
        {!source && (
          <div className="empty" style={{ position: 'absolute', inset: 0, padding: 'var(--sp-6)' }}>
            <div className="empty-icon"><IconScissors size={24} /></div>
            <div className="empty-title">{zh ? '加载一个音频文件开始剪辑' : 'Load an audio file to start clipping'}</div>
            <div className="empty-desc">{zh ? '拖动框选区域 · 切换到分割模式点击波形添加分割点' : 'Drag to select · Switch to split mode and click the waveform to add split points'}</div>
          </div>
        )}
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span className="spinner" /> <span className="small">{zh ? '解码中…' : 'Decoding…'}</span>
          </div>
        )}
      </div>

      {/* 选区控制 */}
      {source && (
        <div className="card-flat">
          <div className="grid-3">
            <div className="field">
              <span className="field-label">{zh ? '开始' : 'Start'}</span>
              <input
                className="input mono"
                defaultValue={fmtDurationMs(selStart)}
                key={`s-${selStart}`}
                onBlur={(e) => commitTime(e.target.value, 'start')}
                onKeyDown={(e) => { if (e.key === 'Enter') commitTime((e.target as HTMLInputElement).value, 'start'); }}
              />
            </div>
            <div className="field">
              <span className="field-label">{zh ? '结束' : 'End'}</span>
              <input
                className="input mono"
                defaultValue={fmtDurationMs(selEnd)}
                key={`e-${selEnd}`}
                onBlur={(e) => commitTime(e.target.value, 'end')}
                onKeyDown={(e) => { if (e.key === 'Enter') commitTime((e.target as HTMLInputElement).value, 'end'); }}
              />
            </div>
            <div className="field">
              <span className="field-label">{zh ? '长度' : 'Length'}</span>
              <input className="input mono" value={fmtDurationMs(Math.max(0, selEnd - selStart))} readOnly />
            </div>
          </div>

          <div className="row mt-3" style={{ gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={playSelection} disabled={!hasSelection}>
              <IconPlay size={13} /> {zh ? '试听选区' : 'Play selection'}
            </button>
            <button className="btn btn-sm" onClick={stopPlay}><IconStop size={13} /> {zh ? '停止' : 'Stop'}</button>
            <button className="btn btn-sm" onClick={() => { setSelStart(0); setSelEnd(durationMs); }}>
              {zh ? '全选' : 'Select all'}
            </button>
            <button className="btn btn-sm" onClick={() => { setSelStart(0); setSelEnd(0); }}>
              {zh ? '清除选区' : 'Clear'}
            </button>
            <span className="grow" />
            {tool === 'split' && (
              <span className="xs muted">{zh ? '点击波形添加分割点' : 'Click waveform to add split points'}</span>
            )}
            {splits.length > 0 && (
              <span className="badge badge-warning">{zh ? `分割点 ${splits.length} 个 · ${segCount} 段` : `${splits.length} splits · ${segCount} segments`}</span>
            )}
          </div>

          {splits.length > 0 && (
            <div className="row mt-2" style={{ gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
              {splits.map((s, i) => (
                <span key={`${s}-${i}`} className="badge mono">
                  {fmtDurationMs(s)}
                  <button
                    className="btn btn-ghost btn-icon"
                    style={{ height: 16, width: 16 }}
                    onClick={() => setSplits((arr) => arr.filter((_, j) => j !== i))}
                  >
                    <IconClose size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 参数 + 导出 */}
      {source && (
        <div className="grid-2" style={{ gridTemplateColumns: '1fr 340px', alignItems: 'start' }}>
          <div className="card">
            <div className="card-title">{zh ? '输出参数' : 'Output parameters'}</div>
            <FormatSelect value={params.format} onChange={(f) => {
              const next = defaultParamsFor(f);
              next.filenameTemplate = params.filenameTemplate;
              setParams(next);
            }} />
            <hr className="divider" />
            <ParamPanel params={params} onChange={(patch) => setParams((p) => ({ ...p, ...patch }))} showNaming={false} />
          </div>

          <div className="card">
            <div className="card-title">{zh ? '导出' : 'Export'}</div>
            <div className="col" style={{ gap: 'var(--sp-3)' }}>
              <div className="segmented" style={{ alignSelf: 'flex-start' }}>
                <button className={exportMode === 'selection' ? 'active' : ''} onClick={() => setExportMode('selection')}>
                  {zh ? '导出选区' : 'Export selection'}
                </button>
                <button
                  className={exportMode === 'segments' ? 'active' : ''}
                  onClick={() => setExportMode('segments')}
                  disabled={!splits.length}
                >
                  {zh ? `导出全部片段 (${segCount})` : `All segments (${segCount})`}
                </button>
              </div>

              {task && (
                <div className="col" style={{ gap: 'var(--sp-2)' }}>
                  <div className="row-between xs">
                    <span className="muted">{statusLabel(task.status, zh)}</span>
                    <span className="mono">{Math.round(task.progress.ratio * 100)}%</span>
                  </div>
                  <div className={`progress${task.status === 'completed' ? ' progress-success' : task.status === 'failed' ? ' progress-danger' : ''}`}>
                    <div className="bar" style={{ width: `${task.progress.ratio * 100}%` }} />
                  </div>
                  {task.error && <div className="xs" style={{ color: 'var(--danger)' }}>{task.error.message}</div>}
                </div>
              )}

              <button
                className="btn btn-primary btn-block"
                onClick={() => void doExport()}
                disabled={!hasSelection || busy || task?.status === 'running' || task?.status === 'preparing'}
              >
                <IconScissors size={15} />
                {busy ? (zh ? '导出中…' : 'Exporting…') : (zh ? '开始导出' : 'Export')}
              </button>

              {task?.status === 'running' || task?.status === 'preparing' ? (
                <button className="btn btn-danger btn-block" onClick={() => void cancelAdhoc(task.id)}>
                  {zh ? '取消' : 'Cancel'}
                </button>
              ) : null}

              {task?.result && (
                <button className="btn btn-success btn-block" onClick={() => void download()}>
                  <IconDownload size={15} />
                  {zh ? '下载结果' : 'Download result'} · {fmtSize(task.result.sizeBytes)}
                </button>
              )}

              <div className="xs muted">{zh ? '淡入淡出在参数面板"专业模式"中设置' : 'Set fades in the Pro mode of the parameter panel'}</div>
            </div>
          </div>
        </div>
      )}

      <audio ref={audioRef} preload="auto" />

      {/* 结果弹窗 */}
      <Modal
        open={showResult && !!task?.result}
        title={zh ? '剪辑完成' : 'Clip finished'}
        onClose={() => setShowResult(false)}
        footer={
          <>
            <button className="btn" onClick={() => setShowResult(false)}>{zh ? '关闭' : 'Close'}</button>
            <button className="btn btn-primary" onClick={() => void download()}>
              <IconDownload size={14} /> {zh ? '下载' : 'Download'}
            </button>
          </>
        }
      >
        {task?.result && (
          <div className="kv">
            <dt>{zh ? '文件' : 'File'}</dt><dd className="mono">{task.result.fileName}</dd>
            <dt>{zh ? '大小' : 'Size'}</dt><dd className="mono">{fmtSize(task.result.sizeBytes)}</dd>
            <dt>{zh ? '耗时' : 'Elapsed'}</dt><dd className="mono">{(task.result.elapsedMs / 1000).toFixed(1)}s</dd>
            {task.result.outputPath && (<><dt>{zh ? '位置' : 'Path'}</dt><dd className="mono xs">{task.result.outputPath}</dd></>)}
          </div>
        )}
      </Modal>
    </div>
  );
}

function statusLabel(s: AdhocTaskState['status'], zh: boolean): string {
  const map: Record<string, [string, string]> = {
    queued: ['等待', 'Queued'],
    preparing: ['准备', 'Preparing'],
    running: ['导出中', 'Exporting'],
    paused: ['暂停', 'Paused'],
    completed: ['完成', 'Done'],
    failed: ['失败', 'Failed'],
    cancelled: ['取消', 'Cancelled'],
  };
  const pair = map[s] ?? [s, s];
  return zh ? pair[0] : pair[1];
}
