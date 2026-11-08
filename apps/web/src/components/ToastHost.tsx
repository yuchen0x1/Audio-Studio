/** 全局 Toast 渲染层 */
import { useToast } from '../stores/toast';
import { IconClose, IconInfo, IconCheck, IconWarning } from './Icons';

const KIND_ICON = {
  info: IconInfo,
  success: IconCheck,
  warning: IconWarning,
  error: IconWarning,
} as const;

const KIND_COLOR = {
  info: 'var(--accent)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  error: 'var(--danger)',
} as const;

export function ToastHost() {
  const items = useToast((s) => s.items);
  const dismiss = useToast((s) => s.dismiss);
  if (!items.length) return null;

  return (
    <div className="toast-stack" role="region" aria-live="polite">
      {items.map((t) => {
        const Icon = KIND_ICON[t.kind];
        return (
          <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>
            <span style={{ color: KIND_COLOR[t.kind], marginTop: 2, flex: 'none' }}>
              <Icon size={16} />
            </span>
            <div className="grow">
              <div className="toast-title">{t.title}</div>
              {t.message && <div className="toast-msg">{t.message}</div>}
            </div>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              style={{ height: 22, width: 22, flex: 'none' }}
              onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}
              aria-label="close"
            >
              <IconClose size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
