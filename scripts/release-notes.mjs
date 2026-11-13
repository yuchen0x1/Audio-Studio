import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 提取准确版本段落。缺少或重复条目时拒绝发布，避免使用其他版本或未发布日志。 */
export function extractReleaseNotes(markdown, tag) {
  const version = tag.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid release tag: ${tag}`);
  }
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const matches = lines.flatMap((line, index) => {
    const match = /^## v(\S+)(?:\s|$)/.exec(line);
    return match?.[1] === version ? [index] : [];
  });
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one release-notes entry for v${version}, found ${matches.length}`,
    );
  }
  const start = matches[0];
  const next = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  const section = lines
    .slice(start, next < 0 ? undefined : next)
    .join('\n')
    .trim();
  if (!section.split('\n').slice(1).join('\n').trim()) {
    throw new Error(`Empty release-notes entry for v${version}`);
  }
  return `${section}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [tag, output] = process.argv.slice(2);
    if (!tag || !output)
      throw new Error('Usage: node scripts/release-notes.mjs <tag> <output-file>');
    const source = new URL('../docs/releases/release-notes.md', import.meta.url);
    const notes = extractReleaseNotes(readFileSync(source, 'utf8'), tag);
    mkdirSync(dirname(resolve(output)), { recursive: true });
    writeFileSync(output, notes, 'utf8');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
