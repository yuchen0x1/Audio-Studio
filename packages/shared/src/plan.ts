/**
 * 作业规划：把 UI 语义作业（含多片段裁剪）展开为引擎可直接执行的原子作业。
 * UI 与引擎之间只传 AudioJob，展开逻辑集中在共享层，保证行为一致。
 */
import { AudioJob, TrimJob } from './engine';

export function expandJob(job: AudioJob): AudioJob[] {
  if (job.kind === 'trim' && job.exportSegments) {
    return expandSegments(job);
  }
  return [job];
}

function expandSegments(job: TrimJob): AudioJob[] {
  const points = [job.startMs, ...(job.splitPointsMs ?? []).sort((a, b) => a - b), job.endMs];
  const jobs: TrimJob[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (end <= start) continue;
    const segNo = String(i + 1).padStart(2, '0');
    jobs.push({
      ...job,
      taskId: `${job.taskId}_s${segNo}`,
      startMs: start,
      endMs: end,
      splitPointsMs: undefined,
      exportSegments: false,
      outputFileName: injectSegmentLabel(job.outputFileName, segNo),
    });
  }
  if (!jobs.length) throw new Error('裁剪区间为空：没有可导出的片段');
  return jobs;
}

function injectSegmentLabel(fileName: string, segNo: string): string {
  const m = /^(.*)(\.[a-z0-9]+)$/i.exec(fileName);
  if (m) return `${m[1]}_seg${segNo}${m[2]}`;
  return `${fileName}_seg${segNo}`;
}
