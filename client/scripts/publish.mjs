import { readdir, readFile, mkdir, copyFile, rename, access } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Validate before publishing, retain older hashed assets, and replace HTML last. */
export async function publishClient(source, destination) {
  const html = await readFile(join(source, 'index.html'), 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)(?:[^"\s]*)"/g)].map(match => match[1]);
  if (!assets.length) throw new Error('빌드의 진입 파일을 찾을 수 없습니다.');
  for (const asset of assets) await access(join(source, asset.slice(1)));
  const files = [];
  async function collect(folder, prefix = '') {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const relative = join(prefix, entry.name);
      if (entry.isDirectory()) await collect(join(folder, entry.name), relative);
      else if (entry.isFile() && relative !== 'index.html') files.push(relative);
    }
  }
  await collect(source);
  for (const relative of [...files, 'index.html']) {
    const target = join(destination, relative);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.publish-${process.pid}`;
    await copyFile(join(source, relative), temporary);
    await rename(temporary, target);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const client = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  await publishClient(join(client, '.build'), join(client, 'dist'));
  console.log('클라이언트 반영 완료: 이전 assets 보존, index.html 마지막 교체');
}
