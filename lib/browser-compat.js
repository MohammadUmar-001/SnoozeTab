/**
 * browser-compat.js
 * Minimal cross-browser shim so the same code runs on Chrome (callback-based
 * chrome.* APIs in a service worker) and Firefox (native promise-based
 * browser.* APIs). Loaded before background.js and content-script.js.
 */
(function (global) {
  const isFirefox = typeof global.browser !== 'undefined';
  const raw = isFirefox ? global.browser : global.chrome;

  function promisify(fn, thisArg) {
    return (...args) =>
      new Promise((resolve, reject) => {
        try {
          fn.call(thisArg, ...args, (result) => {
            const err = global.chrome && global.chrome.runtime && global.chrome.runtime.lastError;
            if (err) reject(new Error(err.message));
            else resolve(result);
          });
        } catch (e) {
          reject(e);
        }
      });
  }

  // Build a promise-based `api` object regardless of browser.
  const api = {
    isFirefox,
    tabs: raw.tabs ? {
      query: isFirefox ? raw.tabs.query.bind(raw.tabs) : promisify(raw.tabs.query, raw.tabs),
      get: isFirefox ? raw.tabs.get.bind(raw.tabs) : promisify(raw.tabs.get, raw.tabs),
      discard: isFirefox ? raw.tabs.discard.bind(raw.tabs) : promisify(raw.tabs.discard, raw.tabs),
      update: isFirefox ? raw.tabs.update.bind(raw.tabs) : promisify(raw.tabs.update, raw.tabs),
      sendMessage: isFirefox
        ? raw.tabs.sendMessage.bind(raw.tabs)
        : (tabId, msg) =>
            new Promise((resolve) => {
              raw.tabs.sendMessage(tabId, msg, () => {
                void raw.runtime.lastError;
                resolve();
              });
            }),
      onActivated: raw.tabs.onActivated,
      onUpdated: raw.tabs.onUpdated,
      onRemoved: raw.tabs.onRemoved,
      onCreated: raw.tabs.onCreated
    } : null,
    windows: raw.windows ? {
      getAll: isFirefox ? raw.windows.getAll.bind(raw.windows) : promisify(raw.windows.getAll, raw.windows),
      onFocusChanged: raw.windows.onFocusChanged
    } : null,
    storage: raw.storage ? {
      local: {
        get: isFirefox
          ? raw.storage.local.get.bind(raw.storage.local)
          : promisify(raw.storage.local.get, raw.storage.local),
        set: isFirefox
          ? raw.storage.local.set.bind(raw.storage.local)
          : promisify(raw.storage.local.set, raw.storage.local)
      },
      session:
        raw.storage.session
          ? {
              get: isFirefox
                ? raw.storage.session.get.bind(raw.storage.session)
                : promisify(raw.storage.session.get, raw.storage.session),
              set: isFirefox
                ? raw.storage.session.set.bind(raw.storage.session)
                : promisify(raw.storage.session.set, raw.storage.session)
            }
          : null,
      onChanged: raw.storage.onChanged
    } : null,
    alarms: raw.alarms || null,
    runtime: raw.runtime ? {
      onInstalled: raw.runtime.onInstalled,
      onMessage: raw.runtime.onMessage,
      onStartup: raw.runtime.onStartup,
      sendMessage: isFirefox
        ? raw.runtime.sendMessage.bind(raw.runtime)
        : promisify(raw.runtime.sendMessage, raw.runtime),
      getURL: raw.runtime.getURL.bind(raw.runtime),
      openOptionsPage: raw.runtime.openOptionsPage
        ? (isFirefox ? raw.runtime.openOptionsPage.bind(raw.runtime) : promisify(raw.runtime.openOptionsPage, raw.runtime))
        : null
    } : null,
    scripting: raw.scripting ? {
      executeScript: isFirefox
        ? raw.scripting.executeScript.bind(raw.scripting)
        : promisify(raw.scripting.executeScript, raw.scripting)
    } : null,
    action: raw.action || raw.browserAction || null,
    commands: raw.commands || null
  };

  // storage.session fallback to storage.local transparently
  if (!api.storage.session) {
    api.storage.session = api.storage.local;
  }

  global.TF = global.TF || {};
  global.TF.api = api;
})(typeof self !== 'undefined' ? self : window);
