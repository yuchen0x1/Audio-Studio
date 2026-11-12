/** 通用模态框：ESC 关闭、点击遮罩关闭、焦点陷阱与焦点还原 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconClose } from './Icons';
import { useT } from '../i18n';

export interface ModalProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, title, onClose, children, footer, width }: ModalProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // onClose 多为内联函数：存入 ref，避免父级每次渲染都重置焦点
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      // Tab 焦点陷阱：始终在弹窗内循环
      const items = focusables();
      if (!items.length) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = node.contains(active);
      if (e.shiftKey && (active === first || active === node || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    // 焦点进弹窗，关闭时还原到触发元素
    const prev = document.activeElement as HTMLElement | null;
    const timer = setTimeout(() => {
      (focusables()[0] ?? node)?.focus();
    }, 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(timer);
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={ref}
        tabIndex={-1}
        style={width ? { width: `min(${width}px, 100%)` } : undefined}
      >
        <div className="modal-header">
          <h3 id={titleId}>{title}</h3>
          <button
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <IconClose size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
