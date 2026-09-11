/**
 * lib/rules.js — pure decision logic for Tab Freezer, with no dependency on
 * chrome.* / browser.* APIs. Kept separate from background.js so it can be
 * unit tested directly under Node (see test/rules.test.js) without needing
 * to mock an extension environment.
 *
 * Loaded two ways:
 *  - In the extension: as a classic script (importScripts on Chrome,
 *    background.scripts entry on Firefox), which attaches to self.TF.rules.
 *  - In tests: via require('../lib/rules.js'), which uses module.exports.
 */
(function (root, factory) {
  const rules = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = rules;
  }
  root.TF = root.TF || {};
  root.TF.rules = rules;
})(typeof self !== 'undefined' ? self : typeof global !== 'undefined' ? global : this, function () {
  /**
   * Match a single whitelist/blacklist pattern against a URL.
   * - Patterns containing "*" are treated as globs over the full URL.
   * - Plain patterns are treated as a domain: matches that host exactly,
   *   or any subdomain of it.
   */
  function patternMatches(pattern, url) {
    if (!pattern || !url) return false;
    pattern = pattern.trim();
    if (!pattern) return false;
    try {
      if (pattern.includes('*')) {
        const escaped = pattern
          .split('*')
          .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*');
        return new RegExp('^' + escaped + '$').test(url);
      }
      const host = new URL(url).hostname;
      return host === pattern || host.endsWith('.' + pattern);
    } catch {
      return false;
    }
  }

  function matchesAny(list, url) {
    return (list || []).some((p) => patternMatches(p, url));
  }

  const INTERNAL_URL_PREFIXES = ['chrome://', 'chrome-extension://', 'about:', 'edge://', 'moz-extension://'];

  function isInternalUrl(url) {
    return !url || INTERNAL_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
  }

  /**
   * Decide whether a tab is currently eligible to be frozen.
   *
   * @param {{id:number,url:string,active:boolean,pinned:boolean,audible:boolean,discarded:boolean}} tab
   * @param {{mode?:string, formDirty?:boolean, frozen?:false|'discard'|'soft'}} state  per-tab tracked state (defaults applied by caller)
   * @param {object} settings  the global settings object
   * @returns {{eligible: boolean, reason: string|null}}
   */
  function isEligibleForFreeze(tab, state, settings) {
    state = state || {};

    if (isInternalUrl(tab.url)) return { eligible: false, reason: 'internal page' };
    if (state.mode === 'never') return { eligible: false, reason: 'per-tab: never freeze' };
    if (matchesAny(settings.neverFreezeList, tab.url)) return { eligible: false, reason: 'whitelisted' };

    const forcedByAlwaysList = matchesAny(settings.alwaysFreezeList, tab.url);
    const forcedByOverride = state.mode === 'discard' || state.mode === 'soft';

    if (tab.active) return { eligible: false, reason: 'active tab' };

    if (!forcedByAlwaysList && !forcedByOverride) {
      if (settings.excludePinned && tab.pinned) return { eligible: false, reason: 'pinned' };
      if (settings.excludeAudible && tab.audible) return { eligible: false, reason: 'playing audio' };
      if (settings.excludeForms && state.formDirty) return { eligible: false, reason: 'unsaved form input' };
    }

    if (tab.discarded) return { eligible: false, reason: 'already discarded' };
    if (state.frozen) return { eligible: false, reason: 'already frozen' };

    return { eligible: true, reason: null };
  }

  /** Which freeze method applies to this tab: its own override, or the global default. */
  function effectiveMode(state, settings) {
    state = state || {};
    if (state.mode === 'discard' || state.mode === 'soft') return state.mode;
    return settings.defaultMode;
  }

  /** Has this tab been idle long enough to consider freezing? */
  function isIdleLongEnough(state, settings, now) {
    now = now || Date.now();
    const lastActive = (state && state.lastActive) || now;
    const thresholdMs = settings.inactivityMinutes * 60 * 1000;
    return now - lastActive >= thresholdMs;
  }

  return {
    patternMatches,
    matchesAny,
    isInternalUrl,
    isEligibleForFreeze,
    effectiveMode,
    isIdleLongEnough
  };
});
