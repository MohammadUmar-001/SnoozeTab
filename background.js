/**
 * background.js - Tab Freezer core logic.
 * Runs as a Chrome MV3 service worker / Firefox background script.
 */
if (typeof importScripts === 'function') {
  // Chrome service worker: these aren't auto-loaded, pull them in.
  importScripts('lib/browser-compat.js', 'lib/rules.js');
}

const api = self.TF.api;
const rules = self.TF.rules;

const DEFAULT_SETTINGS = {
  enabled: true,
  inactivityMinutes: 15,
  defaultMode: 'discard', // 'discard' | 'soft'
  excludePinned: true,
  excludeAudible: true,
  excludeForms: true,
  neverFreezeList: [], // array of match patterns, never touched
  alwaysFreezeList: [], // array of match patterns, ignore exclusions (except active tab)
  checkIntervalMinutes: 1
};

const CHECK_ALARM = 'tf-check-tabs';

// In-memory + session-persisted per-tab state.
// { [tabId]: { lastActive, mode: 'auto'|'discard'|'soft'|'never', frozen: false|'discard'|'soft', formDirty, url } }
let tabState = {};

// ---------- Settings ----------
async function getSettings() {
  const stored = await api.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

async function saveSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await api.storage.local.set({ settings: next });
  if (partial.checkIntervalMinutes) {
    setupAlarm(next.checkIntervalMinutes);
  }
  return next;
}

// ---------- Tab state persistence (survives service worker restarts) ----------
async function loadTabState() {
  const stored = await api.storage.session.get('tabState');
  tabState = stored.tabState || {};
}

let persistTimer = null;
function persistTabStateSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    api.storage.session.set({ tabState });
  }, 500);
}

function touchTab(tabId, extra = {}) {
  const existing = tabState[tabId] || { mode: 'auto', frozen: false, formDirty: false };
  tabState[tabId] = { ...existing, lastActive: Date.now(), ...extra };
  persistTabStateSoon();
}

// ---------- Eligibility (thin wrappers around the pure lib/rules.js logic) ----------
function isEligibleForFreeze(tab, settings) {
  return rules.isEligibleForFreeze(tab, tabState[tab.id], settings);
}

function effectiveMode(tabId, settings) {
  return rules.effectiveMode(tabState[tabId], settings);
}

// ---------- Freeze / unfreeze actions ----------
async function freezeTab(tab, mode) {
  if (mode === 'discard') {
    try {
      await api.tabs.discard(tab.id);
      touchTab(tab.id, { frozen: 'discard' });
    } catch (e) {
      console.warn('[Tab Freezer] discard failed for', tab.id, e);
    }
  } else {
    await api.tabs.sendMessage(tab.id, { type: 'TF_FREEZE' });
    touchTab(tab.id, { frozen: 'soft' });
  }
  await updateBadge();
}

async function unfreezeTab(tabId) {
  const state = tabState[tabId];
  if (state && state.frozen === 'soft') {
    await api.tabs.sendMessage(tabId, { type: 'TF_UNFREEZE' });
  }
  touchTab(tabId, { frozen: false });
  await updateBadge();
}

// ---------- Sweep: check every open tab ----------
async function sweep() {
  const settings = await getSettings();
  if (!settings.enabled) return;

  const tabs = await api.tabs.query({});
  const now = Date.now();
  const thresholdMs = settings.inactivityMinutes * 60 * 1000;

  for (const tab of tabs) {
    if (!tabState[tab.id]) {
      touchTab(tab.id, { url: tab.url });
      continue;
    }
    const state = tabState[tab.id];
    const idleFor = now - (state.lastActive || now);
    if (idleFor < thresholdMs) continue;

    const { eligible } = await isEligibleForFreeze(tab, settings);
    if (!eligible) continue;

    const mode = effectiveMode(tab.id, settings);
    await freezeTab(tab, mode);
  }
}

async function updateBadge() {
  const count = Object.values(tabState).filter((s) => s.frozen).length;
  const text = count > 0 ? String(count) : '';
  if (api.action.setBadgeText) {
    api.action.setBadgeText({ text });
    api.action.setBadgeBackgroundColor({ color: '#3B6E8F' });
  }
}

function setupAlarm(minutes) {
  api.alarms.create(CHECK_ALARM, { periodInMinutes: Math.max(1, minutes) });
}

// ---------- Event wiring ----------
api.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await api.storage.local.set({ settings });
  setupAlarm(settings.checkIntervalMinutes);
});

api.runtime.onStartup.addListener(async () => {
  await loadTabState();
  const settings = await getSettings();
  setupAlarm(settings.checkIntervalMinutes);
});

// Service workers can be re-spawned without onStartup firing (e.g. after
// being idled out) - make sure state is loaded lazily too.
let stateLoaded = false;
async function ensureStateLoaded() {
  if (!stateLoaded) {
    await loadTabState();
    
    // Prune dead tabs from state to prevent memory leaks across service worker restarts
    const tabs = await api.tabs.query({});
    const liveIds = new Set(tabs.map((t) => t.id));
    let mutated = false;
    for (const tabId in tabState) {
      if (!liveIds.has(Number(tabId))) {
        delete tabState[tabId];
        mutated = true;
      }
    }
    if (mutated) persistTabStateSoon();
    
    stateLoaded = true;
  }
}
ensureStateLoaded();

