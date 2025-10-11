(async () => {
  const listEl  = document.getElementById('list');
  const searchEl = document.getElementById('search');
  const countEl = document.getElementById('count');

  /** In-Memory-Liste der Prompts */
  let prompts = [];
  // Problem hier

  /** JSON laden */
  async function loadPrompts() {
  const { prompts: storedPrompts } = await chrome.storage.local.get("prompts");
  if (Array.isArray(storedPrompts) && storedPrompts.length > 0) {
    prompts = storedPrompts;
  } else {
    const url = chrome.runtime.getURL('data/prompts.json');
    const res = await fetch(url);
    if (!res.ok) throw new Error('prompts.json konnte nicht geladen werden');
    prompts = await res.json();
  }
  render(prompts);
  }

  /** HTML-Escaping für Labels/IDs */
  function escapeHtml(s) {
    return s.replace(/[&<>'"]/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    }[c]));
  }

  /** Kürzt den sichtbaren Prompt-Text auf die verfügbare Höhe und fügt bei Bedarf eine Ellipse an. */
  function clampPromptPreview(el, fullText) {
    el.textContent = fullText; // zunächst den vollständigen Text einsetzen
    if (!fullText || el.clientHeight === 0) return; // nichts zu tun, wenn kein Text oder Element unsichtbar ist
    const limitHeight = el.clientHeight;
    if (el.scrollHeight <= limitHeight) return; // Text passt bereits ohne Kürzung

    let low = 0;
    let high = fullText.length;
    while (low < high) { // binäre Suche nach maximaler Textlänge, die hineinpasst
      const mid = Math.floor((low + high + 1) / 2);
      const candidate = `${fullText.slice(0, mid).trimEnd()}…`;
      el.textContent = candidate;
      if (el.scrollHeight <= limitHeight) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    const truncated = fullText.slice(0, low).trimEnd();
    el.textContent = truncated ? `${truncated}…` : '…'; // endgültige Vorschau setzen
  }

  /** Liste rendern */
  function render(items) {
    listEl.innerHTML = ''; // vorhandene Anzeige zurücksetzen, bevor neue Elemente eingefügt werden
    countEl.textContent = `${items.length} Hits`; // Trefferanzahl im Zählerbereich aktualisieren
    for (const p of items) { // jeden Prompt-Datensatz nacheinander verarbeiten
      const wrap = document.createElement('div'); // Container für einen kompletten Listeneintrag erzeugen
      wrap.className = 'item'; // Container mit Styling für Listenelemente versehen

      // Meta-Bereich mit Label und Copy-Icon
      const meta = document.createElement('div'); // obere Zeile für Meta-Informationen erstellen
      meta.className = 'meta'; // Layout-Klasse für Meta-Bereich zuweisen

      const label = document.createElement('div'); // Label-Element vorbereiten
      label.className = 'label'; // Label-Styling aktivieren
      label.textContent = p.label || p.id; // sichtbaren Text setzen, Fallback auf ID
      meta.appendChild(label); // Label in den Meta-Bereich einfügen


  // Copy-Icon als klickbares Bild
  const copyIcon = document.createElement('img');
  copyIcon.className = 'copy';
  copyIcon.src = '../icons/copy.png';
  copyIcon.alt = 'Kopieren';
  copyIcon.title = 'Prompt kopieren';
  copyIcon.dataset.id = p.id;
  meta.appendChild(copyIcon);

  // Edit-Icon als klickbares Bild
  const editIcon = document.createElement('img');
  editIcon.className = 'edit';
  editIcon.src = '../icons/edit.png';
  editIcon.alt = 'Bearbeiten';
  editIcon.title = 'Prompt bearbeiten';
  editIcon.dataset.id = p.id;
  editIcon.style.marginLeft = '8px';
  meta.appendChild(editIcon);

      wrap.appendChild(meta); // Meta-Bereich in den Listeneintrag aufnehmen

      // Prompt-Text in eigenem Feld mit Abstand und Text-Overflow
      const promptBox = document.createElement('div'); // Bereich für den eigentlichen Prompttext erzeugen
      promptBox.className = 'prompt-box'; // Styling für Textfeld anwenden
      const fullText = p.text || ''; // vollständiger Prompt bleibt für das Kopieren erhalten
      wrap.appendChild(promptBox); // Textbereich unter dem Meta-Block hinzufügen
      listEl.appendChild(wrap); // fertigen Eintrag in die Liste einsetzen
      clampPromptPreview(promptBox, fullText); // Vorschau auf maximale Höhe kürzen und Ellipse setzen
    }
  }

  /** Suche */
  function filter(query) {
    const q = query.trim().toLowerCase();
    // Problem hier
    if (!q) return prompts;
    return prompts.filter(p =>
      (p.label && p.label.toLowerCase().includes(q)) ||
      (p.id && p.id.toLowerCase().includes(q)) ||
      (Array.isArray(p.tags) && p.tags.some(t => t.toLowerCase().includes(q))) ||
      (p.text && p.text.toLowerCase().includes(q))
    );
  }

  /** Kopieren mit Fallback */
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  /** Events */
  searchEl.addEventListener('input', e => render(filter(e.target.value)));

  document.addEventListener('click', async e => {
    // Kopieren
    const btn = e.target.closest('.copy');
    if (btn) {
      const id = btn.dataset.id;
      const p = prompts.find(x => x.id === id);
      if (!p) return;
      await copyToClipboard(p.text || '');
      btn.style.filter = 'brightness(0.7)';
      setTimeout(() => (btn.style.filter = ''), 600);
      return;
    }
    // Editieren
    const editBtn = e.target.closest('.edit');
    if (editBtn) {
      const id = editBtn.dataset.id;
      window.location.href = `edit.html?id=${encodeURIComponent(id)}`;
      return;
    }
  });

  /** init */
  try { await loadPrompts(); }
  catch (err) {
    listEl.textContent = 'Fehler: ' + (err && err.message ? err.message : String(err));
    countEl.textContent = '';
  }
})();
