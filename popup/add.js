// add.js – Add Prompt
(async () => {
  const nameInput = document.getElementById('add-name');
  const textInput = document.getElementById('add-text');
  const labelsInput = document.getElementById('add-labels');
  const saveBtn = document.getElementById('save-btn');
  const backBtn = document.getElementById('back-btn');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  backBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });
  backBtn.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') window.location.href = 'index.html';
  });

  saveBtn.addEventListener('click', async () => {
    if (saveBtn.disabled) return;
    const label = nameInput.value.trim();
    const text = textInput.value.trim();
    const labels = labelsInput.value.split(',').map(t => t.trim()).filter(Boolean);
    if (!label || !text) {
      alert('Bitte Name und Prompt ausfüllen.');
      return;
    }
    saveBtn.disabled = true;
    saveBtn.classList.add('is-saving');
    const flash = wait(400);
    try {
      // Load Prompts here
      const { prompts = [] } = await chrome.storage.local.get('prompts');
      // Generate unique ID
      let newId;
      do {
        newId = 'p' + Date.now() + Math.floor(Math.random() * 10000);
      } while (prompts.some(p => p.id === newId));
      // Create Prompt object
      const newPrompt = { id: newId, label, text, tags: labels };
      prompts.unshift(newPrompt);
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
})();
