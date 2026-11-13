// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createTask, defaultParamsFor } from '@audio-studio/shared';

vi.mock('../engine', () => ({
  getEngine: vi.fn(),
  initEngine: vi.fn(),
  engineInitialized: () => false,
  setEngineConcurrency: vi.fn(),
}));
vi.mock('../platform', () => ({
  isDesktop: false,
  baseName: (p: string) => p,
  dirOf: () => '',
  notify: vi.fn(),
  deliverResult: vi.fn(),
  pickAudioFiles: vi.fn(),
}));
vi.mock('../stores/history', () => ({ useHistory: { getState: () => ({ add: vi.fn() }) } }));
import { BatchPage } from '../pages/BatchPage';
import { useSession } from '../stores/session';
import { useI18n } from '../i18n';

beforeEach(() => {
  useI18n.setState({ lang: 'en' });
  useSession.setState({
    files: [
      {
        source: { id: 'one', name: 'voice.wav', sizeBytes: 10 },
        params: defaultParamsFor('mp3'),
        probing: false,
      },
    ],
    tasks: [],
    engineState: 'idle',
  });
});
afterEach(cleanup);

describe('批量工作台交互', () => {
  it('参数编辑保持显示，显式应用后写入文件参数', () => {
    render(<BatchPage />);
    fireEvent.change(screen.getByLabelText('Bitrate'), { target: { value: '320' } });
    expect(screen.getByLabelText('Bitrate')).toHaveValue('320');
    expect(useSession.getState().files[0].params.bitrateKbps).toBe(192);
    fireEvent.click(screen.getByRole('button', { name: 'Apply parameters to all' }));
    expect(useSession.getState().files[0].params.bitrateKbps).toBe(320);
  });

  it('预设更新格式、显示参数、真实文件参数，随后仍可编辑', () => {
    render(<BatchPage />);
    fireEvent.click(screen.getByRole('button', { name: /Compact voice/ }));
    expect(screen.getByLabelText(/Target format/)).toHaveValue('opus');
    expect(screen.getByLabelText('Bitrate')).toHaveValue('64');
    expect(useSession.getState().files[0].params).toMatchObject({
      format: 'opus',
      bitrateKbps: 64,
      channels: 1,
      sampleRate: 48000,
    });
    fireEvent.change(screen.getByLabelText('Bitrate'), { target: { value: '96' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply parameters to all' }));
    expect(useSession.getState().files[0].params.bitrateKbps).toBe(96);
  });

  it('搜索和状态筛选取交集，并展示无结果状态', () => {
    useSession.setState({
      tasks: [
        {
          ...createTask('convert', 'Voice.wav', defaultParamsFor('mp3')),
          status: 'failed',
          fileId: 'one',
          armed: false,
        },
        {
          ...createTask('convert', 'Music.wav', defaultParamsFor('mp3')),
          status: 'completed',
          fileId: 'two',
          armed: false,
        },
      ],
    });
    render(<BatchPage />);
    fireEvent.change(screen.getByLabelText('Search filenames'), { target: { value: ' VOICE ' } });
    expect(screen.getByText('Voice.wav')).toBeInTheDocument();
    expect(screen.queryByText('Music.wav')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Task status'), { target: { value: 'completed' } });
    expect(screen.getByText('No matching tasks')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('0 / 2');
  });
});
