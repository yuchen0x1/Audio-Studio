// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../components/ErrorBoundary';

function Broken(): JSX.Element {
  throw new Error('render exploded');
}

describe('ErrorBoundary', () => {
  it('renders a recovery surface instead of propagating a render error', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Audio Studio 遇到异常');
    expect(screen.getByText('render exploded')).toBeTruthy();
    error.mockRestore();
  });
});
