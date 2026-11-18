import { createHash } from 'node:crypto';
import { copyFile, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

export function webDistribution(release: boolean): Plugin {
  return {
    name: 'audio-studio-web-distribution',
    apply: 'build',
    async writeBundle({ dir }, bundle) {
      if (!dir) throw new Error('Web build requires an output directory');
      const root = new URL('../public/', import.meta.url);
      const manifest = 'manifest.webmanifest';
      if (release) {
        await Promise.all([
          copyFile(new URL(manifest, root), resolve(dir, manifest)),
          cp(new URL('icons/', root), resolve(dir, 'icons'), { recursive: true }),
          copyFile(
            new URL('./prepare-ffmpeg.mjs', import.meta.url),
            resolve(dir, 'prepare-ffmpeg.mjs'),
          ),
        ]);
      }
      const assets = [
        ...Object.keys(bundle),
        manifest,
        'icons/icon-192.png',
        'icons/icon-512.png',
      ].sort();
      const template = await readFile(new URL('./sw-template.js', import.meta.url), 'utf8');
      const hash = createHash('sha256').update(template);
      for (const file of assets) hash.update(await readFile(resolve(dir, file)));
      const worker = template
        .replace("'__BUILD_ID__'", JSON.stringify(hash.digest('hex').slice(0, 20)))
        .replace('["__PRECACHE__"]', JSON.stringify(assets));
      await writeFile(resolve(dir, 'sw.js'), worker);
    },
  };
}
