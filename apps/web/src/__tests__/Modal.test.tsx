// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Modal } from '../components/Modal';

afterEach(cleanup);

describe('Modal 无障碍与交互', () => {
  it('open=false 时不渲染', () => {
    const { container } = render(
      <Modal open={false} title="标题" onClose={() => {}}>
        内容
      </Modal>,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('渲染 dialog 语义并关联标题', () => {
    render(
      <Modal open title="设置" onClose={() => {}}>
        内容
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)).toHaveTextContent('设置');
  });

  it('关闭按钮有可访问名称并触发 onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal open title="T" onClose={onClose}>
        x
      </Modal>,
    );
    const btn = screen.getByRole('button', { name: /关闭|close/i });
    fireEvent.click(btn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape 关闭', () => {
    const onClose = vi.fn();
    render(
      <Modal open title="T" onClose={onClose}>
        x
      </Modal>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('点击遮罩关闭，点击内容不关闭', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open title="T" onClose={onClose}>
        <button>内部按钮</button>
      </Modal>,
    );
    fireEvent.mouseDown(screen.getByRole('button', { name: '内部按钮' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(container.querySelector('.modal-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('渲染 footer 与 children', () => {
    render(
      <Modal open title="T" onClose={() => {}} footer={<button>确定</button>}>
        <p>正文</p>
      </Modal>,
    );
    expect(screen.getByText('正文')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确定' })).toBeInTheDocument();
  });
});
