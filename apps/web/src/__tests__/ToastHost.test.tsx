// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ToastHost } from '../components/ToastHost';
import { useToast, toast } from '../stores/toast';

beforeEach(() => {
  useToast.setState({ items: [] });
});
afterEach(cleanup);

describe('toast store', () => {
  it('push 添加条目并赋默认时长', () => {
    toast.info('标题', '消息');
    const items = useToast.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('info');
    expect(items[0].durationMs).toBe(4200);
  });

  it('error 默认时长更长', () => {
    toast.error('出错');
    expect(useToast.getState().items[0].durationMs).toBe(8000);
  });

  it('最多保留 5 条', () => {
    for (let i = 0; i < 8; i++) toast.info(`t${i}`);
    expect(useToast.getState().items).toHaveLength(5);
  });

  it('dismiss 移除指定条目', () => {
    toast.info('a');
    toast.info('b');
    const id = useToast.getState().items[0].id;
    useToast.getState().dismiss(id);
    expect(useToast.getState().items).toHaveLength(1);
    expect(useToast.getState().items[0].title).toBe('b');
  });
});

describe('ToastHost 渲染与无障碍', () => {
  it('无 toast 时不渲染', () => {
    const { container } = render(<ToastHost />);
    expect(container.querySelector('.toast-stack')).toBeNull();
  });

  it('容器有 status/polite 语义', () => {
    act(() => toast.success('完成', '文件已保存'));
    render(<ToastHost />);
    const stack = screen.getByRole('status');
    expect(stack).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('完成')).toBeInTheDocument();
    expect(screen.getByText('文件已保存')).toBeInTheDocument();
  });

  it('error toast 使用 alert/assertive', () => {
    act(() => toast.error('失败', '磁盘已满'));
    render(<ToastHost />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveTextContent('失败');
  });

  it('点击关闭按钮移除 toast', () => {
    act(() => toast.info('可关闭'));
    render(<ToastHost />);
    fireEvent.click(screen.getByRole('button', { name: /关闭|close/i }));
    expect(useToast.getState().items).toHaveLength(0);
  });
});
