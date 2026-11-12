/**
 * 任务状态机（转换/剪辑/合并任务共用）。
 *
 * 严格的状态转移表：UI 与引擎都必须通过 transition() 更新状态，
 * 避免出现"UI 直接改百分比伪造进度"这类问题 —— 进度由引擎回调驱动，
 * 状态只允许沿合法边转移。
 */

export type TaskStatus =
  | 'queued' // 等待中
  | 'preparing' // 准备中（读取文件/初始化引擎）
  | 'running' // 转换中
  | 'paused' // 已暂停
  | 'completed' // 已完成
  | 'failed' // 失败
  | 'cancelled'; // 已取消

export const TERMINAL_STATUSES: TaskStatus[] = ['completed', 'failed', 'cancelled'];

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  queued: ['preparing', 'paused', 'cancelled', 'failed'],
  preparing: ['running', 'paused', 'cancelled', 'failed'],
  running: ['paused', 'completed', 'failed', 'cancelled'],
  paused: ['running', 'queued', 'cancelled', 'failed'],
  completed: [],
  failed: ['queued'], // 失败后可重试（重新入队）
  cancelled: ['queued'], // 取消后可重新执行
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function transition(task: { status: TaskStatus }, to: TaskStatus): TaskStatus {
  if (task.status === to) return to;
  if (!canTransition(task.status, to)) {
    throw new Error(`非法任务状态转移: ${task.status} -> ${to}`);
  }
  task.status = to;
  return to;
}

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export interface TaskProgress {
  /** 0..1 真实进度（由引擎 out_time/duration 计算） */
  ratio: number;
  /** 已处理音频时长 ms */
  processedMs: number;
  /** 源总时长 ms */
  totalMs: number;
  /** 引擎实时输出 fps / 速度（可选，用于展示） */
  speed?: number;
  /** 实时码率 kbps（可选） */
  bitrateKbps?: number;
}

export interface TaskErrorInfo {
  code: string;
  message: string;
  detail?: string;
}

export interface TaskRecord<TParams = unknown> {
  id: string;
  kind: 'convert' | 'trim' | 'merge' | 'extract';
  status: TaskStatus;
  progress: TaskProgress;
  /** 源描述（展示用） */
  sourceLabel: string;
  sourceFormat?: string;
  targetFormat?: string;
  params: TParams;
  output?: {
    path: string;
    fileName: string;
    sizeBytes?: number;
    durationMs?: number;
  };
  error?: TaskErrorInfo;
  attempt: number;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export function newTaskProgress(totalMs = 0): TaskProgress {
  return { ratio: 0, processedMs: 0, totalMs };
}

/** 创建任务记录 */
export function createTask<K extends TaskRecord['kind'], P>(
  kind: K,
  sourceLabel: string,
  params: P,
  extra?: Partial<TaskRecord>,
): TaskRecord<P> {
  return {
    id: createTaskId(),
    kind,
    status: 'queued',
    progress: newTaskProgress(0),
    sourceLabel,
    params,
    attempt: 0,
    createdAt: Date.now(),
    ...extra,
  } as TaskRecord<P>;
}

let idSeq = 0;
export function createTaskId(): string {
  idSeq = (idSeq + 1) % 1_000_000;
  return `t_${Date.now().toString(36)}_${idSeq.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** 进度更新必须走这里：校验 ratio 单调不减、在 [0,1] 内 */
export function applyProgress(task: TaskRecord, next: Partial<TaskProgress>): void {
  if (task.status !== 'running' && task.status !== 'preparing') return;
  if (typeof next.ratio === 'number') {
    const clamped = Math.max(0, Math.min(1, next.ratio));
    // 允许 0.999... → 1.0，但禁止回退（ffmpeg 偶尔抖动时取最大值）
    task.progress.ratio = Math.max(task.progress.ratio, clamped);
  }
  if (typeof next.processedMs === 'number')
    task.progress.processedMs = Math.max(task.progress.processedMs, next.processedMs);
  if (typeof next.totalMs === 'number' && next.totalMs > 0) task.progress.totalMs = next.totalMs;
  if (typeof next.speed === 'number') task.progress.speed = next.speed;
  if (typeof next.bitrateKbps === 'number') task.progress.bitrateKbps = next.bitrateKbps;
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  queued: '等待中',
  preparing: '准备中',
  running: '转换中',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};
