/**
 * 会话状态：导入文件、任务队列、真实进度、并发泵。
 *
 * 关键原则：
 * - 进度只来自引擎回调（applyProgress 有单调性校验），UI 不允许伪造。
 * - 状态只通过共享状态机 transition() 转移。
 * - 队列泵 pump() 按 settings.concurrency 拉起 armed 的 queued 任务。
 */
import { create } from 'zustand';
import {
  AudioSource,
  EncodeParams,
  JobResult,
  ProbeResult,
  ResourceEstimate,
  TaskRecord,
  applyProgress,
  buildOutputFileName,
  createTask,
  defaultParamsFor,
  deriveParams,
  transition,
  validateParams,
  EngineError,
  makeEngineError,
  getFormat,
} from '@audio-studio/shared';
import { getEngine, initEngine, engineInitialized, setEngineConcurrency } from '../engine';
import { useSettings } from './settings';
import { useHistory, type HistoryRecord } from './history';
import { toast } from './toast';
import { notify, deliverResult, isDesktop, baseName, dirOf } from '../platform';

export interface SessionFile {
  source: AudioSource;
  probe?: ProbeResult;
  probeError?: string;
  probing: boolean;
  /** 单文件独立参数 */
  params: EncodeParams;
  estimate?: ResourceEstimate;
}

export interface SessionTask extends TaskRecord<EncodeParams> {
  fileId: string;
  /** true 时队列泵才会执行（“开始”动作置位） */
  armed: boolean;
  /** 暂停/取消意图：用于区分 E_CANCELLED 落到哪个终态 */
  intent?: 'pause' | 'cancel';
  /** 输出结果（含内存数据，可下载） */
  result?: JobResult;
}

interface SessionState {
  files: SessionFile[];
  tasks: SessionTask[];
  /** 引擎初始化状态 */
  engineState: 'idle' | 'initializing' | 'ready' | 'error';
  engineError?: string;

  addFiles: (sources: AudioSource[]) => Promise<void>;
  removeFile: (fileId: string) => void;
  clearFiles: () => void;
  setFileParams: (fileId: string, patch: Partial<EncodeParams>) => void;
  applyFormatToAll: (format: EncodeParams['format']) => void;
  applyParamsToAll: (patch: Partial<EncodeParams>) => void;
  ensureEngine: () => Promise<void>;

  startTask: (taskId: string) => void;
  startAll: () => void;
  startForFile: (fileId: string) => Promise<void>;
  pauseTask: (taskId: string) => void;
  resumeTask: (taskId: string) => void;
  cancelTask: (taskId: string) => void;
  retryTask: (taskId: string) => void;
  removeTask: (taskId: string) => void;
  clearCompleted: () => void;
  clearResults: () => void;
}

/** 模块级：执行中任务集合（防止重复拉起，不进 React state） */
const executing = new Set<string>();
let pumpScheduled = false;

function errOf(e: unknown): { code: string; message: string; detail?: string } {
  if (e instanceof EngineError) return { code: e.code, message: e.message, detail: e.detail };
  if (e instanceof Error) return { code: 'E_UNKNOWN', message: e.message };
  return { code: 'E_UNKNOWN', message: String(e) };
}

