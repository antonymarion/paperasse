import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function packageVersion(): string {
  const pkgPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../package.json',
  );
  return (JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version: string }).version;
}

export function packageName(): string {
  const pkgPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../package.json',
  );
  return (JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { name: string }).name;
}
