/** 批量转换页：批量参数 + 任务队列 + 并发控制 */
import { useMemo, useState } from 'react';
import {
  defaultParamsFor,
  paramsForPreset,
  type EncodeParams,
  type FormatId,
} from '@audio-studio/shared';
import { useSession } from '../stores/session';
import { useSettings } from '../stores/settings';
import { useI18n } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { FormatSelect } from '../components/FormatSelect';
import { ParamPanel } from '../components/ParamPanel';
import { PresetPicker } from '../components/PresetPicker';
import { TaskRow } from '../components/TaskRow';
import { toast } from '../stores/toast';
import { setEngineConcurrency } from '../engine';
import {
  IconPlay,
  IconPause,
  IconClose,
  IconRefresh,
  IconTrash,
  IconBatch,
} from '../components/Icons';

export function BatchPage() {
  const lang = useI18n((s) => s.lang);
  const zh = lang !== 'en';
  const files = useSession((s) => s.files);
  const tasks = useSession((s) => s.tasks);
  const addFiles = useSession((s) => s.addFiles);
  const applyFormatToAll = useSession((s) => s.applyFormatToAll);
  const applyParamsToAll = useSession((s) => s.applyParamsToAll);
  const startAll = useSession((s) => s.startAll);
  const clearCompleted = useSession((s) => s.clearCompleted);
  const clearFiles = useSession((s) => s.clearFiles);
  const concurrency = useSettings((s) => s.concurrency);
  const updateSettings = useSettings((s) => s.update);

  const [batchParams, setBatchParams] = useState<EncodeParams>(() => ({
    ...defaultParamsFor(files[0]?.params.format ?? useSettings.getState().defaultFormat),
    filenameTemplate: useSettings.getState().filenameTemplate,
  }));
  const batchFormat = batchParams.format;
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const setBatchFormat = (format: FormatId) =>
    setBatchParams((previous) => ({
      ...defaultParamsFor(format),
      filenameTemplate: previous.filenameTemplate,
    }));
  const updateBatchParams = (patch: Partial<EncodeParams>) => {
    setBatchParams((previous) => ({ ...previous, ...patch }));
  };

  const queue = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (statusFilter === 'all' ||
            (statusFilter === 'active'
              ? ['preparing', 'running'].includes(t.status)
              : t.status === statusFilter)) &&
          t.sourceLabel.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
      ),
    [tasks, statusFilter, query],
  );
  const counts = useMemo(
    () => ({
      queued: tasks.filter((t) => t.status === 'queued').length,
      running: tasks.filter((t) => t.status === 'running' || t.status === 'preparing').length,
      paused: tasks.filter((t) => t.status === 'paused').length,
      done: tasks.filter((t) => t.status === 'completed').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
    }),
    [tasks],
  );

  const pauseAll = () => {
    for (const t of tasks) {
      if (['queued', 'running', 'preparing'].includes(t.status))
        useSession.getState().pauseTask(t.id);
    }
  };

  const cancelAll = () => {
    for (const t of tasks) {
      if (['queued', 'running', 'preparing', 'paused'].includes(t.status))
        useSession.getState().cancelTask(t.id);
    }
  };

  const retryFailed = () => {
    for (const t of tasks) {
      if (t.status === 'failed') useSession.getState().retryTask(t.id);
    }
  };

  const setConcurrency = (n: number) => {
    const v = Math.max(1, Math.min(4, n));
    updateSettings({ concurrency: v });
    setEngineConcurrency(v);
  };

  const pending = files.filter(
    (f) =>
      !tasks.some((t) => t.fileId === f.source.id && !['failed', 'cancelled'].includes(t.status)),
  );

  const queueAll = () => {
    // 为每个尚未入队的文件创建任务并武装
    void (async () => {
      for (const f of pending) {
        await useSession.getState().startForFile(f.source.id);
      }
      if (pending.length) toast.success(zh ? '已加入队列' : 'Queued', `${pending.length}`);
    })();
  };

  return (
    <div className="page-container wide">
      <div className="page-header">
        <div>
          <h1>{zh ? '批量转换' : 'Batch convert'}</h1>
          <div className="page-desc">
            {zh
              ? '多文件队列执行，进度与状态均为引擎真实上报'
              : 'Queue multiple files with real engine-reported progress'}
          </div>
        </div>
        <div className="row" style={{ gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={queueAll} disabled={!pending.length}>
            <IconPlay size={13} /> {zh ? '全部入队' : 'Queue all'}
          </button>
          <button
            className="btn btn-sm"
            onClick={startAll}
            disabled={!counts.queued && !counts.paused}
          >
            <IconPlay size={13} /> {zh ? '开始' : 'Start'}
          </button>
          <button
            className="btn btn-sm"
            onClick={pauseAll}
            disabled={!counts.running && !counts.queued}
          >
            <IconPause size={13} /> {zh ? '暂停' : 'Pause'}
          </button>
          <button
            className="btn btn-sm btn-danger"
            onClick={cancelAll}
            disabled={!counts.queued && !counts.running && !counts.paused}
          >
            <IconClose size={13} /> {zh ? '取消全部' : 'Cancel all'}
          </button>
          <button className="btn btn-sm" onClick={retryFailed} disabled={!counts.failed}>
            <IconRefresh size={13} /> {zh ? '重试失败' : 'Retry failed'}
          </button>
          <button className="btn btn-sm" onClick={clearCompleted} disabled={!counts.done}>
            <IconTrash size={13} /> {zh ? '清除已完成' : 'Clear done'}
          </button>
        </div>
      </div>

      {/* 批量参数 */}
      <section className="card">
        <div className="card-title">
          <IconBatch size={16} />{' '}
          {zh ? '批量参数（应用到全部文件）' : 'Batch parameters (apply to all)'}
        </div>
        <PresetPicker
          onSelect={(id) => {
            const next = paramsForPreset(id, batchParams);
            setBatchParams(next);
            for (const file of files) {
              useSession
                .getState()
                .setFileParams(file.source.id, paramsForPreset(id, file.params, file.probe));
            }
            toast.success(zh ? '预设已应用到全部文件' : 'Preset applied to all files');
          }}
        />
        <div
          className="row"
          style={{ gap: 'var(--sp-4)', alignItems: 'flex-end', flexWrap: 'wrap' }}
        >
          <div style={{ width: 260, maxWidth: '100%' }}>
            <FormatSelect value={batchFormat} onChange={setBatchFormat} id="batch-fmt" />
          </div>
          <button
            className="btn"
            onClick={() => {
              applyFormatToAll(batchFormat);
              applyParamsToAll(batchParams);
              toast.success(zh ? '参数已应用到全部文件' : 'Parameters applied to all files');
            }}
            disabled={!files.length}
          >
            {zh ? '应用参数到全部' : 'Apply parameters to all'}
          </button>
        </div>
        <hr className="divider" />
        <div className="grid-2">
          <div className="field">
            <span className="field-label">
              {zh ? '同时应用的参数（可选）' : 'Extra params to apply (optional)'}
            </span>
            <span className="field-hint">
              {zh
                ? '调整后点击“应用参数到全部”。入队后参数固定，新文件请重新应用。'
                : 'Click “Apply parameters to all” after editing. Queued settings stay fixed; reapply for new files.'}
            </span>
          </div>
        </div>
        <ParamPanel params={batchParams} onChange={updateBatchParams} showNaming={false} />
        <div className="mt-3 row" style={{ gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <label className="field-label" htmlFor="batch-concurrency" style={{ margin: 0 }}>
            {zh ? '并行任务数' : 'Parallel tasks'}
            <span className="xs muted">{zh ? '（Web 建议 1-2）' : '(Web: 1-2 recommended)'}</span>
          </label>
          <input
            className="range"
            style={{ width: 140 }}
            type="range"
            id="batch-concurrency"
            min={1}
            max={4}
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value))}
          />
          <span className="badge badge-accent mono">{concurrency}</span>
        </div>
      </section>

      {/* 导入 */}
      <Dropzone
        compact
        onFiles={(s) => void addFiles(s)}
        title={zh ? '继续添加文件到队列' : 'Add more files to the queue'}
        sub={zh ? '支持多选与文件夹拖入' : 'Multi-select and folder drop supported'}
      />

      {/* 摘要 */}
      <section
        className="grid-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}
      >
        <div className="stat-card">
          <span className="stat-value">{counts.queued}</span>
          <span className="stat-label">{zh ? '等待' : 'Queued'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--accent)' }}>
            {counts.running}
          </span>
          <span className="stat-label">{zh ? '执行中' : 'Running'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--success)' }}>
            {counts.done}
          </span>
          <span className="stat-label">{zh ? '完成' : 'Done'}</span>
        </div>
        <div className="stat-card">
          <span
            className="stat-value"
            style={{ color: counts.failed ? 'var(--danger)' : undefined }}
          >
            {counts.failed}
          </span>
          <span className="stat-label">{zh ? '失败' : 'Failed'}</span>
        </div>
      </section>

      {/* 队列 */}
      <section>
        <h2 className="mb-3" style={{ fontSize: 'var(--fs-lg)' }}>
          {zh ? '任务队列' : 'Task queue'}
        </h2>
        <div className="queue-filters">
          <label className="field grow">
            <span className="field-label">{zh ? '搜索文件名' : 'Search filenames'}</span>
            <input
              className="input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={zh ? '输入文件名…' : 'Type a filename…'}
            />
          </label>
          <label className="field">
            <span className="field-label">{zh ? '任务状态' : 'Task status'}</span>
            <select
              className="select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {[
                ['all', zh ? '全部' : 'All'],
                ['queued', zh ? '等待' : 'Queued'],
                ['active', zh ? '执行中' : 'Running'],
                ['paused', zh ? '已暂停' : 'Paused'],
                ['completed', zh ? '已完成' : 'Completed'],
                ['failed', zh ? '失败' : 'Failed'],
                ['cancelled', zh ? '已取消' : 'Cancelled'],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <span className="xs muted" role="status">
            {queue.length} / {tasks.length}
          </span>
        </div>
        {queue.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconBatch size={26} />
            </div>
            <div className="empty-title">
              {tasks.length
                ? zh
                  ? '没有匹配的任务'
                  : 'No matching tasks'
                : zh
                  ? '队列为空'
                  : 'Queue is empty'}
            </div>
            <div className="empty-desc">
              {tasks.length
                ? zh
                  ? '更换搜索词或状态筛选'
                  : 'Change the search or status filter'
                : zh
                  ? '添加文件后点击"全部入队"'
                  : 'Add files, then hit "Queue all"'}
            </div>
          </div>
        ) : (
          <div className="col" style={{ gap: 'var(--sp-2)' }}>
            {queue.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        )}
      </section>

      {/* 清空 */}
      {files.length > 0 && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button
            className="btn btn-sm btn-danger"
            onClick={() => {
              clearFiles();
              toast.info(zh ? '已清空文件与任务' : 'Files and tasks cleared');
            }}
          >
            <IconTrash size={13} /> {zh ? '清空全部文件' : 'Remove all files'}
          </button>
        </div>
      )}
    </div>
  );
}
