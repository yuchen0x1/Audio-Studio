/**
 * 封面缩略图展示（共享）。
 * Web 端 coverArt.data 是 Uint8Array；桌面端 Rust 序列化后是 base64 字符串，
 * 这里统一归一化为 Blob URL，并负责生命周期回收。
 */
import { useEffect, useState } from 'react';
import type { CoverArt } from '@audio-studio/shared';

function toBytes(data: CoverArt['data']): Uint8Array | null {
  const raw: unknown = data;
  if (typeof raw === 'string') {
    // 桌面端：base64
    try {
      const bin = atob(raw);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return arr;
    } catch {
      return null;
    }
  }
  if (raw instanceof Uint8Array) return raw;
  if (Array.isArray(raw)) return new Uint8Array(raw as number[]);
  return null;
}

function coverBlobUrl(cover: CoverArt): string | null {
  const bytes = toBytes(cover.data);
  if (!bytes || !bytes.length) return null;
  // 复制到独立 ArrayBuffer：规避 Uint8Array<ArrayBufferLike> 与 BlobPart 的类型不兼容，
  // 同时避免原 buffer 被 detach 或存在视图偏移时写入脏数据
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: cover.mime || 'image/png' });
  return URL.createObjectURL(blob);
}

export interface CoverArtViewProps {
  cover?: CoverArt;
  /** dataURL 形式的自定义封面（上传预览优先于 cover） */
  src?: string;
  maxSize?: number;
  alt?: string;
}

export function CoverArtView({ cover, src, maxSize = 160, alt }: CoverArtViewProps) {
  const [url, setUrl] = useState<string | null>(src ?? null);

  useEffect(() => {
    if (src) {
      setUrl(src);
      return;
    }
    if (!cover) {
      setUrl(null);
      return;
    }
    const next = coverBlobUrl(cover);
    setUrl(next);
    if (!next) return;
    return () => URL.revokeObjectURL(next);
  }, [cover, src]);

  if (!url) return null;
  return (
    <img
      src={url}
      alt={alt ?? 'cover'}
      style={{
        maxWidth: maxSize,
        maxHeight: maxSize,
        width: 'auto',
        height: 'auto',
        display: 'block',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
        objectFit: 'contain',
      }}
    />
  );
}

export default CoverArtView;
