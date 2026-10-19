// Builds everything from extension/ (the single source of the stats code):
//   dist/site/                          - the GitHub Pages site
//     index.html                        - install page (bookmarklet + other install options)
//     mnp-roster-stats.user.js          - userscript (Tampermonkey, Violentmonkey, iOS Userscripts app)
//     mnp-roster-stats.zip              - browser extension for Chrome and Firefox
//     bookmarklet.txt                   - bookmarklet URL
//   dist/bookmarklet-install.html       - the same install page as a fragment, for a Claude artifact
// Usage: node build.mjs
// The public site URL comes from GITHUB_REPOSITORY (in GitHub Actions) or the git "origin" remote,
// and is used for the userscript's auto-update URLs. Override with SITE_URL if needed.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = import.meta.dirname;
const extDir = join(root, 'extension');
const distDir = join(root, 'dist');
const siteDir = join(distDir, 'site');

const manifest = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'));
const content = readFileSync(join(extDir, 'content.js'), 'utf8');

function siteUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  let repo = process.env.GITHUB_REPOSITORY;
  if (!repo) {
    try {
      const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      repo = remote.match(/github\.com[:/]([^/]+\/[^/.\s]+)/)?.[1];
    } catch { /* not a git repo yet */ }
  }
  if (!repo) return null;
  const [owner, name] = repo.split('/');
  return `https://${owner.toLowerCase()}.github.io/${name}`;
}
const SITE_URL = siteUrl();

rmSync(distDir, { recursive: true, force: true });
mkdirSync(siteDir, { recursive: true });

// Extension zip. Windows' bundled bsdtar writes zips with forward-slash paths, which addons.mozilla.org requires.
const zipPath = join(siteDir, 'mnp-roster-stats.zip');
execFileSync(process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'zip',
  process.platform === 'win32'
    ? ['-a', '-c', '-f', zipPath, '-C', extDir, 'manifest.json', 'content.js']
    : ['-j', zipPath, join(extDir, 'manifest.json'), join(extDir, 'content.js')]);

// Userscript.
const userscriptUrl = SITE_URL && `${SITE_URL}/mnp-roster-stats.user.js`;
const header = [
  '// ==UserScript==',
  `// @name         ${manifest.name}`,
  '// @namespace    https://www.mondaynightpinball.com/',
  `// @version      ${manifest.version}`,
  `// @description  ${manifest.description}`,
  ...manifest.content_scripts[0].matches.map((m) => `// @match        ${m}`),
  ...(userscriptUrl ? [`// @updateURL    ${userscriptUrl}`, `// @downloadURL  ${userscriptUrl}`] : []),
  '// @grant        none',
  '// @run-at       document-idle',
  '// ==/UserScript==',
  '',
  '',
].join('\n');
writeFileSync(join(siteDir, 'mnp-roster-stats.user.js'), header + content);

// Bookmarklet: drop comment lines and indentation, keep newlines (encoded) so no ASI surprises,
// and tell the user when they tap it somewhere other than a roster page.
const compact = content.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//')).join('\n');
const bookmarkletSrc = compact + '\n' +
  "if(!document.querySelector('table[data-mnp-stats]'))" +
  "alert('MNP Roster Stats: open a team roster page first (a match page ending in /home or /away).');";
const bookmarklet = 'javascript:' + encodeURIComponent('(function(){\n' + bookmarkletSrc + '\n})();void 0');
writeFileSync(join(siteDir, 'bookmarklet.txt'), bookmarklet);

// Install page. The template is a page fragment (the Claude artifact format); the site gets a full document.
function installPage(base) {
  return readFileSync(join(root, 'bookmarklet-install.html'), 'utf8')
    .replaceAll('{{BOOKMARKLET}}', bookmarklet.replace(/&/g, '&amp;').replace(/"/g, '&quot;'))
    .replaceAll('{{VERSION}}', manifest.version)
    .replaceAll('{{BASE}}', base);
}
writeFileSync(join(siteDir, 'index.html'),
  '<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
  '<style>body { margin: 0; }</style>\n' +
  installPage('') + '</html>\n');
writeFileSync(join(distDir, 'bookmarklet-install.html'), installPage(SITE_URL ? SITE_URL + '/' : ''));

console.log(`Site URL: ${SITE_URL ?? '(unknown: no GitHub remote yet, so no auto-update URLs)'}`);
console.log(`Built ${siteDir}: index.html, mnp-roster-stats.user.js, mnp-roster-stats.zip, bookmarklet.txt (${bookmarklet.length} chars)`);
console.log(`Built ${join(distDir, 'bookmarklet-install.html')}`);
