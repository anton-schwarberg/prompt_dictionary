// edit.js – edit prompt page logic
(async () => {
  // get prompt id from URL
  const params = new URLSearchParams(window.location.search);
  const promptId = params.get('id');
  if (!promptId) {
    alert('Kein Prompt ausgewählt.');
    window.close();
    return;
  }

  // reference fields
  const nameInput = document.getElementById('edit-name');
  const textInput = document.getElementById('edit-text');
  const saveBtn = document.getElementById('save-btn');
  const backBtn = document.getElementById('back-btn');
  const deleteBtn = document.getElementById('delete-btn');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  const { prompts } = await chrome.storage.local.get("prompts");
  // Search prompt
  const idx = prompts.findIndex(p => p.id === promptId);
  if (idx === -1) {
    alert('Prompt nicht gefunden.');
    window.close();
    return;
  }
  const prompt = prompts[idx];
  nameInput.value = prompt.label || '';
  textInput.value = prompt.text || '';

  // Save
  saveBtn.addEventListener('click', async () => {
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    saveBtn.classList.add('is-saving');
    const flash = wait(400);
    prompt.label = nameInput.value.trim();
    prompt.text = textInput.value.trim();
    prompts[idx] = prompt;
    try {
      // Save in Storage
      await chrome.storage.local.set({ prompts });
      await flash;
      window.location.href = 'index.html';
    } catch (err) {
      console.error('Fehler beim Speichern des Prompts', err);
      saveBtn.classList.remove('is-saving');
      saveBtn.disabled = false;
      alert('Prompt konnte nicht gespeichert werden. Bitte erneut versuchen.');
    }
  });

  backBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });
  backBtn.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') window.location.href = 'index.html';
  });

  deleteBtn.addEventListener('click', async () => {
    if (confirm('Do you really want to delete this prompt?')) {
      prompts.splice(idx, 1);
      await chrome.storage.local.set({ prompts });
      window.location.href = 'index.html';
    }
    });

})();
