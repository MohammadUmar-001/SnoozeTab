const api = self.TF.api;

const tabListEl = document.getElementById('tabList');
const statLineEl = document.getElementById('statLine');
const enabledToggle = document.getElementById('enabledToggle');
const rowTemplate = document.getElementById('tabRowTemplate');

function timeAgo(ts) {
  if (!ts) return 'just now';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `idle ${mins}m`;
  const hrs = Math.round(mins / 60);
  return `idle ${hrs}h`;
}

function getStatus(tab) {
  if (tab.active) return { state: 'is-active', text: 'Active' };
  if (tab.frozen === 'discard' || tab.discarded) return { state: 'is-discarded', text: 'Discarded' };
  if (tab.frozen === 'soft') return { state: 'is-frozen', text: 'Soft-frozen' };
  if (!tab.eligible) return { state: 'is-excluded', text: tab.excludedReason || 'Excluded' };
  return { state: 'is-eligible', text: timeAgo(tab.lastActive) };
}

function renderTabs(tabs) {
  tabListEl.innerHTML = '';
  const frozenCount = tabs.filter((t) => t.frozen || t.discarded).length;
  statLineEl.textContent = `${frozenCount} frozen`;

  for (const tab of tabs) {
    const node = rowTemplate.content.cloneNode(true);
    const li = node.querySelector('.tf-row');
    const favicon = node.querySelector('.tf-favicon');
    const title = node.querySelector('.tf-row-title');
    const meta = node.querySelector('.tf-row-meta');
    const actionBtn = node.querySelector('.tf-action-btn');

    if (tab.favIconUrl) {
      favicon.src = tab.favIconUrl;
    } else {
      favicon.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%239ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
    }
    title.textContent = tab.title || tab.url;
    title.title = tab.url;

    const status = getStatus(tab);
    li.classList.add(status.state);
    meta.textContent = status.text;

    // Handle Custom Animated Dropdown
    const dropdown = node.querySelector('.tf-dropdown');
    const trigger = dropdown.querySelector('.tf-dropdown-trigger');
    const label = trigger.querySelector('.tf-dropdown-label');
    const items = dropdown.querySelectorAll('.tf-dropdown-item');

    const modeLabels = { auto: 'Auto', discard: 'Discard', soft: 'Soft', never: 'Never' };
    label.textContent = modeLabels[tab.mode || 'auto'];

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('is-open');

      // close all others
      document.querySelectorAll('.tf-dropdown.is-open').forEach(d => {
        if (d !== dropdown) {
          d.classList.remove('is-open');
          setTimeout(() => {
            if (!d.classList.contains('is-open')) {
              d.classList.remove('is-active');
            }
          }, 200);
        }
      });
      
      if (isOpen) {
        dropdown.classList.remove('is-open');
        setTimeout(() => {
          if (!dropdown.classList.contains('is-open')) {
            dropdown.classList.remove('is-active');
            dropdown.classList.remove('is-upwards');
            const appEl = document.getElementById('app');
            window.parent.postMessage({ type: 'TF_RESIZE', height: Math.min(appEl ? appEl.offsetHeight : 0, 500) }, '*');
          }
        }, 200);
      } else {
        // If there's more than 130px of space above, open upwards to avoid expanding the list
        const rect = trigger.getBoundingClientRect();
        if (rect.top > 130) {
          dropdown.classList.add('is-upwards');
        } else {
          dropdown.classList.remove('is-upwards');
        }
        
        dropdown.classList.add('is-active');
        void trigger.offsetHeight; // reflow
        dropdown.classList.add('is-open');
        setTimeout(() => {
          const appEl = document.getElementById('app');
          window.parent.postMessage({ type: 'TF_RESIZE', height: Math.min(appEl ? appEl.offsetHeight : 0, 500) }, '*');
        }, 10);
      }
    });

    items.forEach(item => {
      item.addEventListener('click', () => {
        const mode = item.dataset.value;
        label.textContent = modeLabels[mode];
        dropdown.classList.remove('is-open');
        dropdown.classList.remove('is-active');
        api.runtime.sendMessage({ type: 'TF_SET_TAB_MODE', tabId: tab.id, mode }).then(refresh);
      });
    });

    const isFrozen = tab.frozen || tab.discarded;

    if (isFrozen) {
      actionBtn.title = 'Wake up';
      actionBtn.addEventListener('click', () => {
        api.runtime.sendMessage({ type: 'TF_UNFREEZE_NOW', tabId: tab.id }).then(refresh);
      });
    } else if (tab.active) {
      actionBtn.title = 'Freeze now';
      actionBtn.addEventListener('click', () => {
        api.runtime.sendMessage({ type: 'TF_FREEZE_NOW', tabId: tab.id }).then(refresh);
      });
    } else {
      actionBtn.title = 'Freeze now';
      actionBtn.disabled = !tab.eligible && tab.mode === 'never';
      actionBtn.addEventListener('click', () => {
        api.runtime.sendMessage({ type: 'TF_FREEZE_NOW', tabId: tab.id }).then(refresh);
      });
    }

    tabListEl.appendChild(node);
  }
}

// Global click listener to close dropdowns when clicking outside
document.addEventListener('click', () => {
  document.querySelectorAll('.tf-dropdown.is-open').forEach(d => {
    d.classList.remove('is-open');
    setTimeout(() => {
      if (!d.classList.contains('is-open')) {
        d.classList.remove('is-active');
        const appEl = document.getElementById('app');
        window.parent.postMessage({ type: 'TF_RESIZE', height: Math.min(appEl ? appEl.offsetHeight : 0, 500) }, '*');
      }
    }, 200);
  });
});

async function refresh() {
  const { settings, tabs } = await api.runtime.sendMessage({ type: 'TF_GET_STATE' });
  enabledToggle.checked = settings.enabled;
  renderTabs(tabs);
  
  // Notify parent iframe to resize dynamically
  setTimeout(() => {
    const appEl = document.getElementById('app');
    const height = Math.min(appEl ? appEl.offsetHeight : document.documentElement.scrollHeight, 500);
    window.parent.postMessage({ type: 'TF_RESIZE', height }, '*');
  }, 10);
}

enabledToggle.addEventListener('change', () => {
  api.runtime.sendMessage({ type: 'TF_SAVE_SETTINGS', settings: { enabled: enabledToggle.checked } }).then(refresh);
});

document.getElementById('openOptions').addEventListener('click', () => {
  if (chrome?.runtime?.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open('../options/options.html', '_blank');
  }
});

refresh();
