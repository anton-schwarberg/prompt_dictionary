// edit.js – Prompt bearbeiten und speichern
(async () => {
  // Prompt-ID aus URL holen
  const params = new URLSearchParams(window.location.search);
  const promptId = params.get('id');
  if (!promptId) {
    alert('Kein Prompt ausgewählt.');
    window.close();
    return;
  }

  // Felder referenzieren
  const nameInput = document.getElementById('edit-name');
  const textInput = document.getElementById('edit-text');
  const saveBtn = document.getElementById('save-btn');
  const backBtn = document.getElementById('back-btn');

  // Prompts laden
  const url = chrome.runtime.getURL('../data/prompts.json');
  let prompts = [];
  try {
    const res = await fetch(url);
    prompts = await res.json();
  } catch {
    alert('Prompts konnten nicht geladen werden.');
    window.close();
    return;
  }

  // Prompt suchen
  const idx = prompts.findIndex(p => p.id === promptId);
  if (idx === -1) {
    alert('Prompt nicht gefunden.');
    window.close();
    return;
  }
  const prompt = prompts[idx];
  nameInput.value = prompt.label || '';
  textInput.value = prompt.text || '';

  // Speichern
  saveBtn.addEventListener('click', async () => {
    prompt.label = nameInput.value.trim();
    prompt.text = textInput.value.trim();
    prompts[idx] = prompt;
    // Speichern im Storage
    await chrome.storage.local.set({ prompts });
    window.location.href = 'index.html';
  });

  backBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

})();