export const useSession = create<SessionState>((set, get) => ({
  files: [],
  tasks: [],
  engineState: 'idle',
  engineError: undefined,

  addFiles: async (sources) => {
    if (!sources.length) return;
    const { defaultFormat, defaultBitrateKbps, filenameTemplate } = useSettings.getState();
    const newFiles: SessionFile[] = [];

    for (const src of sources) {
      // 去重：同名同大小
      const dup = [...get().files, ...newFiles].some(
        (f) =>
          f.source.name === src.name &&
          f.source.sizeBytes === src.sizeBytes &&
          f.source.sizeBytes > 0,
      );
      if (dup) continue;
      const params = defaultParamsFor(defaultFormat);
      if (getFormat(defaultFormat)?.bitrateOptionsKbps?.includes(defaultBitrateKbps)) {
        params.bitrateKbps = defaultBitrateKbps;
      }
      params.filenameTemplate = filenameTemplate;
      newFiles.push({ source: src, probing: true, params });
    }
    if (!newFiles.length) {
      toast.info('文件已存在', '列表中已有相同文件');
      return;
    }
    set((s) => ({ files: [...s.files, ...newFiles] }));

    // 并发探测（真实信息）
    void newFiles.forEach((f) => void probeOne(f.source.id));
  },

  removeFile: (fileId) => {
    const tasks = get().tasks.filter((t) => t.fileId === fileId);
    for (const t of tasks) {
      if (t.status === 'running' || t.status === 'preparing') get().cancelTask(t.id);
    }
    set((s) => ({
      files: s.files.filter((f) => f.source.id !== fileId),
      tasks: s.tasks.filter((t) => t.fileId !== fileId),
    }));
  },

  clearFiles: () => {
    for (const t of get().tasks) {
      if (t.status === 'running' || t.status === 'preparing') get().cancelTask(t.id);
    }
    set({ files: [], tasks: [] });
  },

  setFileParams: (fileId, patch) => {
    set((s) => ({
      files: s.files.map((f) =>
        f.source.id === fileId
          ? {
              ...f,
              params: {
                ...(patch.format ? defaultParamsFor(patch.format, f.params) : f.params),
                ...patch,
              },
            }
          : f,
      ),
    }));
  },

  applyFormatToAll: (format) => {
    set((s) => ({
      files: s.files.map((f) => {
        const next = deriveParams(f.probe?.format ?? null, format, {
          sampleRate: f.probe?.sampleRate,
          channels: f.probe?.channels,
          bitDepth: f.probe?.bitDepth as number | undefined,
        });
        return { ...f, params: { ...next, filenameTemplate: f.params.filenameTemplate } };
      }),
    }));
  },

  applyParamsToAll: (patch) => {
    set((s) => ({
      files: s.files.map((f) => ({
        ...f,
        params: {
          ...(patch.format ? defaultParamsFor(patch.format, f.params) : f.params),
          ...patch,
        },
      })),
    }));
  },

  ensureEngine: async () => {
    const state = get().engineState;
    if (state === 'ready' && engineInitialized()) return;
    set({ engineState: 'initializing', engineError: undefined });
    try {
      await initEngine();
      setEngineConcurrency(useSettings.getState().concurrency);
      set({ engineState: 'ready' });
    } catch (e) {
      const err = errOf(e);
      set({ engineState: 'error', engineError: err.message });
      toast.error('音频引擎初始化失败', err.message);
      throw e;
    }
  },

  startTask: (taskId) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (!task || !['queued', 'paused', 'failed', 'cancelled'].includes(task.status)) return;
    if (task.status === 'failed' || task.status === 'cancelled') {
      get().retryTask(taskId);
      return;
    }
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== taskId) return t;
        let status = t.status;
        if (status === 'paused' || status === 'failed' || status === 'cancelled') {
          status = transition({ status }, 'queued');
        }
        return { ...t, status, armed: true, intent: undefined };
      }),
    }));
    schedulePump();
  },

  startAll: () => {
    // 新导入的文件尚无任务；一次创建快照，再启动已有等待/暂停任务。
    set((s) => ({
      tasks: [
        ...s.tasks,
        ...s.files
          .filter(
            (f) =>
              !s.tasks.some(
                (t) => t.fileId === f.source.id && !['failed', 'cancelled'].includes(t.status),
              ),
          )
          .map(taskForFile),
      ].map((t) => {
        if (t.status === 'queued' || t.status === 'paused') {
          const status =
            t.status === 'paused' ? transition({ status: t.status }, 'queued') : t.status;
          return { ...t, status, armed: true, intent: undefined };
        }
        return t;
      }),
    }));
    schedulePump();
  },

  startForFile: async (fileId) => {
    const st = get();
    const file = st.files.find((f) => f.source.id === fileId);
    if (!file) return;
    if (st.tasks.some((t) => t.fileId === fileId && ['preparing', 'running'].includes(t.status)))
      return;
    // 已有未完成任务 → 直接启动；否则创建
    const task = st.tasks.find(
      (t) => t.fileId === fileId && ['queued', 'paused'].includes(t.status),
    );
    if (!task) {
      const rec = taskForFile(file);
      set((s) => ({ tasks: [...s.tasks, rec] }));
    } else {
      get().startTask(task.id);
      return;
    }
    schedulePump();
  },

  pauseTask: (taskId) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.status === 'queued') {
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === taskId
            ? { ...t, armed: false, status: transition({ status: t.status }, 'paused') }
            : t,
        ),
      }));
      return;
    }
    if (task.status === 'running' || task.status === 'preparing') {
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, intent: 'pause', armed: false } : t)),
      }));
      if (task.status === 'preparing') return;
      void getEngine()
        .cancel(taskId)
        .catch(() => undefined);
    }
  },

  resumeTask: (taskId) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (!task || task.status !== 'paused') return;
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: transition({ status: t.status }, 'queued'),
              armed: true,
              intent: undefined,
            }
          : t,
      ),
    }));
    schedulePump();
  },

  cancelTask: (taskId) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.status === 'queued' || task.status === 'paused') {
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                armed: false,
                status: transition({ status: t.status }, 'cancelled'),
                finishedAt: Date.now(),
              }
            : t,
        ),
      }));
      return;
    }
    if (task.status === 'running' || task.status === 'preparing') {
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, intent: 'cancel', armed: false } : t)),
      }));
      if (task.status === 'preparing') return;
      void getEngine()
        .cancel(taskId)
        .catch(() => undefined);
    }
  },

  retryTask: (taskId) => {
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== taskId || !['failed', 'cancelled'].includes(t.status)) return t;
        const status = transition({ status: t.status }, 'queued');
        return {
          ...t,
          status,
          armed: true,
          intent: undefined,
          error: undefined,
          progress: { ...t.progress, ratio: 0, processedMs: 0 },
          startedAt: undefined,
          finishedAt: undefined,
        };
      }),
    }));
    schedulePump();
  },

  removeTask: (taskId) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.status === 'running' || task.status === 'preparing') {
      get().cancelTask(taskId);
    }
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== taskId) }));
  },

  clearCompleted: () => {
    set((s) => ({
      tasks: s.tasks.filter((t) => !['completed', 'cancelled'].includes(t.status)),
    }));
  },

  clearResults: () => {
    set((s) => ({
      tasks: s.tasks.map((t) => (t.status === 'completed' ? { ...t, result: undefined } : t)),
    }));
  },
}));