api.alarms.onAlarm?.addListener?.((alarm) => {
  if (alarm.name === CHECK_ALARM) sweep();
});

api.tabs.onActivated.addListener(async ({ tabId }) => {
  await ensureStateLoaded();
  touchTab(tabId);
  await unfreezeTab(tabId);
});

api.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  await ensureStateLoaded();
  if (changeInfo.status === 'loading') {
    // navigation clears form-dirty flag from the previous page
    touchTab(tabId, { formDirty: false, url: tab.url });
  }
  if (changeInfo.audible !== undefined || changeInfo.status === 'complete') {
    touchTab(tabId, { url: tab.url });
  }
});

api.tabs.onRemoved.addListener((tabId) => {
  delete tabState[tabId];
  persistTabStateSoon();
});

api.tabs.onCreated?.addListener((tab) => {
  touchTab(tab.id, { url: tab.url });
});

api.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === -1) return; // browser lost focus entirely
  await ensureStateLoaded();
  const tabs = await api.tabs.query({ active: true, windowId });
  if (tabs[0]) {
    touchTab(tabs[0].id);
    await unfreezeTab(tabs[0].id);
  }
});

// Messages from popup / options / content scripts.
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // keep the channel open for async response
});

async function handleMessage(message, sender) {
  await ensureStateLoaded();
  switch (message.type) {
    case 'TF_GET_STATE': {
      const settings = await getSettings();
      const tabs = await api.tabs.query({});
      const enriched = await Promise.all(
        tabs.map(async (tab) => {
          const state = tabState[tab.id] || {};
          const { eligible, reason } = await isEligibleForFreeze(tab, settings);
          return {
            id: tab.id,
            title: tab.title,
            url: tab.url,
            favIconUrl: tab.favIconUrl,
            active: tab.active,
            pinned: tab.pinned,
            audible: tab.audible,
            discarded: tab.discarded,
            frozen: state.frozen || false,
            mode: state.mode || 'auto',
            lastActive: state.lastActive,
            eligible,
            excludedReason: reason
          };
        })
      );
      return { settings, tabs: enriched };
    }

    case 'TF_SAVE_SETTINGS': {
      const next = await saveSettings(message.settings);
      return { settings: next };
    }

    case 'TF_SET_TAB_MODE': {
      touchTab(message.tabId, { mode: message.mode });
      if (message.mode === 'never') await unfreezeTab(message.tabId);
      return { ok: true };
    }

    case 'TF_FREEZE_NOW': {
      const tab = await api.tabs.get(message.tabId);
      const settings = await getSettings();
      const mode = message.mode || effectiveMode(tab.id, settings);
      await freezeTab(tab, mode);
      return { ok: true };
    }

    case 'TF_UNFREEZE_NOW': {
      await unfreezeTab(message.tabId);
      return { ok: true };
    }

    case 'TF_FORM_DIRTY': {
      if (sender.tab) touchTab(sender.tab.id, { formDirty: message.dirty });
      return { ok: true };
    }

    case 'TF_ADD_PATTERN': {
      const settings = await getSettings();
      const list = settings[message.listName] || [];
      if (!list.includes(message.pattern)) list.push(message.pattern);
      const next = await saveSettings({ [message.listName]: list });
      return { settings: next };
    }

    default:
      return { ok: false, error: 'unknown message type' };
  }
}

// Keyboard shortcuts
api.commands?.onCommand?.addListener(async (command) => {
  await ensureStateLoaded();
  const [activeTab] = await api.tabs.query({ active: true, currentWindow: true });
  if (command === 'freeze-current-tab' && activeTab) {
    const settings = await getSettings();
    await freezeTab(activeTab, effectiveMode(activeTab.id, settings));
  }
  if (command === 'toggle-auto-freeze') {
    const settings = await getSettings();
    await saveSettings({ enabled: !settings.enabled });
  }
});

// Overlay Toggle
api.action.onClicked?.addListener(async (tab) => {
  if (tab && tab.id) {
    try {
      await api.tabs.sendMessage(tab.id, { type: 'TF_TOGGLE_OVERLAY' });
    } catch {
      // If the content script isn't running (e.g. the tab was opened before extension reloaded),
      // inject it dynamically and then send the message!
      try {
        await api.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['lib/browser-compat.js', 'content/overlay.js']
        });
        await api.tabs.sendMessage(tab.id, { type: 'TF_TOGGLE_OVERLAY' });
      } catch (err) {
        console.warn('[Tab Freezer] Could not toggle overlay on this page', err);
        // Fallback to options page if we can't inject (like on chrome:// pages)
        api.runtime.openOptionsPage();
      }
    }
  }
});
