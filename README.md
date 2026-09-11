# SnoozeTabs

![CI](https://github.com/MohammadUmar-001/SnoozeTab/actions/workflows/ci.yml/badge.svg)

An open-source browser extension that automatically freezes idle tabs to cut
CPU and memory usage - with rules, a whitelist/blacklist, and full per-tab
control. Works on Chrome, Edge, and other Chromium browsers, and on Firefox,
from one shared codebase.

## Features

- **Two freeze modes**, chosen per tab or globally:
  - **Discard** - unloads the tab from memory entirely (`tabs.discard`); it
    silently reloads when you click back into it. Biggest RAM/CPU win.
  - **Soft freeze** - keeps the tab loaded but pauses `setInterval` loops,
    `requestAnimationFrame` animations, and playing video/audio. Reopens
    instantly since nothing was unloaded.
- **Inactivity-based**: freezes a tab after N minutes without focus (default 15).
- **Whitelist** - domains/patterns that are never touched (e.g. your webmail).
- **Force list** - domains that get frozen even if they'd normally be excluded.
- **Smart exceptions**: pinned tabs, tabs playing audio, and tabs with unsaved
  form input are protected by default (all toggleable).
- **Per-tab override** from the popup: Auto / Always discard / Always soft-freeze / Never.
- **Keyboard shortcuts**: freeze the current tab, or pause/resume auto-freezing.
- **Import/export settings** as JSON.
- 100% local - no analytics, no network requests, no accounts.

## Install (load unpacked, for now)

**Chrome / Edge / Brave:**
1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `manifest.json` inside this folder.
   (Temporary add-ons are removed when Firefox restarts - for a permanent
   install, package it as a signed `.xpi` via
   [web-ext](https://github.com/mozilla/web-ext) and AMO, or self-distribute.)

No build step is required - it's plain HTML/CSS/JS.

## How "soft freeze" works

A `MAIN`-world content script (`content/timer-hooks.js`) wraps `setInterval`
and `requestAnimationFrame` as soon as each page starts loading, so it can
later suspend them without the page's own code needing to change. On freeze:
recurring intervals are cleared (and remembered so they can be restarted
later) and animation frames stop being forwarded to the page. Video/audio
elements are explicitly paused. On wake, everything is restored.

`setTimeout` is deliberately left alone - one-off timeouts rarely cause
ongoing CPU load, and touching them risks breaking init/debounce logic pages
rely on firing exactly once. Web Workers and WASM threads also aren't
suspended by soft freeze; if you need maximum savings for a tab, use
**Discard** instead.

## Browser support notes

- **Discard mode** works on Chrome 88+, Edge, and Firefox 92+ - essentially
  any modern build.
- **Soft freeze** relies on a `MAIN`-world content script (to hook
  `setInterval`/`requestAnimationFrame` inside the page itself), which needs
  Chrome/Edge 111+ or Firefox 128+. On older browsers, soft freeze silently
  won't intercept timers; stick to Discard mode there.

## Project layout

```
manifest.json              single MV3 manifest for both browsers
background.js              service worker: activity tracking, rules, freezing
lib/browser-compat.js      tiny shim so chrome.* (callback) and browser.* (promise) look the same
content/timer-hooks.js     MAIN-world: suspends intervals/rAF
content/content-script.js  isolated world: media pause, form-dirty detection, messaging bridge
popup/                     toolbar popup UI
options/                   full settings page
icons/                     generated icon set
test/                      unit tests for lib/rules.js (node:test)
scripts/package-extension.js  builds dist/tab-freezer.zip
.github/workflows/ci.yml   lint + test + package on every push
```

## Privacy

This extension requests `<all_urls>` host permission because it needs to
inject the soft-freeze hooks and message any tab, but it never reads page
content, never transmits anything over the network, and stores all settings
locally in `storage.local`/`storage.session` on your own device.

## Development

The extension itself has zero dependencies and no build step. The `npm`
scripts below are dev-only tooling (linting, tests, packaging):

```bash
npm install       # installs eslint + globals (dev only)
npm test          # runs the rules-engine unit tests (node:test)
npm run lint      # eslint over the whole project
npm run package   # builds dist/snoozetabs.zip (excludes tests/config/node_modules)
```

The core freeze/exception logic lives in `lib/rules.js` as a small set of
pure functions (`patternMatches`, `isEligibleForFreeze`, `effectiveMode`,
`isIdleLongEnough`) with no dependency on `chrome.*`/`browser.*`, precisely
so it can be unit tested directly under Node - see `test/rules.test.js`.
`background.js` is a thin wrapper that calls into this module and handles
the actual browser API calls (tab queries, discarding, messaging).

### CI

`.github/workflows/ci.yml` runs on every push/PR: validates `manifest.json`,
lints, runs the unit tests, then (on a second job) packages the extension
into a zip and uploads it as a build artifact. It also runs
[`web-ext lint`](https://github.com/mozilla/web-ext) against the packaged
output as an informational check for Firefox/AMO compatibility (non-blocking
- it won't fail the build, since some of its opinions are stricter than what
Chrome/Edge require).

## Contributing

We welcome contributions! This extension is built with **100% plain vanilla JS/HTML/CSS**. 
There are no bundlers (Webpack/Vite), no frameworks (React/Vue), and no hidden dependencies. 
This keeps the codebase highly approachable, lightweight, and easily auditable.

### Getting Started for Developers:
1. Clone the repository.
2. Run `npm install` (only needed for ESLint and tests, no build step required).
3. Load the unpacked extension into your browser (see Install section).
4. Make your edits and reload the extension in your browser to see changes instantly!
5. Run `npm run test` and `npm run lint` before submitting a PR.

## License

MIT - see [LICENSE](LICENSE).
