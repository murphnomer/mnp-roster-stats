# MNP Roster Stats

Adds **Points** and **POPS** columns to the team roster page of a
[Monday Night Pinball](https://www.mondaynightpinball.com/) match
(e.g. `/matches/mnp-24-5-JMF-DTP/home`).

- **Points**: points the player earned in their completed games this match.
- **POPS**: those points divided by the points available to them, as a decimal to three
  significant digits (e.g. 0.750). Each game is worth 2.5 points per player in rounds 1 and 4
  (doubles) and 3 in rounds 2 and 3 (singles).

The data comes from the match's round pages (`?round=1` to `4`), which the script loads in the background.

## Install

See the install page on this repo's GitHub Pages site. It has a bookmarklet (works in Chrome on iOS),
the userscript (Tampermonkey, Violentmonkey, or the Userscripts app for Safari on iOS), and the
browser extension zip for Chrome and Firefox.

## Development

`extension/content.js` is the only copy of the stats code. Edit it, bump `version` in
`extension/manifest.json`, and run:

```
node build.mjs
```

That writes the site to `dist/site/`. Pushing to `main` builds and deploys it to GitHub Pages
(`.github/workflows/pages.yml`). Userscript installs pick up the new version on their next update check.
