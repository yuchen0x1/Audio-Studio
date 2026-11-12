/** 全局 Toast 渲染层 */
import { useToast } from '../stores/toast';
import { useT } from '../i18n';
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
  const t = useT();
  const items = useToast((s) => s.items);
  const dismiss = useToast((s) => s.dismiss);
  if (!items.length) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map((toast) => {
        const Icon = KIND_ICON[toast.kind];
        const assertive = toast.kind === 'error';
        return (
          <div
            key={toast.id}
            className={`toast ${toast.kind}`}
            role={assertive ? 'alert' : undefined}
            aria-live={assertive ? 'assertive' : undefined}
            onClick={() => dismiss(toast.id)}
          >
            <span style={{ color: KIND_COLOR[toast.kind], marginTop: 2, flex: 'none' }}>
              <Icon size={16} />
            </span>
            <div className="grow">
              <div className="toast-title">{toast.title}</div>
              {toast.message && <div className="toast-msg">{toast.message}</div>}
            </div>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              style={{ height: 22, width: 22, flex: 'none' }}
              onClick={(e) => {
                e.stopPropagation();
                dismiss(toast.id);
              }}
              aria-label={t('common.close')}
            >
              <IconClose size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
