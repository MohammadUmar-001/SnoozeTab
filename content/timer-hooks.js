/**
 * timer-hooks.js — runs in the page's own JS world (MAIN), not the isolated
 * content-script world. This is what lets "soft freeze" actually stop a
 * page's recurring work instead of just hiding the tab.
 *
 * It strictly targets setInterval, setTimeout, and requestAnimationFrame.
 * It intentionally leaves MutationObserver and IntersectionObserver untouched 
 * to guarantee complete safety and avoid layout breakage on complex SPAs.
 *
 * Communicates with the isolated-world content script via CustomEvents on
 * `window`, since the DOM (including window/document as an EventTarget) is
 * shared across worlds even though JS globals are not.
 */
(function () {
  if (window.__TAB_FREEZER_HOOKS_V1__) return;
  window.__TAB_FREEZER_HOOKS_V1__ = true;

  const nativeSetInterval = window.setInterval.bind(window);
  const nativeClearInterval = window.clearInterval.bind(window);
  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  const nativeRAF = window.requestAnimationFrame.bind(window);

  let frozen = false;
  let nextFakeId = -1;

  // setInterval state
  const liveIntervals = new Map(); // id -> { handler, delay, args }
  let suspendedIntervals = [];

  // setTimeout state
  const liveTimeouts = new Map(); // id -> { handler, delay, args }
  let suspendedTimeouts = [];

  // RAF state
  let pendingRAFCallbacks = [];

  // --- setInterval ---
  window.setInterval = function (handler, delay, ...args) {
    if (frozen) {
      const id = nextFakeId--;
      suspendedIntervals.push({ id, handler, delay, args });
      return id;
    }
    const id = nativeSetInterval(handler, delay, ...args);
    liveIntervals.set(id, { handler, delay, args });
    return id;
  };

  window.clearInterval = function (id) {
    if (id < 0) {
      suspendedIntervals = suspendedIntervals.filter((i) => i.id !== id);
      return;
    }
    liveIntervals.delete(id);
    return nativeClearInterval(id);
  };

  // --- setTimeout ---
  window.setTimeout = function (handler, delay, ...args) {
    if (frozen) {
      const id = nextFakeId--;
      suspendedTimeouts.push({ id, handler, delay, args });
      return id;
    }
    
    // For string handlers (eval-based), we pass them directly to the native 
    // timeout natively to respect the site's CSP and execution context. 
    // We don't track them in `liveTimeouts` to avoid memory leaks since 
    // we can't intercept when they finish executing natively.
    if (typeof handler === 'string') {
      return nativeSetTimeout(handler, delay, ...args);
    }
    
    const id = nativeSetTimeout((...cbArgs) => {
      liveTimeouts.delete(id);
      handler(...cbArgs);
    }, delay, ...args);
    
    liveTimeouts.set(id, { handler, delay, args });
    return id;
  };

  window.clearTimeout = function (id) {
    if (id < 0) {
      suspendedTimeouts = suspendedTimeouts.filter((t) => t.id !== id);
      return;
    }
    liveTimeouts.delete(id);
    return nativeClearTimeout(id);
  };

  // --- requestAnimationFrame ---
  window.requestAnimationFrame = function (cb) {
    if (frozen) {
      pendingRAFCallbacks.push(cb);
      return -1;
    }
    return nativeRAF(cb);
  };

  // --- Freeze / Unfreeze Logic ---
  function freeze() {
    if (frozen) return;
    frozen = true;
    
    // Pause Intervals
    for (const [id, info] of liveIntervals) {
      nativeClearInterval(id);
      suspendedIntervals.push(info);
    }
    liveIntervals.clear();

    // Pause Timeouts
    for (const [id, info] of liveTimeouts) {
      nativeClearTimeout(id);
      suspendedTimeouts.push(info);
    }
    liveTimeouts.clear();
  }

  function unfreeze() {
    if (!frozen) return;
    frozen = false;

    // Resume Intervals
    const toResumeIntervals = suspendedIntervals;
    suspendedIntervals = [];
    for (const info of toResumeIntervals) {
      window.setInterval(info.handler, info.delay, ...info.args);
    }

    // Resume Timeouts
    const toResumeTimeouts = suspendedTimeouts;
    suspendedTimeouts = [];
    for (const info of toResumeTimeouts) {
      window.setTimeout(info.handler, info.delay, ...info.args);
    }

    // Resume RAF
    const queuedRAF = pendingRAFCallbacks;
    pendingRAFCallbacks = [];
    queuedRAF.forEach((cb) => nativeRAF(cb));
  }

  window.addEventListener('tf:freeze', freeze);
  window.addEventListener('tf:unfreeze', unfreeze);
})();
