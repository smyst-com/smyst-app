#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const wrangler = path.join(root, 'node_modules', '.bin', 'wrangler');

if (!fs.existsSync(dist)) {
  console.error(`Missing build output: ${dist}`);
  console.error('Run the build before deploying Cloudflare Pages.');
  process.exit(1);
}

const result = spawnSync(
  wrangler,
  ['pages', 'deploy', dist, '--project-name=smyst-app', '--branch=main', '--commit-dirty=true'],
  {
    cwd: os.tmpdir(),
    env: process.env,
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
