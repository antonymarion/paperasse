import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Racine du package npm `ted` (contient bin/, dist/, web/). */
export function packageRoot(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
}

/** Répertoire de données TED (~/.ted ou TED_HOME). */
export function tedHomeDir(): string {
  return process.env.TED_HOME ?? path.join(os.homedir(), '.ted');
}

/** Index graphe persistant (LadybugDB + graph.json). */
export function indexDir(): string {
  return path.join(tedHomeDir(), 'index');
}

/**
 * Racine des skills Markdown indexés.
 * TED_SKILLS > skills/ du package > répertoire parent (dev monorepo).
 */
export function resolveSkillsRoot(): string {
  if (process.env.TED_SKILLS) {
    return path.resolve(process.env.TED_SKILLS);
  }

  const pkg = packageRoot();
  const bundled = path.join(pkg, 'skills');
  if (fs.existsSync(path.join(bundled, 'comptable', 'SKILL.md'))) {
    return bundled;
  }

  const parent = path.join(pkg, '..');
  if (fs.existsSync(path.join(parent, 'comptable', 'SKILL.md'))) {
    return parent;
  }

  return bundled;
}
