/** 首页：拖放导入 + 快速入口 + 会话统计 + 最近转换 + 引擎状态 */
import { useEffect, useMemo } from 'react';
import { useSession } from '../stores/session';
import { useHistory } from '../stores/history';
import { useNav } from '../stores/nav';
import { useI18n } from '../i18n';
import { fmtTime, fmtSize } from '../utils/format';
import { Dropzone } from '../components/Dropzone';
import {
  IconConvert, IconBatch, IconClip, IconMerge, IconAnalyze, IconMetadata,
  IconHistory, IconShield, IconCpu, IconChevronRight,
} from '../components/Icons';
import type { PageId } from '../stores/nav';
import type { AudioSource } from '@audio-studio/shared';

export function HomePage() {
  const lang = useI18n((s) => s.lang);
  const zh = lang !== 'en';
  const goto = useNav((s) => s.goto);
  const addFiles = useSession((s) => s.addFiles);
  const files = useSession((s) => s.files);
  const tasks = useSession((s) => s.tasks);
  const engineState = useSession((s) => s.engineState);
  const records = useHistory((s) => s.records);
  const loadHistory = useHistory((s) => s.load);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const stats = useMemo(() => ({
    total: tasks.length,
    done: tasks.filter((t) => t.status === 'completed').length,
    files: files.length,
  }), [tasks, files]);

  const recent = useMemo(() => records.slice(0, 6), [records]);

  const onDrop = async (sources: AudioSource[]) => {
    await addFiles(sources);
    goto('convert');
  };

  const quick: Array<{ id: PageId; icon: typeof IconConvert; title: string; desc: string }> = [
    { id: 'convert', icon: IconConvert, title: zh ? '格式转换' : 'Convert', desc: zh ? '13 种格式互转' : '13 formats' },
    { id: 'batch', icon: IconBatch, title: zh ? '批量转换' : 'Batch', desc: zh ? '多文件队列' : 'Queue multiple' },
    { id: 'clip', icon: IconClip, title: zh ? '音频剪辑' : 'Clip', desc: zh ? '波形裁剪分割' : 'Waveform cutting' },
    { id: 'merge', icon: IconMerge, title: zh ? '音频合并' : 'Merge', desc: zh ? '多段拼接' : 'Join segments' },
    { id: 'analyze', icon: IconAnalyze, title: zh ? '音频分析' : 'Analyze', desc: zh ? '真实文件信息' : 'Real file info' },
    { id: 'metadata', icon: IconMetadata, title: zh ? '元数据编辑' : 'Metadata', desc: zh ? '标签与封面' : 'Tags & cover' },
  ];

  return (
    <div className="page-container">
      {/* Hero */}
      <section style={{ textAlign: 'center', padding: 'var(--sp-6) 0 var(--sp-2)' }}>
        <h1 style={{ fontSize: 'var(--fs-3xl)', letterSpacing: '-0.03em' }}>
          {zh ? '把声音，变成你需要的样子' : 'Shape your sound, your way'}
        </h1>
        <p className="muted" style={{ maxWidth: 640, margin: 'var(--sp-3) auto 0', fontSize: 'var(--fs-md)' }}>
          {zh
            ? 'MP3 / WAV / FLAC / AAC / OGG / OPUS 等 13 种格式互转，剪辑、合并、分析与元数据编辑。所有处理均在本地完成，音频不会上传。'
            : 'Convert between 13 formats incl. MP3 / WAV / FLAC / AAC / OGG / OPUS, plus clipping, merging, analysis and metadata editing. Everything runs locally — audio never leaves your device.'}
        </p>
      </section>

      {/* 导入 */}
      <Dropzone onFiles={(s) => void onDrop(s)} />

      {/* 快速入口 */}
      <section>
        <div className="row-between mb-3">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{zh ? '快速开始' : 'Quick start'}</h2>
        </div>
        <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {quick.map((q) => {
            const Icon = q.icon;
            return (
              <button key={q.id} className="quick-card" onClick={() => goto(q.id)}>
                <div className="qc-icon"><Icon size={20} /></div>
                <div className="qc-title">{q.title}</div>
                <div className="qc-desc">{q.desc}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 统计 + 引擎 */}
      <section className="grid-3">
        <div className="stat-card">
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">{zh ? '本次会话任务' : 'Session tasks'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--success)' }}>{stats.done}</span>
          <span className="stat-label">{zh ? '已完成' : 'Completed'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.files}</span>
          <span className="stat-label">{zh ? '已添加文件' : 'Files added'}</span>
        </div>
      </section>

      <section className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {/* 引擎状态 */}
        <div className="card">
          <div className="card-title"><IconCpu size={16} /> {zh ? '音频引擎' : 'Audio engine'}</div>
          <div className="kv">
            <dt>{zh ? '状态' : 'Status'}</dt>
            <dd>
              <span className={`status-dot ${engineState === 'ready' ? 'ok' : engineState === 'error' ? 'err' : engineState === 'initializing' ? 'busy' : ''}`}>
                {engineState === 'ready' ? (zh ? '就绪' : 'Ready')
                  : engineState === 'error' ? (zh ? '异常' : 'Error')
                  : engineState === 'initializing' ? (zh ? '初始化中' : 'Initializing')
                  : (zh ? '空闲（导入文件时自动初始化）' : 'Idle (initializes on first import)')}
              </span>
            </dd>
            <dt>{zh ? '处理方式' : 'Processing'}</dt>
            <dd><span className="row" style={{ gap: 6 }}><IconShield size={14} style={{ color: 'var(--success)' }} /> {zh ? '100% 本地 · 不上传' : '100% local · no upload'}</span></dd>
            <dt>{zh ? '输出格式' : 'Output'}</dt>
            <dd>MP3 · WAV · FLAC · AAC · M4A · OGG · OPUS · WMA · AIFF · APE · AC3 · AMR · ALAC</dd>
          </div>
        </div>

        {/* 最近转换 */}
        <div className="card">
          <div className="card-title">
            <IconHistory size={16} />
            {zh ? '最近转换' : 'Recent conversions'}
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => goto('history')}>
              {zh ? '全部' : 'All'} <IconChevronRight size={13} />
            </button>
          </div>
          {recent.length === 0 ? (
            <div className="muted small" style={{ padding: 'var(--sp-6) 0', textAlign: 'center' }}>
              {zh ? '还没有转换记录' : 'No conversions yet'}
            </div>
          ) : (
            <div className="col" style={{ gap: 'var(--sp-2)' }}>
              {recent.map((r) => (
                <div key={r.id} className="row-between" style={{ gap: 'var(--sp-3)' }}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="truncate small bold" title={r.sourceLabel}>{r.sourceLabel}</div>
                    <div className="xs muted">
                      {r.sourceFormat?.toUpperCase() ?? '?'} → {r.targetFormat?.toUpperCase() ?? '?'}
                      {r.sizeBytes ? ` · ${fmtSize(r.sizeBytes)}` : ''}
                    </div>
                  </div>
                  <span className={`badge ${r.status === 'completed' ? 'badge-success' : r.status === 'failed' ? 'badge-danger' : ''}`}>
                    {r.status === 'completed' ? '✓' : r.status === 'failed' ? '✕' : '—'}
                  </span>
                  <span className="xs muted mono" style={{ flex: 'none' }}>{fmtTime(r.finishedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
