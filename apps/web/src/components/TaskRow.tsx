/**
 * 任务行：真实进度条 + 状态机驱动的操作按钮。
 * 进度只渲染 store 中的 progress.ratio（由引擎回调 applyProgress 写入，单调不减）。
 */
import { useState } from 'react';
import type { TaskStatus } from '@audio-studio/shared';
import type { SessionTask } from '../stores/session';
import { useSession } from '../stores/session';
import { useI18n } from '../i18n';
import { fmtDuration, fmtPercent, fmtSize, fmtElapsed } from '../utils/format';
import { deliverResult, revealOutput, isDesktop } from '../platform';
import { toast } from '../stores/toast';
import {
  IconClose, IconPause, IconPlay, IconRefresh, IconDownload, IconFolder,
  IconChevronDown, IconChevronRight,
} from './Icons';

const STATUS_CLASS: Record<TaskStatus, string> = {
  queued: '',
  preparing: 'badge-accent',
  running: 'badge-accent',
  paused: 'badge-warning',
  completed: 'badge-success',
  failed: 'badge-danger',
  cancelled: '',
};

const STATUS_KEY: Record<TaskStatus, string> = {
  queued: 'status.queued',
  preparing: 'status.preparing',
  running: 'status.running',
  paused: 'status.paused',
  completed: 'status.completed',
  failed: 'status.failed',
  cancelled: 'status.cancelled',
};

export interface TaskRowProps {
  task: SessionTask;
  /** 显示源文件名 → 目标 */
  showTarget?: boolean;
}

