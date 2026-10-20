// Builds everything from extension/ (the single source of the stats code):
//   dist/site/                          - the GitHub Pages site
//     index.html                        - install page (bookmarklet + other install options)
//     mnp-roster-stats.user.js          - userscript (Tampermonkey, Violentmonkey, iOS Userscripts app)
//     mnp-roster-stats.zip              - browser extension for Chrome and Firefox
//     mnp-roster-stats.payload.js       - the stats code, fetched and run by the loader
//     bookmarklet.txt                   - bookmarklet URL (a loader, so it picks up updates)
//     shortcut.js                       - code for the iOS Shortcut's "Run JavaScript on Webpage" (same loader)
//   dist/bookmarklet-install.html       - the same install page as a fragment, for a Claude artifact
// The install page template is install-page.html; site.json holds the shared iOS Shortcut's iCloud link.
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

// Payload: the stats code as a function body that returns its promise, for the loader below.
// Comment lines and indentation are dropped; newlines stay so there are no ASI surprises.
if (!SITE_URL) throw new Error('No site URL: add the GitHub "origin" remote or set SITE_URL.');
const compact = content.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//')).join('\n');
writeFileSync(join(siteDir, 'mnp-roster-stats.payload.js'), 'return ' + compact + '\n');

// Loader: a few lines that fetch the current payload from the site and run it, so the bookmarklet and
// the iOS Shortcut never need re-copying after an update. `done` is called when it finishes (the
// Shortcut's "Run JavaScript on Webpage" action must call completion()). Messages show as a toast,
// since alert() doesn't work from a Shortcut.
const loader = (done) => `(function (done) {
  function toast(msg) {
    var d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;padding:12px 14px;' +
      'border-radius:8px;background:#17202c;color:#fff;font:15px/1.4 -apple-system,system-ui,sans-serif;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.35)';
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 6000);
  }
  fetch('${SITE_URL}/mnp-roster-stats.payload.js?t=' + Date.now())
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(function (code) { return new Function(code)(); })
    .then(function () {
      if (!document.querySelector('table[data-mnp-stats]')) {
        toast('MNP Roster Stats: open a team roster page first (a match page ending in /home or /away).');
      }
      done('ok');
    }, function (e) {
      toast('MNP Roster Stats could not load: ' + e.message);
      done('error');
    });
})(${done});`;
const bookmarklet = 'javascript:' + encodeURIComponent(loader('function () {}') + 'void 0');
const shortcutJs = loader("typeof completion === 'function' ? completion : function () {}");
writeFileSync(join(siteDir, 'bookmarklet.txt'), bookmarklet);
writeFileSync(join(siteDir, 'shortcut.js'), shortcutJs + '\n');

// Install page. The template is a page fragment (the Claude artifact format); the site gets a full document.
// site.json's shortcutUrl is the iCloud link to the shared iOS Shortcut; until it's set, the page
// shows the build-it-yourself steps instead of an "Add shortcut" button.
const { shortcutUrl } = JSON.parse(readFileSync(join(root, 'site.json'), 'utf8'));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function installPage(base) {
  let html = readFileSync(join(root, 'install-page.html'), 'utf8');
  html = shortcutUrl
    ? html.replace(/<!--if-no-shortcut-link-->[\s\S]*?<!--\/if-no-shortcut-link-->/g, '')
    : html.replace(/<!--if-shortcut-link-->[\s\S]*?<!--\/if-shortcut-link-->/g, '');
  return html
    .replaceAll('{{BOOKMARKLET}}', esc(bookmarklet))
    .replaceAll('{{SHORTCUT_JS}}', esc(shortcutJs))
    .replaceAll('{{SHORTCUT_URL}}', esc(shortcutUrl || ''))
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
console.log(`Built ${siteDir}: index.html, mnp-roster-stats.user.js, mnp-roster-stats.zip, ` +
  `mnp-roster-stats.payload.js, bookmarklet.txt (${bookmarklet.length} chars), shortcut.js`);
console.log(`Shortcut link: ${shortcutUrl || '(not set in site.json yet)'}`);
console.log(`Built ${join(distDir, 'bookmarklet-install.html')}`);
