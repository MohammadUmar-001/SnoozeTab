#!/usr/bin/env node
/**
 * Packages the extension source into dist/tab-freezer.zip, the way a
 * reviewer or "load unpacked" user would want it: no node_modules, tests,
 * lint config, git metadata, etc.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const STAGE_DIR = path.join(DIST_DIR, 'tab-freezer');
const ZIP_PATH = path.join(DIST_DIR, 'tab-freezer.zip');

const INCLUDE = [
  'manifest.json',
  'background.js',
  'README.md',
  'LICENSE',
  'lib',
  'content',
  'popup',
  'options',
  'icons'
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

fs.rmSync(DIST_DIR, { recursive: true, force: true });
fs.mkdirSync(STAGE_DIR, { recursive: true });

for (const item of INCLUDE) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) {
    console.warn(`skipping missing path: ${item}`);
    continue;
  }
  copyRecursive(src, path.join(STAGE_DIR, item));
}

execFileSync('zip', ['-r', ZIP_PATH, 'tab-freezer'], { cwd: DIST_DIR, stdio: 'inherit' });

console.log(`\nPackaged: ${path.relative(ROOT, ZIP_PATH)}`);
