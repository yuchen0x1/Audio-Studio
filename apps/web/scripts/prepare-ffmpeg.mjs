/** Prepare the Audio Studio Web ZIP with the exact upstream FFmpeg.wasm core. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = '0.12.10';
const integrity =
  'dzNplnn2Nxle2c2i2rrDhqcB19q9cglCkWnoMTDN9Q9l3PvdjZWd1HfSPjCNWc/p8Q3CT+Es9fWOR0UhAeYQZA==';
const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];

async function download() {
  const response = await fetch(`https://registry.npmjs.org/@ffmpeg/core/-/core-${version}.tgz`, {
    redirect: 'error',
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`Download failed (HTTP ${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

const work = await mkdtemp(join(tmpdir(), 'audio-studio-core-'));
try {
  const localArchive = process.argv[2];
  const payload = localArchive ? await readFile(localArchive) : await download();
  if (createHash('sha512').update(payload).digest('base64') !== integrity) {
    throw new Error('FFmpeg.wasm archive integrity check failed');
  }
  const archive = join(work, 'core.tgz');
  await writeFile(archive, payload);
  const entries = files.map((file) => `package/dist/esm/${file}`);
  const tar = spawnSync('tar', ['-xzf', archive, '-C', work, ...entries], { stdio: 'inherit' });
  if (tar.error) throw tar.error;
  if (tar.status !== 0) throw new Error(`FFmpeg.wasm extraction failed (${tar.status})`);
  const output = fileURLToPath(new URL('./ffmpeg/', import.meta.url));
  await mkdir(output, { recursive: true });
  await Promise.all(
    files.map((file, index) => copyFile(join(work, entries[index]), join(output, file))),
  );
  console.log(`FFmpeg.wasm ${version} prepared in ${output}`);
} finally {
  await rm(work, { recursive: true, force: true });
}
