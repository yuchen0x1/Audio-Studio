/**
 * 共享文件信息表格：把 ProbeResult 的真实探测结果渲染为两列表格。
 * 颜色一律用 var(--xxx) 令牌，深浅主题均可读。
 */
import type { ProbeResult } from '@audio-studio/shared';
import { FORMATS } from '@audio-studio/shared';
import { useI18n } from '../i18n';
import { fmtBitrate, fmtChannels, fmtDuration, fmtSampleRate, fmtSize } from '../utils/format';

interface Row {
  key: string;
  label: string;
  value: string;
}

const ZH = {
  container: '容器格式',
  codec: '编码',
  duration: '时长',
  bitrate: '比特率',
  sampleRate: '采样率',
  channels: '声道',
  bitDepth: '位深度',
  size: '文件大小',
  format: '实际格式',
  unknown: '未知',
};

const EN: typeof ZH = {
  container: 'Container',
  codec: 'Codec',
  duration: 'Duration',
  bitrate: 'Bitrate',
  sampleRate: 'Sample rate',
  channels: 'Channels',
  bitDepth: 'Bit depth',
  size: 'File size',
  format: 'Actual format',
  unknown: 'Unknown',
};

export interface FileInfoTableProps {
  probe: ProbeResult;
  /** 覆盖显示的文件名（不传则不显示该行） */
  fileName?: string;
}

export function FileInfoTable({ probe, fileName }: FileInfoTableProps) {
  const lang = useI18n((s) => s.lang);
  const S = lang === 'en' ? EN : ZH;
  const label = lang === 'en' ? 'File name' : '文件名';

  const fmtDef = probe.format ? FORMATS[probe.format] : null;
  const bitDepth = probe.bitDepth === undefined
    ? '--'
    : probe.bitDepth === 'f32' ? '32-bit float' : `${probe.bitDepth} bit`;

  const rows: Row[] = [
    { key: 'name', label, value: fileName ?? '--' },
    {
      key: 'format',
      label: S.format,
      value: fmtDef ? `${fmtDef.label} (${probe.format})` : (probe.container || S.unknown),
    },
    { key: 'container', label: S.container, value: probe.container || S.unknown },
    { key: 'codec', label: S.codec, value: probe.codecLongName ? `${probe.codec} — ${probe.codecLongName}` : probe.codec },
    { key: 'duration', label: S.duration, value: fmtDuration(probe.durationMs) },
    { key: 'bitrate', label: S.bitrate, value: fmtBitrate(probe.bitrateKbps) },
    { key: 'sampleRate', label: S.sampleRate, value: fmtSampleRate(probe.sampleRate) },
    { key: 'channels', label: S.channels, value: fmtChannels(probe.channels, probe.channelLayout) },
    { key: 'bitDepth', label: S.bitDepth, value: bitDepth },
    { key: 'size', label: S.size, value: fmtSize(probe.fileSizeBytes) },
  ];

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td style={{ width: 160, color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>{r.label}</td>
              <td className="mono" style={{ color: 'var(--fg)', wordBreak: 'break-word' }}>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default FileInfoTable;
