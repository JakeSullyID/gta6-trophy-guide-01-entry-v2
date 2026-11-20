// Automated build script that assembles the Leonida Trophy Guide artifacts into the designated output folder.
// It bundles the application assets and screenshots into the output directory and generates the dossier metadata.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const targetDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(targetDir, { recursive: true });
cpSync(join(rootDir, 'app'), join(targetDir, 'app'), { recursive: true });

const shotsTarget = join(targetDir, 'screenshots');
mkdirSync(shotsTarget, { recursive: true });
const shotsSource = join(rootDir, 'screenshots');
if (existsSync(shotsSource)) {
  cpSync(shotsSource, shotsTarget, { recursive: true });
}

const dossierPayload = buildDossier(targetDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648
});

writeFileSync(join(targetDir, 'dossier.json'), dossierPayload);
