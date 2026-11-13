/** 格式转换页：文件列表 + 单文件参数 + 任务执行与进度 */
import { useMemo, useState } from 'react';
import type { FormatId } from '@audio-studio/shared';
import { defaultParamsFor, paramsForPreset } from '@audio-studio/shared';
import { useSession, type SessionFile, type SessionTask } from '../stores/session';
import { useI18n, useT } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { FormatSelect } from '../components/FormatSelect';
import { ParamPanel } from '../components/ParamPanel';
import { PresetPicker } from '../components/PresetPicker';
import { TaskRow } from '../components/TaskRow';
import { Modal } from '../components/Modal';
import { fmtDuration, fmtSize, fmtBitrate, fmtSampleRate, fmtChannels } from '../utils/format';
import { toast } from '../stores/toast';
import { deliverAll, isDesktop } from '../platform';
import {
  IconMusic,
  IconClose,
  IconPlay,
  IconTrash,
  IconDownload,
  IconEdit,
} from '../components/Icons';

export function ConvertPage() {
  const lang = useI18n((s) => s.lang);
  const zh = lang !== 'en';
  const files = useSession((s) => s.files);
  const tasks = useSession((s) => s.tasks);
  const addFiles = useSession((s) => s.addFiles);
  const removeFile = useSession((s) => s.removeFile);
  const clearFiles = useSession((s) => s.clearFiles);
  const startForFile = useSession((s) => s.startForFile);
  const startAll = useSession((s) => s.startAll);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [bulkFormat, setBulkFormat] = useState<FormatId | null>(null);
  const applyFormatToAll = useSession((s) => s.applyFormatToAll);

  const editing = files.find((f) => f.source.id === editingId);

  const convertTasks = useMemo(() => tasks.filter((t) => t.kind === 'convert'), [tasks]);
  const pendingFiles = useMemo(
    () =>
      files.filter(
        (f) =>
          !convertTasks.some(
            (t) => t.fileId === f.source.id && !['failed', 'cancelled'].includes(t.status),
          ),
      ),
    [files, convertTasks],
  );
  const completedTasks = useMemo(
    () => convertTasks.filter((t) => t.status === 'completed' && t.result),
    [convertTasks],
  );

  const downloadAll = async () => {
    const list = completedTasks.map((t) => t.result!);
    if (!list.length) return;
    if (isDesktop) {
      toast.info(zh ? '文件已写入输出目录' : 'Files saved to output folder', list[0].outputPath);
      return;
    }
    const ok = await deliverAll(list);
    toast.success(zh ? '已开始下载' : 'Download started', `${ok}/${list.length}`);
  };

  return (
    <div className="page-container wide">
      {/* 导入区 */}
      <Dropzone
        compact
        onFiles={(s) => void addFiles(s)}
        title={zh ? '拖入音频文件或点击选择' : 'Drop audio files or click to choose'}
        sub={
          zh
            ? '支持 MP3 / WAV / FLAC / AAC / M4A / OGG / OPUS 等格式'
            : 'MP3 / WAV / FLAC / AAC / M4A / OGG / OPUS and more'
        }
      />

      {/* 批量格式（多文件时显示） */}
      {files.length > 1 && (
        <div className="card-flat row-between" style={{ flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
          <div className="row" style={{ gap: 'var(--sp-3)', flex: '1 1 260px' }}>
            <span className="small bold">{zh ? '统一目标格式' : 'Target format for all'}</span>
            <div style={{ width: 240 }}>
              <FormatSelect
                value={bulkFormat ?? files[0]?.params.format ?? 'mp3'}
                onChange={(id) => setBulkFormat(id)}
              />
            </div>
            <button
              className="btn btn-sm"
              onClick={() => {
                if (bulkFormat) {
                  applyFormatToAll(bulkFormat);
                  toast.success(zh ? '已应用到全部文件' : 'Applied to all files');
                }
              }}
              disabled={!bulkFormat}
            >
              {zh ? '应用到全部' : 'Apply to all'}
            </button>
          </div>
          <div className="row" style={{ gap: 'var(--sp-2)' }}>
            <button
              className="btn btn-sm"
              onClick={() => void startAll()}
              disabled={
                !pendingFiles.length &&
                !convertTasks.some((t) => ['queued', 'paused'].includes(t.status))
              }
            >
              <IconPlay size={13} /> {zh ? '开始全部' : 'Start all'}
            </button>
            <button
              className="btn btn-sm btn-danger"
              onClick={() => clearFiles()}
              disabled={!files.length}
            >
              <IconTrash size={13} /> {zh ? '清空列表' : 'Clear'}
            </button>
          </div>
        </div>
      )}

      {/* 文件列表 */}
      {files.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <IconMusic size={26} />
          </div>
          <div className="empty-title">{zh ? '还没有添加文件' : 'No files added yet'}</div>
          <div className="empty-desc">
            {zh
              ? '拖入文件或点击选择，可一次添加多个文件进行批量转换'
              : 'Drop files or click to choose — add multiple files for batch conversion'}
          </div>
        </div>
      ) : (
        <div className="col" style={{ gap: 'var(--sp-3)' }}>
          {files.map((f) => (
            <FileRow
              key={f.source.id}
              file={f}
              tasks={convertTasks.filter((t) => t.fileId === f.source.id)}
              onRemove={() => removeFile(f.source.id)}
              onEdit={() => setEditingId(f.source.id)}
              onStart={() => void startForFile(f.source.id)}
            />
          ))}
        </div>
      )}

      {/* 任务进度 */}
      {convertTasks.length > 0 && (
        <section>
          <div className="row-between mb-3">
            <h2 style={{ fontSize: 'var(--fs-lg)' }}>{zh ? '转换任务' : 'Conversion tasks'}</h2>
            <div className="row" style={{ gap: 'var(--sp-2)' }}>
              <button
                className="btn btn-sm"
                onClick={() => void downloadAll()}
                disabled={!completedTasks.length}
              >
                <IconDownload size={13} /> {zh ? '全部下载' : 'Download all'}
              </button>
            </div>
          </div>
          <div className="col" style={{ gap: 'var(--sp-2)' }}>
            {convertTasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        </section>
      )}

      {/* 参数编辑弹窗 */}
      <Modal
        open={!!editing}
        title={
          <span className="truncate" style={{ maxWidth: 420 }}>
            <IconEdit size={15} style={{ marginRight: 8, verticalAlign: -2 }} />
            {editing?.source.name}
          </span>
        }
        onClose={() => setEditingId(null)}
        width={640}
        footer={
          <button className="btn btn-primary" onClick={() => setEditingId(null)}>
            {zh ? '完成' : 'Done'}
          </button>
        }
      >
        {editing && <FileDetail file={editing} />}
      </Modal>
    </div>
  );
}

function FileRow({
  file,
  tasks,
  onRemove,
  onEdit,
  onStart,
}: {
  file: SessionFile;
  tasks: SessionTask[];
  onRemove: () => void;
  onEdit: () => void;
  onStart: () => void;
}) {
  const lang = useI18n((s) => s.lang);
  const zh = lang !== 'en';
  const t = useT();
  const p = file.probe;
  const latest = tasks[tasks.length - 1];
  const running = latest && ['queued', 'preparing', 'running', 'paused'].includes(latest.status);
  const done = latest?.status === 'completed';

  return (
    <div className="file-row">
      <div className="file-icon">
        <IconMusic size={19} />
      </div>

      <div className="grow" style={{ minWidth: 0 }}>
        <div className="truncate bold small" title={file.source.name}>
          {file.source.name}
        </div>
        <div className="file-meta">
          {file.probing ? (
            <span style={{ color: 'var(--accent)' }}>{zh ? '分析中…' : 'Analyzing…'}</span>
          ) : file.probeError ? (
            <span style={{ color: 'var(--danger)' }}>{file.probeError}</span>
          ) : p ? (
            <>
              <span>{p.format?.toUpperCase() ?? p.container}</span>
              {p.durationMs !== undefined && <span>{fmtDuration(p.durationMs)}</span>}
              {p.sampleRate && <span>{fmtSampleRate(p.sampleRate)}</span>}
              {p.channels && <span>{fmtChannels(p.channels, p.channelLayout)}</span>}
              {p.bitrateKbps && <span>{fmtBitrate(p.bitrateKbps)}</span>}
              <span>{fmtSize(file.source.sizeBytes || p.fileSizeBytes)}</span>
              {p.extensionMismatch && (
                <span style={{ color: 'var(--warning)' }}>
                  {zh ? '扩展名与实际格式不一致' : 'Extension mismatch'}
                </span>
              )}
            </>
          ) : (
            <span>—</span>
          )}
        </div>
      </div>

      {/* 目标格式徽章 */}
      <span className="badge badge-accent" style={{ flex: 'none' }}>
        → {file.params.format.toUpperCase()}
      </span>

      {latest && (
        <span
          className={`badge ${done ? 'badge-success' : running ? 'badge-accent' : latest.status === 'failed' ? 'badge-danger' : ''}`}
          style={{ flex: 'none', minWidth: 56, justifyContent: 'center' }}
        >
          {done
            ? '100%'
            : running
              ? `${Math.round(latest.progress.ratio * 100)}%`
              : latest.status === 'failed'
                ? zh
                  ? '失败'
                  : 'Fail'
                : ''}
        </span>
      )}

      <div className="row" style={{ gap: 4, flex: 'none' }}>
        <button
          className="btn btn-sm"
          onClick={onEdit}
          title={zh ? '参数' : 'Params'}
          aria-label={t('aria.editParams')}
        >
          <IconEdit size={13} />
        </button>
        <button className="btn btn-primary btn-sm" onClick={onStart} disabled={running}>
          {running ? (
            zh ? (
              '执行中'
            ) : (
              'Running'
            )
          ) : (
            <>
              <IconPlay size={13} /> {zh ? '转换' : 'Convert'}
            </>
          )}
        </button>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={onRemove}
          title={zh ? '移除' : 'Remove'}
          aria-label={t('common.remove')}
        >
          <IconClose size={14} />
        </button>
      </div>
    </div>
  );
}

function FileDetail({ file }: { file: SessionFile }) {
  const lang = useI18n((s) => s.lang);
  const zh = lang !== 'en';
  const setFileParams = useSession((s) => s.setFileParams);
  const p = file.probe;

  return (
    <div className="col" style={{ gap: 'var(--sp-5)' }}>
      {/* 源信息 */}
      <div className="card-flat">
        <div className="field-label mb-2">{zh ? '源文件信息' : 'Source info'}</div>
        {p ? (
          <div className="kv">
            <dt>{zh ? '格式' : 'Format'}</dt>
            <dd>
              {p.format?.toUpperCase() ?? p.container} · {p.codec}
              {p.codecLongName ? ` (${p.codecLongName})` : ''}
            </dd>
            <dt>{zh ? '时长' : 'Duration'}</dt>
            <dd className="mono">{fmtDuration(p.durationMs)}</dd>
            <dt>{zh ? '采样率' : 'Sample rate'}</dt>
            <dd className="mono">{fmtSampleRate(p.sampleRate)}</dd>
            <dt>{zh ? '声道' : 'Channels'}</dt>
            <dd>{fmtChannels(p.channels, p.channelLayout)}</dd>
            {p.bitDepth !== undefined && (
              <>
                <dt>{zh ? '位深度' : 'Bit depth'}</dt>
                <dd className="mono">
                  {p.bitDepth === 'f32' ? '32-bit Float' : `${p.bitDepth}-bit`}
                </dd>
              </>
            )}
            <dt>{zh ? '码率' : 'Bitrate'}</dt>
            <dd className="mono">{fmtBitrate(p.bitrateKbps)}</dd>
            <dt>{zh ? '大小' : 'Size'}</dt>
            <dd className="mono">{fmtSize(p.fileSizeBytes)}</dd>
          </div>
        ) : file.probeError ? (
          <div className="callout danger">{file.probeError}</div>
        ) : (
          <div className="row">
            <span className="spinner" />{' '}
            <span className="small muted">{zh ? '分析中…' : 'Analyzing…'}</span>
          </div>
        )}
      </div>

      {/* 参数 */}
      <div className="card-flat">
        <p className="field-hint">
          {zh
            ? '修改用于下一次入队；现有任务保持入队时的参数。'
            : 'Edits apply when next queued. Existing jobs keep their queued settings.'}
        </p>
        <PresetPicker
          onSelect={(id) =>
            setFileParams(file.source.id, paramsForPreset(id, file.params, file.probe))
          }
        />
        <FormatSelect
          value={file.params.format}
          onChange={(id) => {
            // 切换格式 → 用该格式默认参数重建，保留文件名模板
            const next = defaultParamsFor(id);
            next.filenameTemplate = file.params.filenameTemplate;
            setFileParams(file.source.id, next);
          }}
        />
        <hr className="divider" />
        <ParamPanel
          params={file.params}
          onChange={(patch) => setFileParams(file.source.id, patch)}
        />
      </div>

      {file.estimate && file.estimate.warnings.length > 0 && (
        <div className="callout warning">
          <strong>{zh ? '资源预检：' : 'Resource check: '}</strong>
          {file.estimate.warnings.join('；')}
        </div>
      )}
    </div>
  );
}