function taskForFile(file: SessionFile): SessionTask {
  const params = { ...file.params, normalize: { ...file.params.normalize } };
  return {
    ...createTask<'convert', EncodeParams>('convert', file.source.name, params),
    targetFormat: params.format,
    fileId: file.source.id,
    armed: true,
  };
}

/** 探测单个文件（真实信息来源：引擎） */
async function probeOne(fileId: string): Promise<void> {
  const file = useSession.getState().files.find((f) => f.source.id === fileId);
  if (!file) return;
  try {
    await useSession.getState().ensureEngine();
    const engine = getEngine();
    const probe = await engine.probe(file.source);
    const estimate = engine.estimate(file.source);

    useSession.setState((s) => ({
      files: s.files.map((f) =>
        f.source.id === fileId ? { ...f, probe, estimate, probing: false } : f,
      ),
    }));

    // 用真实源信息推导合理默认参数（采样率/声道保持）
    const cur = useSession.getState().files.find((f) => f.source.id === fileId);
    if (cur && !cur.probeError) {
      const derived = deriveParams(probe.format, cur.params.format, {
        sampleRate: probe.sampleRate,
        channels: probe.channels,
        bitDepth: probe.bitDepth as number | undefined,
      });
      useSession.getState().setFileParams(fileId, {
        ...(cur.params.sampleRate === file.params.sampleRate
          ? { sampleRate: derived.sampleRate }
          : {}),
        ...(cur.params.channels === file.params.channels ? { channels: derived.channels } : {}),
        ...(cur.params.bitDepth === file.params.bitDepth ? { bitDepth: derived.bitDepth } : {}),
      });
    }
    for (const w of estimate.warnings) toast.warning('资源预检', w);
    if (probe.extensionMismatch) {
      toast.warning(
        '格式提示',
        `${file.source.name}：${probe.warnings.find((x) => x.includes('不一致')) ?? '扩展名与实际格式不一致'}`,
      );
    }
  } catch (e) {
    const err = errOf(e);
    useSession.setState((s) => ({
      files: s.files.map((f) =>
        f.source.id === fileId ? { ...f, probing: false, probeError: err.message } : f,
      ),
    }));
    toast.error('文件分析失败', `${file.source.name}: ${err.message}`);
  }
}

function schedulePump(): void {
  if (pumpScheduled) return;
  pumpScheduled = true;
  queueMicrotask(() => {
    pumpScheduled = false;
    void pump();
  });
}

