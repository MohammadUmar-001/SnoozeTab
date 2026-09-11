const api = self.TF.api;

const els = {
  inactivityMinutes: document.getElementById('inactivityMinutes'),
  checkIntervalMinutes: document.getElementById('checkIntervalMinutes'),
  excludePinned: document.getElementById('excludePinned'),
  excludeAudible: document.getElementById('excludeAudible'),
  excludeForms: document.getElementById('excludeForms'),
  neverFreezeList: document.getElementById('neverFreezeList'),
  alwaysFreezeList: document.getElementById('alwaysFreezeList'),
  saveBtn: document.getElementById('saveBtn'),
  saveStatus: document.getElementById('saveStatus'),
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  importFile: document.getElementById('importFile')
};

function listToText(list) {
  return (list || []).join('\n');
}
function textToList(text) {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function populate(settings) {
  els.inactivityMinutes.value = settings.inactivityMinutes;
  els.checkIntervalMinutes.value = settings.checkIntervalMinutes;
  els.excludePinned.checked = settings.excludePinned;
  els.excludeAudible.checked = settings.excludeAudible;
  els.excludeForms.checked = settings.excludeForms;
  els.neverFreezeList.value = listToText(settings.neverFreezeList);
  els.alwaysFreezeList.value = listToText(settings.alwaysFreezeList);
  document.querySelector(`input[name="defaultMode"][value="${settings.defaultMode}"]`).checked = true;
}

function collect() {
  return {
    inactivityMinutes: Math.max(1, Number(els.inactivityMinutes.value) || 15),
    checkIntervalMinutes: Math.max(1, Number(els.checkIntervalMinutes.value) || 1),
    excludePinned: els.excludePinned.checked,
    excludeAudible: els.excludeAudible.checked,
    excludeForms: els.excludeForms.checked,
    neverFreezeList: textToList(els.neverFreezeList.value),
    alwaysFreezeList: textToList(els.alwaysFreezeList.value),
    defaultMode: document.querySelector('input[name="defaultMode"]:checked').value
  };
}

async function load() {
  const { settings } = await api.runtime.sendMessage({ type: 'TF_GET_STATE' });
  populate(settings);
}

els.saveBtn.addEventListener('click', async () => {
  const settings = collect();
  await api.runtime.sendMessage({ type: 'TF_SAVE_SETTINGS', settings });
  els.saveStatus.textContent = 'Saved';
  setTimeout(() => (els.saveStatus.textContent = ''), 2000);
});

els.exportBtn.addEventListener('click', async () => {
  const { settings } = await api.runtime.sendMessage({ type: 'TF_GET_STATE' });
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tab-freezer-settings.json';
  a.click();
  URL.revokeObjectURL(url);
});

els.importBtn.addEventListener('click', () => els.importFile.click());

els.importFile.addEventListener('change', async () => {
  const file = els.importFile.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    populate({ ...(await currentSettings()), ...parsed });
    els.saveStatus.textContent = 'Imported - review and click Save changes';
  } catch {
    els.saveStatus.textContent = 'Could not read that file';
  }
  els.importFile.value = '';
});

async function currentSettings() {
  const { settings } = await api.runtime.sendMessage({ type: 'TF_GET_STATE' });
  return settings;
}

load();
