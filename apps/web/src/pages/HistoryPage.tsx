/**
 * 转换历史页：搜索/状态/类型筛选 + 表格操作（重新执行/打开位置/删除/错误展开）。
 * Web 端历史记录不保留产物数据，因此不显示下载按钮（不放无效按钮）。
 */
import { useEffect, useMemo, useState } from 'react';
import { FORMATS } from '@audio-studio/shared';
import { useI18n, useT } from '../i18n';
import {
  useHistory,
  filterHistory,
  type HistoryRecord,
  type HistoryKindFilter,
  type HistoryStatusFilter,
} from '../stores/history';
import { reexecuteFromHistory } from '../stores/session';
import { toast } from '../stores/toast';
import { isDesktop, revealOutput } from '../platform';
import { fmtElapsed, fmtTime } from '../utils/format';
import {
  IconHistory,
  IconTrash,
  IconRefresh,
  IconExternal,
  IconWarning,
} from '../components/Icons';

export function HistoryPage() {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const S = lang === 'en' ? EN : ZH;

  const records = useHistory((s) => s.records);
  const loaded = useHistory((s) => s.loaded);
  const query = useHistory((s) => s.query);
  const statusFilter = useHistory((s) => s.statusFilter);
  const kindFilter = useHistory((s) => s.kindFilter);
  const setQuery = useHistory((s) => s.setQuery);
  const setStatusFilter = useHistory((s) => s.setStatusFilter);
  const setKindFilter = useHistory((s) => s.setKindFilter);
  const remove = useHistory((s) => s.remove);
  const clear = useHistory((s) => s.clear);
  const load = useHistory((s) => s.load);

  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () => filterHistory(records, query, statusFilter, kindFilter),
    [records, query, statusFilter, kindFilter],
  );

  const onClear = () => {
    if (!window.confirm(t('history.clearConfirm'))) return;
    void clear().then(() => toast.success(S.cleared));
  };

  const onReexecute = async (rec: HistoryRecord) => {
    const ok = await reexecuteFromHistory(rec);
    if (!ok) toast.warning(t('history.reexecuteUnavailable'));
  };

  const onReveal = (rec: HistoryRecord) => {
    const path = rec.outputPath;
    if (!path) return;
    void revealOutput(path).catch((e) => toast.error(S.openFailed, String(e)));
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('history.title')}</h1>
          <p className="page-desc">{t('history.desc')}</p>
        </div>
        <button className="btn btn-danger" onClick={onClear} disabled={!records.length}>
          {t('history.clearAll')}
        </button>
      </div>

      {/* 筛选栏 */}
      <div className="card">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(200px, 1fr) 160px 160px',
            gap: 'var(--sp-3)',
          }}
        >
          <input
            className="input"
            value={query}
            placeholder={t('history.searchPlaceholder')}
            aria-label={t('common.search')}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as HistoryStatusFilter)}
            aria-label={t('history.filterStatus')}
          >
            <option value="all">{S.statusAll}</option>
            <option value="completed">{t('status.completed')}</option>
            <option value="failed">{t('status.failed')}</option>
            <option value="cancelled">{t('status.cancelled')}</option>
          </select>
          <select
            className="select"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as HistoryKindFilter)}
            aria-label={t('history.filterKind')}
          >
            <option value="all">{S.kindAll}</option>
            <option value="convert">{t('history.kind.convert')}</option>
            <option value="trim">{t('history.kind.trim')}</option>
            <option value="merge">{t('history.kind.merge')}</option>
          </select>
        </div>
      </div>

      {/* 列表 */}
      {!loaded ? (
        <div className="card row" style={{ gap: 'var(--sp-3)' }}>
          <span className="spinner" />
          <span className="secondary">{t('common.loading')}</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">
              <IconHistory size={26} />
            </div>
            <div className="empty-title">
              {records.length === 0 ? t('history.empty') : S.noMatch}
            </div>
            <div className="empty-desc">
              {records.length === 0 ? t('history.emptyDesc') : S.noMatchDesc}
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{S.colTime}</th>
                  <th>{S.colKind}</th>
                  <th>{S.colSource}</th>
                  <th>{S.colTarget}</th>
                  <th>{S.colOutput}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('convert.elapsed')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((rec) => (
                  <HistoryRow
                    key={rec.id}
                    rec={rec}
                    expanded={expanded === rec.id}
                    onToggle={() => setExpanded(expanded === rec.id ? null : rec.id)}
                    onReexecute={() => void onReexecute(rec)}
                    onReveal={() => onReveal(rec)}
                    onDelete={() => void remove(rec.id)}
                    S={S}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

interface RowProps {
  rec: HistoryRecord;
  expanded: boolean;
  onToggle: () => void;
  onReexecute: () => void;
  onReveal: () => void;
  onDelete: () => void;
  S: typeof ZH;
}

function HistoryRow({ rec, expanded, onToggle, onReexecute, onReveal, onDelete, S }: RowProps) {
  const t = useT();
  const hasError = rec.status === 'failed' && !!rec.errorMessage;
  const kindLabel =
    rec.kind === 'convert'
      ? t('history.kind.convert')
      : rec.kind === 'trim'
        ? t('history.kind.trim')
        : t('history.kind.merge');
  const target = rec.targetFormat
    ? (FORMATS[rec.targetFormat as keyof typeof FORMATS]?.label ?? rec.targetFormat)
    : '--';

  return (
    <>
      <tr
        onClick={hasError ? onToggle : undefined}
        style={hasError ? { cursor: 'pointer' } : undefined}
      >
        <td className="xs mono" style={{ whiteSpace: 'nowrap', color: 'var(--fg-2)' }}>
          {fmtTime(rec.createdAt)}
        </td>
        <td>
          <span className="badge">{kindLabel}</span>
        </td>
        <td>
          <span
            className="truncate"
            style={{ display: 'inline-block', maxWidth: 220 }}
            title={rec.sourceLabel}
          >
            {rec.sourceLabel}
          </span>
        </td>
        <td>
          <span className="badge badge-accent">{target}</span>
        </td>
        <td>
          <span
            className="truncate mono xs"
            style={{ display: 'inline-block', maxWidth: 220 }}
            title={rec.fileName ?? rec.outputPath}
          >
            {rec.fileName ?? rec.outputPath ?? '--'}
          </span>
        </td>
        <td>
          <span
            className={`badge ${
              rec.status === 'completed'
                ? 'badge-success'
                : rec.status === 'failed'
                  ? 'badge-danger'
                  : 'badge-warning'
            }`}
          >
            {rec.status === 'completed'
              ? t('status.completed')
              : rec.status === 'failed'
                ? t('status.failed')
                : t('status.cancelled')}
          </span>
        </td>
        <td className="xs mono" style={{ whiteSpace: 'nowrap', color: 'var(--fg-2)' }}>
          {fmtElapsed(rec.elapsedMs)}
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <div className="row" style={{ gap: 6 }}>
            {isDesktop && rec.status === 'completed' && rec.outputPath && (
              <button className="btn btn-sm btn-ghost" onClick={onReveal} title={S.openLocation}>
                <IconExternal size={14} />
                {S.openLocation}
              </button>
            )}
            <button
              className="btn btn-sm btn-ghost"
              onClick={onReexecute}
              title={t('history.reexecute')}
            >
              <IconRefresh size={14} />
              {S.reexecuteShort}
            </button>
            {hasError && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={onToggle}
                title={t('history.error')}
                aria-expanded={expanded}
              >
                <IconWarning size={14} />
                {expanded ? S.hideError : S.showError}
              </button>
            )}
            <button
              className="btn btn-sm btn-ghost"
              onClick={onDelete}
              title={t('common.delete')}
              aria-label={t('common.delete')}
              style={{ color: 'var(--danger)' }}
            >
              <IconTrash size={14} />
            </button>
          </div>
        </td>
      </tr>
      {expanded && hasError && (
        <tr>
          <td colSpan={8} style={{ background: 'var(--bg-1)', padding: 'var(--sp-3)' }}>
            <div className="xs muted mb-2">{t('history.error')}</div>
            <div
              className="mono xs"
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: 'var(--fg-2)',
                maxHeight: 160,
                overflow: 'auto',
              }}
            >
              {rec.errorMessage}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const ZH = {
  statusAll: '全部状态',
  kindAll: '全部类型',
  colTime: '时间',
  colKind: '类型',
  colSource: '源文件',
  colTarget: '目标格式',
  colOutput: '输出文件',
  cleared: '历史已清空',
  openFailed: '打开失败',
  openLocation: '打开位置',
  reexecuteShort: '重跑',
  showError: '错误',
  hideError: '收起',
  noMatch: '没有匹配的记录',
  noMatchDesc: '试试调整搜索词或筛选条件',
};

const EN: typeof ZH = {
  statusAll: 'All statuses',
  kindAll: 'All types',
  colTime: 'Time',
  colKind: 'Type',
  colSource: 'Source',
  colTarget: 'Target',
  colOutput: 'Output',
  cleared: 'History cleared',
  openFailed: 'Failed to open',
  openLocation: 'Reveal',
  reexecuteShort: 'Re-run',
  showError: 'Error',
  hideError: 'Hide',
  noMatch: 'No matching records',
  noMatchDesc: 'Try adjusting the search or filters',
};

export default HistoryPage;
