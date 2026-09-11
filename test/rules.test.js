const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../lib/rules.js');

describe('patternMatches', () => {
  test('plain domain matches exact host', () => {
    assert.equal(rules.patternMatches('mail.google.com', 'https://mail.google.com/mail/u/0/'), true);
  });

  test('plain domain matches subdomains', () => {
    assert.equal(rules.patternMatches('slack.com', 'https://myteam.slack.com/messages'), true);
  });

  test('plain domain does not match unrelated host', () => {
    assert.equal(rules.patternMatches('slack.com', 'https://notslack.com/'), false);
  });

  test('plain domain does not match a host that merely contains it', () => {
    // e.g. "slack.com" should not match "evilslack.com"
    assert.equal(rules.patternMatches('slack.com', 'https://evilslack.com/'), false);
  });

  test('glob pattern with wildcard matches path', () => {
    assert.equal(rules.patternMatches('*.figma.com/*', 'https://www.figma.com/file/abc123'), true);
  });

  test('glob pattern does not match a different path shape', () => {
    assert.equal(rules.patternMatches('figma.com/file/*', 'https://figma.com/team/xyz'), false);
  });

  test('invalid URL is handled without throwing', () => {
    assert.equal(rules.patternMatches('example.com', 'not-a-url'), false);
  });

  test('empty pattern never matches', () => {
    assert.equal(rules.patternMatches('', 'https://example.com'), false);
    assert.equal(rules.patternMatches('   ', 'https://example.com'), false);
  });

  test('handles complex glob patterns', () => {
    assert.equal(rules.patternMatches('*.google.com/search?*q=test*', 'https://www.google.com/search?q=test&hl=en'), true);
    assert.equal(rules.patternMatches('*.google.com/search?*q=test*', 'https://www.google.com/search?q=hello&hl=en'), false);
  });
});

describe('matchesAny', () => {
  test('true if any pattern in the list matches', () => {
    assert.equal(rules.matchesAny(['github.com', 'slack.com'], 'https://slack.com/x'), true);
  });

  test('false if no pattern matches', () => {
    assert.equal(rules.matchesAny(['github.com', 'slack.com'], 'https://example.com'), false);
  });

  test('handles empty / undefined list', () => {
    assert.equal(rules.matchesAny([], 'https://example.com'), false);
    assert.equal(rules.matchesAny(undefined, 'https://example.com'), false);
  });
});

const baseSettings = {
  inactivityMinutes: 15,
  defaultMode: 'discard',
  excludePinned: true,
  excludeAudible: true,
  excludeForms: true,
  neverFreezeList: ['mail.google.com'],
  alwaysFreezeList: ['news.ycombinator.com']
};

function makeTab(overrides = {}) {
  return {
    id: 1,
    url: 'https://example.com/',
    active: false,
    pinned: false,
    audible: false,
    discarded: false,
    ...overrides
  };
}

