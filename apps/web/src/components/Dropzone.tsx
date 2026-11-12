/** 拖放导入区：点击选择 + 拖放文件（桌面端额外支持拖入文件夹展开） */
import { useCallback, useRef, useState, type DragEvent } from 'react';
import type { AudioSource } from '@audio-studio/shared';
import { pickAudioFiles, sourcesFromDataTransfer } from '../platform';
import { readAllFiles } from '../platform/readAudioFiles';
import { IconUpload } from './Icons';
import { useI18n, useT } from '../i18n';

export interface DropzoneProps {
  onFiles: (sources: AudioSource[]) => void;
  title?: string;
  sub?: string;
  compact?: boolean;
  multiple?: boolean;
}

export function Dropzone({ onFiles, title, sub, compact, multiple = true }: DropzoneProps) {
  const lang = useI18n((s) => s.lang);
  const t = useT();
  const zh = lang !== 'en';
  const [dragover, setDragover] = useState(false);
  const depth = useRef(0);

  const handleFiles = useCallback(
    (sources: AudioSource[]) => {
      if (!sources.length) return;
      onFiles(multiple ? sources : sources.slice(0, 1));
    },
    [onFiles, multiple],
  );

  const onDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setDragover(false);

      const dt = e.dataTransfer;
      // 优先尝试文件夹展开（Web）：DataTransferItem -> FileSystemEntry
      const items = Array.from(dt.items ?? []).filter((it) => it.kind === 'file');
      const entries = items
        .map((it) => (typeof it.webkitGetAsEntry === 'function' ? it.webkitGetAsEntry() : null))
        .filter((entry): entry is FileSystemEntry => entry !== null);

      if (entries.some((entry) => entry.isDirectory)) {
        const files: File[] = [];
        for (const entry of entries) {
          await readAllFiles(entry, files, 0);
        }
        if (files.length) {
          handleFiles(files.map(fileToSource));
          return;
        }
      }

      handleFiles(sourcesFromDataTransfer(dt));
    },
    [handleFiles],
  );

  const pick = useCallback(async () => {
    const sources = await pickAudioFiles(multiple);
    handleFiles(sources);
  }, [handleFiles, multiple]);

  return (
    <>
      <div
        className={`dropzone${dragover ? ' dragover' : ''}`}
        style={compact ? { minHeight: 108, padding: 'var(--sp-5)' } : undefined}
        onClick={() => void pick()}
        onDragEnter={(e) => {
          e.preventDefault();
          depth.current += 1;
          setDragover(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          depth.current -= 1;
          if (depth.current <= 0) {
            depth.current = 0;
            setDragover(false);
          }
        }}
        onDrop={(e) => void onDrop(e)}
        role="button"
        tabIndex={0}
        aria-label={title ?? t('home.dropHint')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void pick();
          }
        }}
      >
        <div className="dz-icon">
          <IconUpload size={22} />
        </div>
        <div className="dz-title">
          {title ?? (zh ? '拖入音频文件，或点击选择' : 'Drop audio files here, or click to choose')}
        </div>
        <div className="dz-sub">
          {sub ??
            (zh
              ? '支持多选 · 批量转换 · 拖入文件夹'
              : 'Multi-select · Batch convert · Folder drop')}
        </div>
      </div>
    </>
  );
}

/** 同一批次内用自增序号保证 id 唯一，避免同毫秒 + 随机碰撞 */
let srcSeq = 0;

function fileToSource(f: File): AudioSource {
  srcSeq += 1;
  return {
    id: `f_${Date.now().toString(36)}_${srcSeq.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: f.name,
    sizeBytes: f.size,
    lastModified: f.lastModified,
    file: f,
  };
}
