import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTask, defaultParamsFor, makeEngineError } from '@audio-studio/shared';
import type { AudioSource, EncodeParams, JobResult, ProbeResult } from '@audio-studio/shared';

const mockRun = vi.fn();
const mockProbe = vi.fn();
const mockCancel = vi.fn();
const mockEstimate = vi.fn();
const mockInitEngine = vi.fn();

vi.mock('../engine', () => ({
  getEngine: () => ({
    run: mockRun,
    probe: mockProbe,
    cancel: mockCancel,
    estimate: mockEstimate,
    info: { kind: 'wasm', name: 'mock', version: '0' },
    capabilities: () => ({}),
    init: () => Promise.resolve({}),
    dispose: () => Promise.resolve(),
  }),
  initEngine: () => mockInitEngine(),
  engineInitialized: () => true,
  setEngineConcurrency: vi.fn(),
}));

vi.mock('../platform', () => ({
  isDesktop: false,
  baseName: (p: string) => p.split(/[\\/]/).pop() ?? p,
  dirOf: (p: string) => p.split(/[\\/]/).slice(0, -1).join('/'),
  notify: vi.fn(() => Promise.resolve()),
  deliverResult: vi.fn(() => Promise.resolve()),
}));

vi.mock('../stores/toast', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('../stores/history', () => ({
  useHistory: { getState: () => ({ add: vi.fn(() => Promise.resolve()) }) },
}));

import { useSession, type SessionTask, type SessionFile } from '../stores/session';
import { useSettings } from '../stores/settings';

function source(id: string, name = `${id}.mp3`, sizeBytes = 1000): AudioSource {
  return { id, name, sizeBytes };
}

function makeTask(fileId: string, status: SessionTask['status'] = 'queued'): SessionTask {
  const t = createTask<'convert', EncodeParams>(
    'convert',
    `${fileId}.mp3`,
    defaultParamsFor('mp3'),
  );
  return { ...t, status, fileId, armed: status === 'queued' };
}

const flush = () => new Promise((r) => setTimeout(r, 10));

beforeEach(() => {
  vi.clearAllMocks();
  useSession.setState({ files: [], tasks: [], engineState: 'idle', engineError: undefined });
  useSettings.getState().reset();
  mockInitEngine.mockResolvedValue({});
  mockEstimate.mockReturnValue({ warnings: [] });
  mockCancel.mockResolvedValue(undefined);
  mockProbe.mockResolvedValue({
    format: 'mp3',
    codec: 'mp3',
    container: 'mp3',
    fileSizeBytes: 1000,
    tags: {},
    streamSummary: [],
    warnings: [],
    sampleRate: 44100,
    channels: 2,
    durationMs: 60000,
  } satisfies ProbeResult);
  mockRun.mockResolvedValue({
    outputPath: 'out.mp3',
    fileName: 'out.mp3',
    sizeBytes: 500,
    elapsedMs: 10,
  } satisfies JobResult);
});

describe('addFiles', () => {
  it('添加文件并赋予默认参数', async () => {
    await useSession.getState().addFiles([source('a'), source('b')]);
    const files = useSession.getState().files;
    expect(files).toHaveLength(2);
    expect(files[0].params.format).toBe('mp3');
    expect(files[0].probing).toBe(true);
  });

  it('同名同大小去重', async () => {
    await useSession.getState().addFiles([source('a', 'song.mp3', 2000)]);
    await useSession.getState().addFiles([source('b', 'song.mp3', 2000)]);
    expect(useSession.getState().files).toHaveLength(1);
  });

  it('同名不同大小不去重', async () => {
    await useSession.getState().addFiles([source('a', 'song.mp3', 2000)]);
    await useSession.getState().addFiles([source('b', 'song.mp3', 3000)]);
    expect(useSession.getState().files).toHaveLength(2);
  });

  it('空数组不改变状态', async () => {
    await useSession.getState().addFiles([]);
    expect(useSession.getState().files).toHaveLength(0);
  });

  it('探测完成后写入真实 probe 信息', async () => {
    await useSession.getState().addFiles([source('a')]);
    await flush();
    const f = useSession.getState().files[0];
    expect(f.probing).toBe(false);
    expect(f.probe?.sampleRate).toBe(44100);
    expect(mockProbe).toHaveBeenCalled();
  });
});

describe('文件参数操作', () => {
  it('setFileParams 只更新目标文件', async () => {
    await useSession.getState().addFiles([source('a'), source('b')]);
    useSession.getState().setFileParams('a', { bitrateKbps: 320 });
    const files = useSession.getState().files;
    expect(files.find((f) => f.source.id === 'a')?.params.bitrateKbps).toBe(320);
    expect(files.find((f) => f.source.id === 'b')?.params.bitrateKbps).not.toBe(320);
  });

  it('applyFormatToAll 切换所有文件格式', async () => {
    await useSession.getState().addFiles([source('a'), source('b')]);
    useSession.getState().applyFormatToAll('flac');
    expect(useSession.getState().files.every((f) => f.params.format === 'flac')).toBe(true);
  });

  it('applyParamsToAll 批量打补丁', async () => {
    await useSession.getState().addFiles([source('a'), source('b')]);
    useSession.getState().applyParamsToAll({ gainDb: 3 });
    expect(useSession.getState().files.every((f) => f.params.gainDb === 3)).toBe(true);
  });

  it('removeFile 同时移除关联任务', async () => {
    await useSession.getState().addFiles([source('a')]);
    useSession.setState({ tasks: [makeTask('a')] });
    useSession.getState().removeFile('a');
    expect(useSession.getState().files).toHaveLength(0);
    expect(useSession.getState().tasks).toHaveLength(0);
  });
});

describe('任务状态机操作', () => {
  it('pauseTask：queued → paused 且解除 armed', () => {
    const t = makeTask('a');
    useSession.setState({ tasks: [t] });
    useSession.getState().pauseTask(t.id);
    const after = useSession.getState().tasks[0];
    expect(after.status).toBe('paused');
    expect(after.armed).toBe(false);
  });

  it('resumeTask：paused → queued 且 armed', () => {
    const t = makeTask('a', 'paused');
    useSession.setState({ tasks: [{ ...t, armed: false }] });
    useSession.getState().resumeTask(t.id);
    const after = useSession.getState().tasks[0];
    expect(after.status).toBe('queued');
    expect(after.armed).toBe(true);
  });

  it('cancelTask：queued → cancelled', () => {
    const t = makeTask('a');
    useSession.setState({ tasks: [t] });
    useSession.getState().cancelTask(t.id);
    expect(useSession.getState().tasks[0].status).toBe('cancelled');
  });

  it('retryTask：failed → queued 且重置进度', () => {
    const t = makeTask('a', 'failed');
    useSession.setState({
      tasks: [{ ...t, progress: { ...t.progress, ratio: 0.7, processedMs: 5000 } }],
    });
    useSession.getState().retryTask(t.id);
    const after = useSession.getState().tasks[0];
    expect(after.status).toBe('queued');
    expect(after.progress.ratio).toBe(0);
    expect(after.armed).toBe(true);
  });

  it('removeTask 移除终态任务', () => {
    const t = makeTask('a', 'completed');
    useSession.setState({ tasks: [t] });
    useSession.getState().removeTask(t.id);
    expect(useSession.getState().tasks).toHaveLength(0);
  });

  it('clearCompleted 只保留未完成任务', () => {
    useSession.setState({
      tasks: [makeTask('a', 'completed'), makeTask('b', 'cancelled'), makeTask('c', 'queued')],
    });
    useSession.getState().clearCompleted();
    expect(useSession.getState().tasks).toHaveLength(1);
    expect(useSession.getState().tasks[0].fileId).toBe('c');
  });

  it('clearResults 清空已完成任务的内存结果', () => {
    const t = makeTask('a', 'completed');
    useSession.setState({
      tasks: [{ ...t, result: { outputPath: 'x', fileName: 'x', sizeBytes: 1, elapsedMs: 1 } }],
    });
    useSession.getState().clearResults();
    expect(useSession.getState().tasks[0].result).toBeUndefined();
  });
});

describe('ensureEngine', () => {
  it('成功后 engineState 为 ready', async () => {
    await useSession.getState().ensureEngine();
    expect(useSession.getState().engineState).toBe('ready');
  });

  it('失败后 engineState 为 error 并记录消息', async () => {
    mockInitEngine.mockRejectedValue(makeEngineError('E_ENGINE_INIT'));
    await expect(useSession.getState().ensureEngine()).rejects.toThrow();
    expect(useSession.getState().engineState).toBe('error');
    expect(useSession.getState().engineError).toBeTruthy();
  });
});

describe('队列泵与执行', () => {
  it('startAll 后 pump 拉起任务并执行至完成', async () => {
    await useSession.getState().addFiles([source('a')]);
    await flush();
    const t = makeTask('a');
    useSession.setState({ tasks: [t] });
    useSession.getState().startAll();
    await flush();
    await vi.waitFor(() => {
      expect(useSession.getState().tasks[0].status).toBe('completed');
    });
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('并发上限：concurrency=1 时同时只跑一个', async () => {
    useSettings.getState().update({ concurrency: 1 });
    await useSession.getState().addFiles([source('a'), source('b')]);
    await flush();
    let resolveFirst: (v: JobResult) => void = () => {};
    mockRun.mockImplementationOnce(
      () =>
        new Promise<JobResult>((r) => {
          resolveFirst = r;
        }),
    );
    useSession.setState({ tasks: [makeTask('a'), makeTask('b')] });
    useSession.getState().startAll();
    await flush();
    expect(mockRun).toHaveBeenCalledTimes(1);
    resolveFirst({ outputPath: 'out.mp3', fileName: 'out.mp3', sizeBytes: 1, elapsedMs: 1 });
    await vi.waitFor(() => {
      expect(mockRun).toHaveBeenCalledTimes(2);
    });
  });

  it('引擎失败 → 任务标记 failed 并带错误码', async () => {
    await useSession.getState().addFiles([source('a')]);
    await flush();
    mockRun.mockRejectedValue(makeEngineError('E_CORRUPT_FILE'));
    useSession.setState({ tasks: [makeTask('a')] });
    useSession.getState().startAll();
    await vi.waitFor(() => {
      const t = useSession.getState().tasks[0];
      expect(t.status).toBe('failed');
      expect(t.error?.code).toBe('E_CORRUPT_FILE');
    });
  });
});

function readyFile(id: string, params = defaultParamsFor('mp3')): SessionFile {
  return { source: source(id), probing: false, params };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('队列可靠性回归', () => {
  it('开始全部为新文件创建任务，重复点击不重复转换', async () => {
    useSession.setState({ files: [readyFile('a'), readyFile('b')] });
    useSession.getState().startAll();
    useSession.getState().startAll();
    await vi.waitFor(() =>
      expect(useSession.getState().tasks.every((t) => t.status === 'completed')).toBe(true),
    );
    expect(useSession.getState().tasks).toHaveLength(2);
    expect(mockRun).toHaveBeenCalledTimes(2);
    useSession.getState().startAll();
    await flush();
    expect(mockRun).toHaveBeenCalledTimes(2);
  });

  it.each(['pause', 'cancel', 'remove'] as const)('准备期间 %s 不得进入引擎', async (action) => {
    const init = deferred<object>();
    mockInitEngine.mockReturnValue(init.promise);
    useSession.setState({ files: [readyFile('a')] });
    await useSession.getState().startForFile('a');
    await vi.waitFor(() => expect(useSession.getState().tasks[0].status).toBe('preparing'));
    const id = useSession.getState().tasks[0].id;
    if (action === 'pause') useSession.getState().pauseTask(id);
    else if (action === 'cancel') useSession.getState().cancelTask(id);
    else useSession.getState().removeTask(id);
    init.resolve({});
    await flush();
    expect(mockRun).not.toHaveBeenCalled();
    expect(mockCancel).not.toHaveBeenCalled();
    if (action === 'remove') expect(useSession.getState().tasks).toHaveLength(0);
    else
      expect(useSession.getState().tasks[0].status).toBe(
        action === 'pause' ? 'paused' : 'cancelled',
      );
  });

  it.each(['invalid', 'missing'] as const)(
    '首任务 %s 失败后归还槽位并继续下一项',
    async (failure) => {
      useSettings.getState().update({ concurrency: 1 });
      const bad = makeTask('a');
      if (failure === 'invalid') bad.params.sampleRate = -1;
      useSession.setState({
        files: [...(failure === 'invalid' ? [readyFile('a')] : []), readyFile('b')],
        tasks: [bad, makeTask('b')],
      });
      useSession.getState().startAll();
      await vi.waitFor(() => expect(useSession.getState().tasks[1].status).toBe('completed'));
      expect(useSession.getState().tasks[0].error?.code).toBe(
        failure === 'invalid' ? 'E_INVALID_PARAM' : 'E_SOURCE_MISSING',
      );
      expect(mockRun).toHaveBeenCalledTimes(1);
    },
  );

  it('队列使用入队时参数快照，包括嵌套归一化配置', async () => {
    const init = deferred<object>();
    mockInitEngine.mockReturnValue(init.promise);
    const file = readyFile('a');
    useSession.setState({ files: [file] });
    await useSession.getState().startForFile('a');
    file.params.normalize.target = -23;
    useSession.getState().setFileParams('a', { format: 'flac', bitrateKbps: undefined });
    init.resolve({});
    await vi.waitFor(() => expect(mockRun).toHaveBeenCalledTimes(1));
    expect(mockRun.mock.calls[0][0].params).toMatchObject({
      format: 'mp3',
      normalize: { target: -14 },
    });
  });

  it('运行中重复启动单文件或终态任务不会二次执行', async () => {
    const running = deferred<JobResult>();
    mockRun.mockReturnValueOnce(running.promise);
    useSession.setState({ files: [readyFile('a')] });
    await useSession.getState().startForFile('a');
    await vi.waitFor(() => expect(mockRun).toHaveBeenCalledTimes(1));
    await useSession.getState().startForFile('a');
    expect(useSession.getState().tasks).toHaveLength(1);
    running.resolve({ outputPath: 'out', fileName: 'out.mp3', sizeBytes: 1, elapsedMs: 1 });
    await vi.waitFor(() => expect(useSession.getState().tasks[0].status).toBe('completed'));
    useSession.getState().startTask(useSession.getState().tasks[0].id);
    await flush();
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('移除执行中任务后，新任务仍遵守并发上限', async () => {
    useSettings.getState().update({ concurrency: 1 });
    const running = deferred<JobResult>();
    mockRun.mockReturnValueOnce(running.promise);
    useSession.setState({ files: [readyFile('a')] });
    await useSession.getState().startForFile('a');
    await vi.waitFor(() => expect(mockRun).toHaveBeenCalledTimes(1));
    useSession.getState().clearFiles();
    useSession.setState({ files: [readyFile('b')] });
    useSession.getState().startAll();
    await flush();
    expect(mockRun).toHaveBeenCalledTimes(1);
    running.reject(makeEngineError('E_CANCELLED'));
    await vi.waitFor(() => expect(mockRun).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(useSession.getState().tasks[0].status).toBe('completed'));
  });

  it('并发等待初始化的调用者都会收到失败，并允许重试', async () => {
    const init = deferred<object>();
    mockInitEngine.mockReturnValue(init.promise);
    const results = Promise.allSettled([
      useSession.getState().ensureEngine(),
      useSession.getState().ensureEngine(),
    ]);
    init.reject(makeEngineError('E_ENGINE_INIT'));
    expect((await results).map((r) => r.status)).toEqual(['rejected', 'rejected']);
    mockInitEngine.mockResolvedValue({});
    await useSession.getState().ensureEngine();
    expect(useSession.getState().engineState).toBe('ready');
  });

  it('同次导入去重，并采用合法的默认码率设置', async () => {
    useSettings.getState().update({ defaultBitrateKbps: 320 });
    await useSession.getState().addFiles([source('a', 'song.mp3'), source('b', 'song.mp3')]);
    await flush();
    expect(useSession.getState().files).toHaveLength(1);
    expect(useSession.getState().files[0].params.bitrateKbps).toBe(320);
  });

  it('迟到的探测不覆盖用户已选择的采样率与声道', async () => {
    const probe = deferred<ProbeResult>();
    mockProbe.mockReturnValueOnce(probe.promise);
    await useSession.getState().addFiles([source('a')]);
    await flush();
    useSession.getState().setFileParams('a', { sampleRate: 48000, channels: 1 });
    probe.resolve({
      format: 'mp3',
      codec: 'mp3',
      container: 'mp3',
      fileSizeBytes: 1000,
      tags: {},
      streamSummary: [],
      warnings: [],
      sampleRate: 44100,
      channels: 2,
    });
    await vi.waitFor(() => expect(useSession.getState().files[0].probing).toBe(false));
    expect(useSession.getState().files[0].params).toMatchObject({ sampleRate: 48000, channels: 1 });
  });
});