/** 队列泵：按并发上限拉起任务 */
async function pump(): Promise<void> {
  const state = useSession.getState();
  const concurrency = Math.max(1, Math.min(4, useSettings.getState().concurrency));
  let running = executing.size;

  for (const task of state.tasks) {
    if (running >= concurrency) break;
    if (task.status === 'queued' && task.armed && !executing.has(task.id)) {
      running += 1;
      executing.add(task.id);
      void execute(task.id);
    }
  }
}

async function execute(taskId: string): Promise<void> {
  // 所有准备、校验和执行路径都必须归还并发槽位。
  try {
    await executeTask(taskId);
  } catch (e) {
    const current = useSession.getState().tasks.find((t) => t.id === taskId);
    if (current && ['preparing', 'running'].includes(current.status)) {
      if (current.intent) {
        patchTask(taskId, (t) => ({
          status: transition(
            { status: t.status },
            current.intent === 'pause' ? 'paused' : 'cancelled',
          ),
          armed: false,
          finishedAt: current.intent === 'pause' ? undefined : Date.now(),
          intent: undefined,
        }));
      } else markFailed(taskId, e);
    }
  } finally {
    executing.delete(taskId);
    schedulePump();
  }
}

async function executeTask(taskId: string): Promise<void> {
  const state = useSession.getState();
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task || task.status !== 'queued') {
    executing.delete(taskId);
    return;
  }
  const file = state.files.find((f) => f.source.id === task.fileId);
  if (!file) {
    markFailed(taskId, makeEngineError('E_SOURCE_MISSING'));
    return;
  }

  // preparing
  patchTask(taskId, (t) => ({ status: transition({ status: t.status }, 'preparing') }));

  await useSession.getState().ensureEngine();

  // 初始化期间可能已暂停、取消或移除；不能再提交到引擎。
  const prepared = useSession.getState().tasks.find((t) => t.id === taskId);
  if (!prepared) return;
  if (prepared.intent) throw makeEngineError('E_CANCELLED');

  const params = { ...task.params, normalize: { ...task.params.normalize } };
  const errors = validateParams(params);
  if (errors.length) {
    markFailed(
      taskId,
      makeEngineError('E_INVALID_PARAM', errors.join('；'), { message: errors[0] }),
    );
    return;
  }

  patchTask(taskId, (t) => ({
    status: transition({ status: t.status }, 'running'),
    startedAt: Date.now(),
    params,
    sourceFormat: file.probe?.format ?? undefined,
    targetFormat: params.format,
    attempt: t.attempt + 1,
    error: undefined,
    finishedAt: undefined,
    progress: { ...t.progress, totalMs: file.probe?.durationMs ?? 0, ratio: 0, processedMs: 0 },
  }));

  const settings = useSettings.getState();
  const index = useSession.getState().files.findIndex((f) => f.source.id === task.fileId) + 1;
  const outputFileName = buildOutputFileName(params.filenameTemplate, {
    sourceName: baseName(file.source.name).replace(/\.[^.]+$/, ''),
    sourceFormat: file.probe?.format ?? undefined,
    format: getFormat(params.format)!,
    index,
    tags: file.probe?.tags,
  });

  const engine = getEngine();
  const job = {
    kind: 'convert' as const,
    taskId,
    source: file.source,
    params,
    outputFileName,
    outputDir: settings.outputDirName || '',
  };

  const t0 = performance.now();
  try {
    const result = await engine.run(job, {
      onProgress: (p) => {
        const t = useSession.getState().tasks.find((x) => x.id === taskId);
        if (!t) return;
        const next = { ...t, progress: { ...t.progress } };
        applyProgress(next, p);
        useSession.setState((s) => ({
          tasks: s.tasks.map((x) => (x.id === taskId ? { ...x, progress: next.progress } : x)),
        }));
      },
    });

    const t = useSession.getState().tasks.find((x) => x.id === taskId);
    if (!t) return;
    // 若用户在完成瞬间按了暂停/取消，以引擎结果为准（completed）
    patchTask(taskId, (x) => ({
      status: transition({ status: x.status }, 'completed'),
      finishedAt: Date.now(),
      result,
      progress: {
        ...x.progress,
        ratio: 1,
        processedMs: x.progress.totalMs || x.progress.processedMs,
      },
      intent: undefined,
    }));

    const rec = buildHistoryRecord(
      taskId,
      'completed',
      result,
      params,
      file,
      outputFileName,
      performance.now() - t0,
    );
    void useHistory.getState().add(rec);

    // 通知
    if (settings.notifyOnDone) {
      void notify('转换完成', `${file.source.name} → ${outputFileName}`);
    }
    // Web 自动下载
    if (!isDesktop && settings.autoDownload && result.data) {
      void deliverResult({ fileName: result.fileName, data: result.data }).catch(() => undefined);
    }
    toast.success('转换完成', outputFileName);
  } catch (e) {
    const err = errOf(e);
    const current = useSession.getState().tasks.find((x) => x.id === taskId);
    if (!current) return;

    if (err.code === 'E_CANCELLED' || current.intent) {
      const target = current.intent === 'pause' ? 'paused' : 'cancelled';
      patchTask(taskId, (x) => ({
        status: transition({ status: x.status }, target),
        finishedAt: target === 'cancelled' ? Date.now() : undefined,
        intent: undefined,
      }));
      if (target === 'cancelled') {
        const rec = buildHistoryRecord(
          taskId,
          'cancelled',
          undefined,
          params,
          file,
          outputFileName,
          performance.now() - t0,
        );
        void useHistory.getState().add(rec);
      }
    } else {
      markFailed(taskId, e, params, file, outputFileName, performance.now() - t0);
    }
  }
}

