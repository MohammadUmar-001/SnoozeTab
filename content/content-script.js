/**
 * content-script.js — isolated world. Talks to the background service
 * worker over runtime messages, and bridges freeze/unfreeze events to the
 * MAIN-world timer-hooks.js via window CustomEvents. Also handles the parts
 * that don't need page-world access: pausing media and watching forms.
 */
const api = self.TF.api;

let formDirty = false;
let formDirtyTimer = null;

function reportFormDirty(dirty) {
  if (dirty === formDirty) return;
  formDirty = dirty;
  api.runtime.sendMessage({ type: 'TF_FORM_DIRTY', dirty }).catch(() => {});
}

document.addEventListener(
  'input',
  (e) => {
    const el = e.target;
    if (!el || !('value' in el)) return;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) {
      reportFormDirty(true);
      clearTimeout(formDirtyTimer);
      // Auto-clear the "dirty" flag a while after typing stops, so a page
      // left open with stale text doesn't stay protected forever.
      formDirtyTimer = setTimeout(() => reportFormDirty(false), 10 * 60 * 1000);
    }
  },
  true
);

document.addEventListener('submit', () => reportFormDirty(false), true);

function pauseMedia() {
  document.querySelectorAll('video, audio').forEach((el) => {
    if (!el.paused) {
      el.dataset.tfWasPlaying = '1';
      el.pause();
    }
  });
}

function resumeMedia() {
  document.querySelectorAll('video[data-tf-was-playing], audio[data-tf-was-playing]').forEach((el) => {
    el.play().catch(() => {});
    delete el.dataset.tfWasPlaying;
  });
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TF_FREEZE') {
    pauseMedia();
    window.dispatchEvent(new CustomEvent('tf:freeze'));
    sendResponse({ ok: true });
  } else if (message.type === 'TF_UNFREEZE') {
    resumeMedia();
    window.dispatchEvent(new CustomEvent('tf:unfreeze'));
    sendResponse({ ok: true });
  }
  return true;
});