describe('isEligibleForFreeze', () => {
  test('active tab is never eligible', () => {
    const { eligible, reason } = rules.isEligibleForFreeze(makeTab({ active: true }), {}, baseSettings);
    assert.equal(eligible, false);
    assert.equal(reason, 'active tab');
  });

  test('plain ordinary background tab is eligible', () => {
    const { eligible } = rules.isEligibleForFreeze(makeTab(), {}, baseSettings);
    assert.equal(eligible, true);
  });

  test('internal pages are never eligible', () => {
    const { eligible, reason } = rules.isEligibleForFreeze(makeTab({ url: 'chrome://extensions' }), {}, baseSettings);
    assert.equal(eligible, false);
    assert.equal(reason, 'internal page');
  });

  test('edge, mozilla and about internal pages are never eligible', () => {
    assert.equal(rules.isEligibleForFreeze(makeTab({ url: 'edge://settings' }), {}, baseSettings).eligible, false);
    assert.equal(rules.isEligibleForFreeze(makeTab({ url: 'moz-extension://xxx' }), {}, baseSettings).eligible, false);
    assert.equal(rules.isEligibleForFreeze(makeTab({ url: 'about:blank' }), {}, baseSettings).eligible, false);
  });

  test('whitelisted domain is excluded', () => {
    const tab = makeTab({ url: 'https://mail.google.com/mail/u/0/' });
    const { eligible, reason } = rules.isEligibleForFreeze(tab, {}, baseSettings);
    assert.equal(eligible, false);
    assert.equal(reason, 'whitelisted');
  });

  test('complex whitelisting allows specific paths but not others', () => {
    const settings = { ...baseSettings, neverFreezeList: ['*example.com/keep-alive*'] };
    assert.equal(rules.isEligibleForFreeze(makeTab({ url: 'https://example.com/keep-alive' }), {}, settings).eligible, false);
    assert.equal(rules.isEligibleForFreeze(makeTab({ url: 'https://example.com/other' }), {}, settings).eligible, true);
  });

  test('per-tab "never" override beats everything except being active', () => {
    const { eligible, reason } = rules.isEligibleForFreeze(makeTab(), { mode: 'never' }, baseSettings);
    assert.equal(eligible, false);
    assert.equal(reason, 'per-tab: never freeze');
  });

  test('pinned tab excluded by default', () => {
    const { eligible, reason } = rules.isEligibleForFreeze(makeTab({ pinned: true }), {}, baseSettings);
    assert.equal(eligible, false);
    assert.equal(reason, 'pinned');
  });

  test('pinned exclusion can be turned off in settings', () => {
    const settings = { ...baseSettings, excludePinned: false };
    const { eligible } = rules.isEligibleForFreeze(makeTab({ pinned: true }), {}, settings);
    assert.equal(eligible, true);
  });

  test('audible tab excluded by default', () => {
    const { eligible, reason } = rules.isEligibleForFreeze(makeTab({ audible: true }), {}, baseSettings);
    assert.equal(eligible, false);
    assert.equal(reason, 'playing audio');
  });

  test('tab with a dirty form is excluded', () => {
    const { eligible, reason } = rules.isEligibleForFreeze(makeTab(), { formDirty: true }, baseSettings);
    assert.equal(eligible, false);
    assert.equal(reason, 'unsaved form input');
  });

  test('force ("always freeze") list overrides pinned/audible/form exceptions', () => {
    const tab = makeTab({ url: 'https://news.ycombinator.com/', pinned: true, audible: true });
    const { eligible } = rules.isEligibleForFreeze(tab, { formDirty: true }, baseSettings);
    assert.equal(eligible, true);
  });

  test('force list still does not override the active-tab rule', () => {
    const tab = makeTab({ url: 'https://news.ycombinator.com/', active: true });
    const { eligible, reason } = rules.isEligibleForFreeze(tab, {}, baseSettings);
    assert.equal(eligible, false);
    assert.equal(reason, 'active tab');
  });

  test('per-tab discard/soft override also bypasses pinned/audible/form exceptions', () => {
    const tab = makeTab({ pinned: true });
    const { eligible } = rules.isEligibleForFreeze(tab, { mode: 'discard' }, baseSettings);
    assert.equal(eligible, true);
  });

  test('already-discarded tab is not eligible again', () => {
    const { eligible, reason } = rules.isEligibleForFreeze(makeTab({ discarded: true }), {}, baseSettings);
    assert.equal(eligible, false);
    assert.equal(reason, 'already discarded');
  });

  test('already soft-frozen tab is not eligible again', () => {
    const { eligible, reason } = rules.isEligibleForFreeze(makeTab(), { frozen: 'soft' }, baseSettings);
    assert.equal(eligible, false);
    assert.equal(reason, 'already frozen');
  });
});

describe('effectiveMode', () => {
  test('falls back to the global default when no per-tab override is set', () => {
    assert.equal(rules.effectiveMode({}, { defaultMode: 'discard' }), 'discard');
    assert.equal(rules.effectiveMode({ mode: 'auto' }, { defaultMode: 'soft' }), 'soft');
  });

  test('per-tab override wins over the global default', () => {
    assert.equal(rules.effectiveMode({ mode: 'soft' }, { defaultMode: 'discard' }), 'soft');
    assert.equal(rules.effectiveMode({ mode: 'discard' }, { defaultMode: 'soft' }), 'discard');
  });

  test('"never" is not a freeze mode itself — callers check eligibility separately', () => {
    // effectiveMode is only consulted after isEligibleForFreeze already said yes,
    // so a "never" tab should never reach here in practice; verify it at least
    // doesn't silently claim to be a valid freeze mode.
    assert.equal(rules.effectiveMode({ mode: 'never' }, { defaultMode: 'discard' }), 'discard');
  });
});

describe('isIdleLongEnough', () => {
  test('true once idle time exceeds the threshold', () => {
    const now = 1_000_000;
    const settings = { inactivityMinutes: 10 };
    const state = { lastActive: now - 11 * 60 * 1000 };
    assert.equal(rules.isIdleLongEnough(state, settings, now), true);
  });

  test('false while still within the threshold', () => {
    const now = 1_000_000;
    const settings = { inactivityMinutes: 10 };
    const state = { lastActive: now - 5 * 60 * 1000 };
    assert.equal(rules.isIdleLongEnough(state, settings, now), false);
  });
});
