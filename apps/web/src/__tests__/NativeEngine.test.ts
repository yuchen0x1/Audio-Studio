import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultParamsFor, type ConvertJob, type MergeJob } from '@audio-studio/shared';
const { invoke, listen } = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen }));
import { NativeEngine } from '../engine/NativeEngine';

type Handler = (event: { payload: Record<string, unknown> }) => void;
const handlers = new Map<string, Handler>();
const unsubs: ReturnType<typeof vi.fn>[] = [];
const job: ConvertJob = {
  kind: 'convert',
  taskId: 'native',
  source: { id: 'src', name: 'src.wav', path: 'C:/src.wav', sizeBytes: 20 },
  params: defaultParamsFor('mp3'),
  outputDir: 'C:/out',
  outputFileName: 'audio.mp3',
};
beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  unsubs.length = 0;
  listen.mockImplementation(async (event, handler) => {
    handlers.set(event, handler);
    const un = vi.fn();
    unsubs.push(un);
    return un;
  });
  invoke.mockImplementation(async (command, args) => {
    if (command === 'engine_info') return { kind: 'native', version: 'test', name: 'FFmpeg' };
    if (command === 'engine_capabilities')
      return { formats: [], encoders: [], muxers: [], demuxers: [], filters: [] };
    if (command === 'probe')
      return { durationMs: 3000, sampleRate: 44100, channels: 2, fileSizeBytes: 20 };
    if (command === 'start_task') {
      handlers.get('task://done')?.({
        payload: {
          taskId: args.taskId,
          outputPath: 'C:/out/audio (1).mp3',
          sizeBytes: 10,
          elapsedMs: 2,
        },
      });
    }
  });
});

describe('原生引擎事件与合并上下文', () => {
  it('等待所有 listener 注册后才启动，即刻完成事件不会丢失', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const original = listen.getMockImplementation()!;
    listen.mockImplementation(async (...args) => {
      await gate;
      return original(...args);
    });
    const engine = new NativeEngine();
    const result = engine.run(job);
    await vi.waitFor(() => expect(listen).toHaveBeenCalledTimes(3));
    expect(invoke.mock.calls.some(([cmd]) => cmd === 'start_task')).toBe(false);
    release();
    expect((await result).outputPath).toBe('C:/out/audio (1).mp3');
    expect(unsubs.every((un) => un.mock.calls.length === 1)).toBe(true);
    expect(invoke).toHaveBeenCalledWith('probe', { path: 'C:/out/audio (1).mp3' });
  });

  it('listener 失败时不启动进程，并清理已经成功的订阅', async () => {
    listen.mockRejectedValueOnce(new Error('listener failed'));
    await expect(new NativeEngine().run(job)).rejects.toThrow();
    await vi.waitFor(() => expect(unsubs.every((un) => un.mock.calls.length === 1)).toBe(true));
    expect(invoke.mock.calls.some(([cmd]) => cmd === 'start_task')).toBe(false);
  });

  it('源时长传入整体淡出构建，冲突重命名后探测实际输出', async () => {
    const params = { ...defaultParamsFor('mp3'), fadeOutMs: 500 };
    await new NativeEngine().run({ ...job, params });
    const args = invoke.mock.calls.find(([cmd]) => cmd === 'start_task')![1].args;
    expect(args[args.indexOf('-af') + 1]).toContain('afade=t=out:st=2.500:d=0.500');
  });

  it('合并将每段时长用于淡出，静音位于两个音频之间', async () => {
    const merge: MergeJob = {
      ...job,
      kind: 'merge',
      items: [
        { source: job.source },
        { source: { ...job.source, id: 'second', path: 'C:/second.wav' }, fadeOutMs: 300 },
      ],
      gapMs: 500,
    };
    await new NativeEngine().run(merge);
    const args = invoke.mock.calls.find(([cmd]) => cmd === 'start_task')![1].args;
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(graph).toContain('[a0][g0][a1]concat');
    expect(graph).toContain('afade=t=out:st=2.700:d=0.300');
  });

  it('保持源采样率遇到 Opus 时解析为目标实际支持的 48kHz', async () => {
    const merge: MergeJob = {
      ...job,
      kind: 'merge',
      params: defaultParamsFor('opus'),
      items: [{ source: job.source }, { source: job.source }],
      gapMs: 0,
    };
    await new NativeEngine().run(merge);
    const args = invoke.mock.calls.find(([cmd]) => cmd === 'start_task')![1].args;
    expect(args[args.indexOf('-filter_complex') + 1]).toContain('sample_rates=48000');
    expect(args[args.indexOf('-ar') + 1]).toBe('48000');
  });
});
