/**
 * 播放器底栏：真实 <audio> 驱动，波形随播放进度绘制，播放列表面板。
 * 播放状态全部走 usePlayer store；音频元素是唯一"播放事实来源"。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayer } from '../stores/player';
import { useI18n, useT } from '../i18n';
import { fmtDuration } from '../utils/format';
import { computePeaks, drawWaveform } from '../audio/waveform';
import {
  IconPlay,
  IconPause,
  IconPrev,
  IconNext,
  IconVolume,
  IconMute,
  IconLoop,
  IconLoopOne,
  IconShuffle,
  IconList,
  IconClose,
  IconMusic,
} from './Icons';

export function PlayerBar() {
  const lang = useI18n((s) => s.lang);
  const zh = lang !== 'en';
  const t = useT();

  const items = usePlayer((s) => s.items);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const loop = usePlayer((s) => s.loop);
  const shuffle = usePlayer((s) => s.shuffle);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const currentTime = usePlayer((s) => s.currentTime);
  const duration = usePlayer((s) => s.duration);
  const peaks = usePlayer((s) => s.peaks);
  const peaksLoading = usePlayer((s) => s.peaksLoading);

  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const seekingRef = useRef(false);

  const current = index >= 0 ? items[index] : undefined;

  // 播放列表切换 → 加载音频
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!current) {
      audio.removeAttribute('src');
      audio.load();
      return;
    }
    if (audio.src !== current.url) {
      audio.src = current.url;
      audio.load();
      if (playing) void audio.play().catch(() => usePlayer.getState().setPlaying(false));
    }
  }, [current?.id, current?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  // 播放/暂停同步
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (playing) void audio.play().catch(() => usePlayer.getState().setPlaying(false));
    else audio.pause();
  }, [playing, current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 音量同步
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  // 元数据事件 → store
  const onLoadedMeta = useCallback(() => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration)) {
      usePlayer.getState().setDuration(audio.duration * 1000);
    }
    // 波形（Web：objectURL 可直接 fetch；桌面端源为路径无法 fetch，留空态中线）
    if (current?.url) {
      usePlayer.setState({ peaksLoading: true });
      const buckets = Math.max(
        200,
        Math.min(1200, Math.round((canvasRef.current?.clientWidth ?? 600) * 1.5)),
      );
      void fetch(current.url)
        .then((r) => r.blob())
        .then((blob) => computePeaks(blob, buckets))
        .then((res) => usePlayer.getState().setPeaks(res.peaks))
        .catch(() => usePlayer.getState().setPeaks(null));
    }
  }, [current?.url]);

  // 时间更新
  const onTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !seekingRef.current) {
      usePlayer.getState().setTime(audio.currentTime * 1000);
    }
  }, []);

  const onEnded = useCallback(() => {
    const st = usePlayer.getState();
    if (st.loop === 'one') {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        void audio.play();
      }
      return;
    }
    st.next();
  }, []);

  // 进度绘制
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const progress = duration > 0 ? currentTime / duration : 0;
    if (peaks) {
      drawWaveform(canvas, peaks, { progress });
    } else {
      // 空态：画一条中线
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (!w || !h) return;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle =
          getComputedStyle(document.documentElement).getPropertyValue('--wave').trim() || '#38415c';
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
      }
    }
  }, [peaks, currentTime, duration, peaksLoading]);

  // 点击波形跳转
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = (ratio * duration) / 1000;
    usePlayer.getState().setTime(ratio * duration);
  };

  const loopIcon = loop === 'one' ? IconLoopOne : IconLoop;
  const LoopIcon = loopIcon;

  return (
    <>
      <audio
        ref={audioRef}
        onLoadedMetadata={onLoadedMeta}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        preload="metadata"
      />
      <div className={`player-bar${!current ? ' hidden-player' : ''}`}>
        {/* 曲目信息 */}
        <div className="player-meta">
          <div className="player-title truncate" title={current?.name}>
            {current?.name ?? '—'}
          </div>
          <div className="player-sub truncate">
            {peaksLoading
              ? zh
                ? '波形生成中…'
                : 'Generating waveform…'
              : (current?.probe?.format ?? '')}
          </div>
        </div>

        {/* 控制 */}
        <div className="player-controls">
          <button
            className="btn btn-ghost btn-icon btn-sm"
            title={zh ? '上一首' : 'Previous'}
            aria-label={t('player.prev')}
            onClick={() => usePlayer.getState().prev()}
          >
            <IconPrev size={15} />
          </button>
          <button
            className="play-btn"
            title={playing ? (zh ? '暂停' : 'Pause') : zh ? '播放' : 'Play'}
            aria-label={playing ? t('player.pause') : t('player.play')}
            onClick={() => usePlayer.getState().toggle()}
          >
            {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
          </button>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            title={zh ? '下一首' : 'Next'}
            aria-label={t('player.next')}
            onClick={() => usePlayer.getState().next()}
          >
            <IconNext size={15} />
          </button>
        </div>

        {/* 波形 */}
        <div className="player-wave" onClick={seek}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
        </div>

        <div className="player-time mono">
          {fmtDuration(currentTime)} / {fmtDuration(duration)}
        </div>

        {/* 额外控制 */}
        <div className="player-extra">
          <button
            className={`btn btn-ghost btn-icon btn-sm${loop !== 'off' ? ' active' : ''}`}
            style={loop !== 'off' ? { color: 'var(--accent)' } : undefined}
            title={
              loop === 'one'
                ? zh
                  ? '单曲循环'
                  : 'Loop one'
                : loop === 'all'
                  ? zh
                    ? '列表循环'
                    : 'Loop all'
                  : zh
                    ? '循环关闭'
                    : 'Loop off'
            }
            aria-label={
              loop === 'one'
                ? t('player.loopOne')
                : loop === 'all'
                  ? t('player.loopAll')
                  : t('player.loopOff')
            }
            aria-pressed={loop !== 'off'}
            onClick={() => {
              const st = usePlayer.getState();
              st.setLoop(st.loop === 'off' ? 'all' : st.loop === 'all' ? 'one' : 'off');
            }}
          >
            <LoopIcon size={15} />
          </button>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            style={shuffle ? { color: 'var(--accent)' } : undefined}
            title={zh ? '随机播放' : 'Shuffle'}
            aria-label={t('player.shuffle')}
            aria-pressed={shuffle}
            onClick={() => usePlayer.getState().toggleShuffle()}
          >
            <IconShuffle size={15} />
          </button>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            title={muted ? (zh ? '取消静音' : 'Unmute') : zh ? '静音' : 'Mute'}
            aria-label={muted ? t('player.unmute') : t('player.mute')}
            aria-pressed={muted}
            onClick={() => usePlayer.getState().toggleMute()}
          >
            {muted || volume === 0 ? <IconMute size={15} /> : <IconVolume size={15} />}
          </button>
          <input
            className="range vol-slider"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            aria-label={t('player.volume')}
            onChange={(e) => usePlayer.getState().setVolume(Number(e.target.value))}
          />
          <button
            className="btn btn-ghost btn-icon btn-sm"
            title={zh ? '播放列表' : 'Playlist'}
            aria-label={t('player.playlist')}
            aria-expanded={showPlaylist}
            onClick={() => setShowPlaylist((v) => !v)}
          >
            <IconList size={15} />
          </button>
        </div>

        {/* 播放列表面板 */}
        {showPlaylist && (
          <div className="playlist-panel">
            <div className="row-between" style={{ padding: '4px 8px 8px' }}>
              <span className="xs bold muted">
                {zh ? '播放列表' : 'Playlist'} ({items.length})
              </span>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setShowPlaylist(false)}
                aria-label={t('common.close')}
              >
                <IconClose size={13} />
              </button>
            </div>
            {items.length === 0 && (
              <div className="xs muted" style={{ padding: 12, textAlign: 'center' }}>
                {zh ? '播放列表为空' : 'Playlist is empty'}
              </div>
            )}
            {items.map((it, i) => (
              <div
                key={it.id}
                className={`playlist-item${i === index ? ' active' : ''}`}
                onClick={() => usePlayer.getState().playAt(i)}
              >
                <IconMusic size={13} />
                <span className="grow truncate">{it.name}</span>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  aria-label={t('common.remove')}
                  onClick={(e) => {
                    e.stopPropagation();
                    usePlayer.getState().removeAt(i);
                  }}
                >
                  <IconClose size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
