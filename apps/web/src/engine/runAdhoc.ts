/**
 * 临时作业执行器：剪辑 / 合并等非队列作业的统一执行通道。
 * 与队列作业一致：真实进度回调、状态机合法转移、历史记录落库。
 */
import {
  createTask, transition, applyProgress, type AudioJob, type JobResult,
  type TaskProgress, type TaskStatus, makeEngineError, EngineError,
} from '@audio-studio/shared';
import { getEngine } from './index';
import { useHistory, type HistoryRecord } from '../stores/history';
import { toast } from '../stores/toast';

export interface AdhocTaskState {
  id: string;
  status: TaskStatus;
  progress: TaskProgress;
  result?: JobResult;
  error?: { code: string; message: string };
  startedAt?: number;
  finishedAt?: number;
}

export interface RunAdhocOptions {
  job: AudioJob;
  historyKind: 'trim' | 'merge';
  sourceLabel: string;
  sourcePath?: string;
  sourceFormat?: string;
  onState: (s: AdhocTaskState) => void;
}

/** 执行一个临时作业（剪辑/合并）。进度与状态全部来自引擎回调。 */
export async function runAdhoc(opts: RunAdhocOptions): Promise<JobResult | null> {
  const { job, onState } = opts;
  const record = createTask(job.kind === 'trim' ? 'trim' : 'merge', opts.sourceLabel, job.params);
  const state: AdhocTaskState = {
    id: record.id,
    status: 'queued',
    progress: { ratio: 0, processedMs: 0, totalMs: 0 },
  };
  const emit = () => onState({ ...state, progress: { ...state.progress } });

  const setStatus = (to: TaskStatus) => {
    state.status = transition({ status: state.status }, to);
    emit();
  };

  try {
    setStatus('preparing');
    const engine = await ensureEngine();
    setStatus('running');
    state.startedAt = Date.now();

    const result = await engine.run(job, {
      onProgress: (p) => {
        applyProgress(state as never, p);
        if (p.totalMs && !state.progress.totalMs) state.progress.totalMs = p.totalMs;
        emit();
      },
    });

    state.progress = { ...state.progress, ratio: 1 };
    setStatus('completed');
    state.result = result;
    state.finishedAt = Date.now();
    emit();

    const rec: HistoryRecord = {
      id: job.taskId,
      kind: opts.historyKind,
      sourceLabel: opts.sourceLabel,
      sourcePath: opts.sourcePath,
      sourceFormat: opts.sourceFormat,
      targetFormat: job.params.format,
      params: job.params,
      outputPath: result.outputPath,
      fileName: result.fileName,
      sizeBytes: result.sizeBytes,
      durationMs: result.outputProbe?.durationMs,
      status: 'completed',
      createdAt: state.startedAt ?? Date.now(),
      finishedAt: state.finishedAt,
      elapsedMs: result.elapsedMs,
    };
    void useHistory.getState().add(rec);
    toast.success(opts.historyKind === 'trim' ? '剪辑完成' : '合并完成', result.fileName);
    return result;
  } catch (e) {
    const err = e instanceof EngineError
      ? { code: e.code, message: e.message }
      : { code: 'E_UNKNOWN', message: e instanceof Error ? e.message : String(e) };

    if (err.code === 'E_CANCELLED') {
      try { setStatus('cancelled'); } catch { /* 状态可能已转移 */ }
      state.finishedAt = Date.now();
      emit();
      return null;
    }

    try { setStatus('failed'); } catch { /* ignore */ }
    state.error = err;
    state.finishedAt = Date.now();
    emit();
    toast.error(opts.historyKind === 'trim' ? '剪辑失败' : '合并失败', err.message);

    const rec: HistoryRecord = {
      id: job.taskId,
      kind: opts.historyKind,
      sourceLabel: opts.sourceLabel,
      sourcePath: opts.sourcePath,
      sourceFormat: opts.sourceFormat,
      targetFormat: job.params.format,
      params: job.params,
      status: 'failed',
      errorMessage: err.message,
      createdAt: state.startedAt ?? Date.now(),
      finishedAt: state.finishedAt,
      elapsedMs: state.startedAt ? Date.now() - state.startedAt : 0,
    };
    void useHistory.getState().add(rec);
    return null;
  }
}

/** 取消当前临时作业（通过引擎 cancel） */
export async function cancelAdhoc(taskId: string): Promise<void> {
  try {
    await getEngine().cancel(taskId);
  } catch { /* 忽略 */ }
}

async function ensureEngine() {
  const { initEngine } = await import('./index');
  await initEngine();
  return getEngine();
}

export { makeEngineError };