export function TaskRow({ task, showTarget = true }: TaskRowProps) {
  const lang = useI18n((s) => s.lang);
  const zh = lang !== 'en';
  const [expanded, setExpanded] = useState(false);

  const {
    startTask, pauseTask, resumeTask, cancelTask, retryTask, removeTask,
  } = useSession.getState();

  const active = task.status === 'running' || task.status === 'preparing';
  const pct = Math.round(task.progress.ratio * 100);

  const download = async () => {
    if (!task.result) return;
    try {
      await deliverResult({ fileName: task.result.fileName, data: task.result.data, outputPath: task.result.outputPath });
      if (isDesktop) toast.success(zh ? '已保存' : 'Saved', task.result.outputPath);
    } catch (e) {
      toast.error(zh ? '下载失败' : 'Download failed', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="task-row">
      <div className="task-row-main">
        {/* 状态徽章 */}
        <span className={`badge ${STATUS_CLASS[task.status]}`} style={{ flex: 'none', minWidth: 62, justifyContent: 'center' }}>
          {task.status === 'running' && <span className="dot" style={{ animation: 'pulse 1.2s infinite' }} />}
          {zh ? STATUS_LABEL_ZH[task.status] : tEn(task.status)}
        </span>

        {/* 名称 */}
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="truncate bold" style={{ fontSize: 'var(--fs-sm)' }} title={task.sourceLabel}>
            {task.sourceLabel}
            {showTarget && task.targetFormat && (
              <span className="muted" style={{ fontWeight: 400 }}> → {String(task.targetFormat).toUpperCase()}</span>
            )}
          </div>
          {task.status === 'running' && (
            <div className="xs muted mono">
              {fmtDuration(task.progress.processedMs)} / {fmtDuration(task.progress.totalMs)}
              {task.progress.speed ? ` · ${task.progress.speed.toFixed(1)}x` : ''}
            </div>
          )}
          {task.status === 'completed' && task.result && (
            <div className="xs muted truncate" title={task.result.outputPath}>
              {task.result.fileName} · {fmtSize(task.result.sizeBytes)} · {fmtElapsed(task.result.elapsedMs)}
            </div>
          )}
          {task.status === 'failed' && task.error && (
            <div className="xs" style={{ color: 'var(--danger)' }} title={task.error.detail ?? task.error.message}>
              {task.error.code}: {task.error.message}
            </div>
          )}
        </div>

        {/* 进度 */}
        <div style={{ width: 140, flex: 'none' }}>
          {active ? (
            <>
              <div className="progress progress-thin">
                <div className="bar" style={{ width: `${pct}%` }} />
              </div>
              <div className="xs muted mono" style={{ textAlign: 'right', marginTop: 2 }}>{pct}%</div>
            </>
          ) : task.status === 'completed' ? (
            <div className="xs" style={{ color: 'var(--success)', textAlign: 'right' }}>100%</div>
          ) : task.status === 'paused' ? (
            <div className="xs" style={{ color: 'var(--warning)', textAlign: 'right' }}>{pct}%</div>
          ) : (
            <div className="xs muted" style={{ textAlign: 'right' }}>—</div>
          )}
        </div>

        {/* 操作 */}
        <div className="row" style={{ gap: 4, flex: 'none' }}>
          {(task.status === 'queued' || task.status === 'preparing') && (
            <button className="btn btn-ghost btn-icon btn-sm" title={zh ? '暂停' : 'Pause'} onClick={() => pauseTask(task.id)}>
              <IconPause size={14} />
            </button>
          )}
          {task.status === 'running' && (
            <button className="btn btn-ghost btn-icon btn-sm" title={zh ? '暂停' : 'Pause'} onClick={() => pauseTask(task.id)}>
              <IconPause size={14} />
            </button>
          )}
          {task.status === 'paused' && (
            <button className="btn btn-ghost btn-icon btn-sm" title={zh ? '继续' : 'Resume'} onClick={() => resumeTask(task.id)}>
              <IconPlay size={14} />
            </button>
          )}
          {(task.status === 'queued' || task.status === 'preparing' || task.status === 'running' || task.status === 'paused') && (
            <button className="btn btn-ghost btn-icon btn-sm" title={zh ? '取消' : 'Cancel'} onClick={() => cancelTask(task.id)}>
              <IconClose size={14} />
            </button>
          )}
          {(task.status === 'failed' || task.status === 'cancelled') && (
            <button className="btn btn-ghost btn-icon btn-sm" title={zh ? '重新执行' : 'Retry'} onClick={() => retryTask(task.id)}>
              <IconRefresh size={14} />
            </button>
          )}
          {task.status === 'completed' && task.result && (
            <>
              <button className="btn btn-ghost btn-icon btn-sm" title={zh ? '下载' : 'Download'} onClick={() => void download()}>
                <IconDownload size={14} />
              </button>
              {isDesktop && (
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  title={zh ? '打开所在位置' : 'Reveal'}
                  onClick={() => void revealOutput(task.result!.outputPath).catch((e) => toast.error('打开失败', String(e)))}
                >
                  <IconFolder size={14} />
                </button>
              )}
            </>
          )}
          {!active && (
            <button className="btn btn-ghost btn-icon btn-sm" title={zh ? '移除' : 'Remove'} onClick={() => removeTask(task.id)}>
              <IconClose size={14} />
            </button>
          )}
          {task.error && (
            <button
              className="btn btn-ghost btn-icon btn-sm"
              title={zh ? '错误详情' : 'Error details'}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            </button>
          )}
        </div>
      </div>

      {expanded && task.error && (
        <pre className="task-error-detail">
          {task.error.code}: {task.error.message}
          {task.error.detail ? `\n${task.error.detail}` : ''}
        </pre>
      )}
    </div>
  );
}

const STATUS_LABEL_ZH: Record<TaskStatus, string> = {
  queued: '等待',
  preparing: '准备',
  running: '转换中',
  paused: '暂停',
  completed: '完成',
  failed: '失败',
  cancelled: '取消',
};

function tEn(s: TaskStatus): string {
  return {
    queued: 'Queued', preparing: 'Preparing', running: 'Converting',
    paused: 'Paused', completed: 'Done', failed: 'Failed', cancelled: 'Cancelled',
  }[s] ?? s;
}
