import { describe, it, expect } from 'vitest';
import {
  canTransition,
  transition,
  isTerminal,
  createTask,
  applyProgress,
  newTaskProgress,
  STATUS_LABELS,
} from '../task';

describe('任务状态机', () => {
  it('正常流转路径合法', () => {
    const t = { status: 'queued' as const };
    expect(transition(t, 'preparing')).toBe('preparing');
    expect(transition(t, 'running')).toBe('running');
    expect(transition(t, 'completed')).toBe('completed');
    expect(isTerminal(t.status)).toBe(true);
  });

  it('暂停与恢复', () => {
    const t = { status: 'running' as const };
    transition(t, 'paused');
    expect(t.status).toBe('paused');
    transition(t, 'running');
    expect(t.status).toBe('running');
  });

  it('失败后可重试入队，取消后可重新执行', () => {
    const failed = { status: 'failed' as const };
    expect(canTransition('failed', 'queued')).toBe(true);
    transition(failed, 'queued');
    expect(failed.status).toBe('queued');
    expect(canTransition('cancelled', 'queued')).toBe(true);
  });

  it('非法转移必须抛错（防止 UI 伪造状态）', () => {
    expect(() => transition({ status: 'queued' }, 'completed')).toThrow();
    expect(() => transition({ status: 'completed' }, 'running')).toThrow();
    expect(() => transition({ status: 'paused' }, 'preparing')).toThrow();
  });

  it('排队中的任务可暂停（queued → paused 合法）', () => {
    const t = { status: 'queued' as const };
    transition(t, 'paused');
    expect(t.status).toBe('paused');
    transition(t, 'queued');
    expect(t.status).toBe('queued');
  });

  it('终态不可再转移', () => {
    for (const s of ['completed', 'failed', 'cancelled'] as const) {
      expect(isTerminal(s)).toBe(true);
      expect(canTransition(s, 'running')).toBe(false);
    }
  });

  it('进度单调不减且被钳制到 [0,1]', () => {
    const task = createTask('convert', 'a.mp3', { x: 1 });
    task.status = 'running';
    applyProgress(task, { ratio: 0.3, totalMs: 1000, processedMs: 300 });
    expect(task.progress.ratio).toBeCloseTo(0.3);
    applyProgress(task, { ratio: 0.2 }); // 回退应被忽略
    expect(task.progress.ratio).toBeCloseTo(0.3);
    applyProgress(task, { ratio: 1.5 });
    expect(task.progress.ratio).toBe(1);
    applyProgress(task, { ratio: -1 });
    expect(task.progress.ratio).toBe(1);
  });

  it('非运行状态忽略进度更新', () => {
    const task = createTask('convert', 'a.mp3', {});
    applyProgress(task, { ratio: 0.5 });
    expect(task.progress.ratio).toBe(0);
  });

  it('createTask 生成唯一 id 与合法初始状态', () => {
    const a = createTask('convert', 'a.mp3', {});
    const b = createTask('trim', 'b.wav', {});
    expect(a.id).not.toBe(b.id);
    expect(a.status).toBe('queued');
    expect(newTaskProgress(5000).totalMs).toBe(5000);
    expect(Object.keys(STATUS_LABELS)).toHaveLength(7);
  });
});