function patchTask(taskId: string, fn: (t: SessionTask) => Partial<SessionTask>): void {
  useSession.setState((s) => ({
    tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, ...fn(t) } : t)),
  }));
}

function markFailed(
  taskId: string,
  e: unknown,
  params?: EncodeParams,
  file?: SessionFile,
  outputFileName?: string,
  elapsedMs?: number,
): void {
  const err = errOf(e);
  patchTask(taskId, (t) => ({
    status: transition({ status: t.status }, 'failed'),
    finishedAt: Date.now(),
    error: { code: err.code, message: err.message, detail: err.detail },
    intent: undefined,
  }));
  toast.error('转换失败', `${file?.source.name ?? taskId}: ${err.message}`);
  if (params && file && outputFileName) {
    const rec = buildHistoryRecord(
      taskId,
      'failed',
      undefined,
      params,
      file,
      outputFileName,
      elapsedMs ?? 0,
      err.message,
    );
    void useHistory.getState().add(rec);
  }
}

function buildHistoryRecord(
  taskId: string,
  status: HistoryRecord['status'],
  result: JobResult | undefined,
  params: EncodeParams,
  file: SessionFile,
  outputFileName: string,
  elapsedMs: number,
  errorMessage?: string,
): HistoryRecord {
  return {
    id: taskId,
    kind: 'convert',
    sourceLabel: file.source.name,
    sourcePath: file.source.path,
    sourceFormat: file.probe?.format ?? undefined,
    targetFormat: params.format,
    params,
    outputPath: result?.outputPath ?? outputFileName,
    fileName: result?.fileName ?? outputFileName,
    sizeBytes: result?.sizeBytes,
    durationMs: result?.outputProbe?.durationMs,
    status,
    errorMessage,
    createdAt: Date.now(),
    finishedAt: Date.now(),
    elapsedMs: Math.round(elapsedMs),
  };
}

/** 从历史记录重新执行（需要源文件仍可用） */
export async function reexecuteFromHistory(rec: HistoryRecord): Promise<boolean> {
  const state = useSession.getState();
  if (rec.sourcePath && isDesktop) {
    const { makeSourceId } = await import('../platform');
    await state.addFiles([
      {
        id: makeSourceId(),
        name: baseName(rec.sourcePath),
        sizeBytes: 0,
        path: rec.sourcePath,
      },
    ]);
    const added = useSession.getState().files[useSession.getState().files.length - 1];
    useSession.getState().setFileParams(added.source.id, { ...rec.params });
    await useSession.getState().startForFile(added.source.id);
    return true;
  }
  // Web：只在同一会话内源 File 仍在时可用
  const match = state.files.find((f) => f.source.name === rec.sourceLabel);
  if (!match) return false;
  useSession.getState().setFileParams(match.source.id, { ...rec.params });
  await useSession.getState().startForFile(match.source.id);
  return true;
}

// 防止未使用导入
void dirOf;
