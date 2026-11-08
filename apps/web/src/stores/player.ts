/** 播放器状态（播放列表、循环模式、音量；音频元素由 PlayerBar 组件驱动） */
import { create } from 'zustand';
import type { AudioSource, ProbeResult } from '@audio-studio/shared';

export type LoopMode = 'off' | 'all' | 'one';

export interface PlaylistItem {
  id: string;
  name: string;
  /** objectURL 或桌面端不可用（Web 播放） */
  url: string;
  source: AudioSource;
  probe?: ProbeResult;
}

interface PlayerState {
  items: PlaylistItem[];
  index: number;
  playing: boolean;
  loop: LoopMode;
  shuffle: boolean;
  volume: number;      // 0..1
  muted: boolean;
  currentTime: number;
  duration: number;
  /** 波形峰值（当前曲目，[-1,1] 每桶 min/max 交错） */
  peaks: Float32Array | null;
  peaksLoading: boolean;

  setPlaylist: (items: PlaylistItem[], startIndex?: number) => void;
  playAt: (index: number) => void;
  toggle: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  setLoop: (m: LoopMode) => void;
  toggleShuffle: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setTime: (t: number) => void;
  setDuration: (d: number) => void;
  setPlaying: (p: boolean) => void;
  setPeaks: (p: Float32Array | null) => void;
  removeAt: (index: number) => void;
  clear: () => void;
}

export const usePlayer = create<PlayerState>((set, get) => ({
  items: [],
  index: -1,
  playing: false,
  loop: 'off',
  shuffle: false,
  volume: 0.9,
  muted: false,
  currentTime: 0,
  duration: 0,
  peaks: null,
  peaksLoading: false,

  setPlaylist: (items, startIndex = 0) => {
    set({ items, index: items.length ? startIndex : -1, currentTime: 0, peaks: null, playing: items.length > 0 });
  },

  playAt: (index) => {
    const { items } = get();
    if (index < 0 || index >= items.length) return;
    set({ index, currentTime: 0, playing: true, peaks: null });
  },

  toggle: () => {
    if (get().index < 0) return;
    set((s) => ({ playing: !s.playing }));
  },

  stop: () => set({ playing: false, currentTime: 0 }),

  next: () => {
    const { items, index, loop, shuffle } = get();
    if (!items.length) return;
    let ni: number;
    if (shuffle && items.length > 1) {
      do { ni = Math.floor(Math.random() * items.length); } while (ni === index);
    } else {
      ni = index + 1;
      if (ni >= items.length) {
        if (loop === 'all') ni = 0;
        else { set({ playing: false }); return; }
      }
    }
    set({ index: ni, currentTime: 0, peaks: null, playing: true });
  },

  prev: () => {
    const { items, index, loop } = get();
    if (!items.length) return;
    let ni = index - 1;
    if (ni < 0) ni = loop === 'all' ? items.length - 1 : 0;
    set({ index: ni, currentTime: 0, peaks: null, playing: true });
  },

  setLoop: (loop) => set({ loop }),
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),

  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)), muted: false }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),

  setTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setPlaying: (playing) => set({ playing }),
  setPeaks: (peaks) => set({ peaks, peaksLoading: false }),

  removeAt: (index) => {
    const { items, index: cur } = get();
    const next = items.filter((_, i) => i !== index);
    let ni = cur;
    if (index < cur) ni = cur - 1;
    else if (index === cur) ni = Math.min(cur, next.length - 1);
    set({
      items: next,
      index: next.length ? ni : -1,
      playing: next.length ? (index === cur ? false : get().playing) : false,
      peaks: index === cur ? null : get().peaks,
    });
  },

  clear: () => set({ items: [], index: -1, playing: false, currentTime: 0, peaks: null }),
}));
