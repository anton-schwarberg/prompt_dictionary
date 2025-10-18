(async () => {
  const listEl  = document.getElementById('list');
  const searchEl = document.getElementById('search');
  const countEl = document.getElementById('count');

  /** In-Memory-Liste der Prompts */
  let prompts = [];
  // Problem hier
  let lastRenderedCount = 0;
  let reorderMessageTimer = null;
  let currentDropTarget = null;
  const REORDER_HINT_TIMEOUT = 2000;

  /** Prompts laden nur aus Storage */
  async function loadPrompts() {
    const { prompts: storedPrompts = [] } = await chrome.storage.local.get("prompts");
    prompts = storedPrompts;
    render(prompts);
  }

  function isSearchActive() {
    return !!searchEl.value && searchEl.value.trim().length > 0;
  }

  function showTemporaryMessage(message) {
    if (reorderMessageTimer) clearTimeout(reorderMessageTimer);
    countEl.textContent = message;
    reorderMessageTimer = setTimeout(() => {
      countEl.textContent = `${lastRenderedCount} Hits`;
      reorderMessageTimer = null;
    }, REORDER_HINT_TIMEOUT);
  }

  function setDropTarget(el) {
    if (currentDropTarget === el) return;
    if (currentDropTarget) currentDropTarget.classList.remove('drop-target');
    currentDropTarget = el;
    if (currentDropTarget) currentDropTarget.classList.add('drop-target');
  }

  function getDragAfterElement(container, y) {
    const elements = [...container.querySelectorAll('.item:not(.dragging)')];
    let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
    for (const child of elements) {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        closest = { offset, element: child };
      }
    }
    return closest.element;
  }

  function attachDragHandlers(itemEl, handleEl) {
    const resetDraggable = () => {
      itemEl.draggable = false;
      delete itemEl.dataset.dragArmed;
    };

    const armDrag = e => {
      if (isSearchActive()) {
        if (e) e.preventDefault();
        showTemporaryMessage('Clear search to reorder');
        return false;
      }
      itemEl.draggable = true;
      itemEl.dataset.dragArmed = '1';
      return true;
    };

    const handlePress = e => {
      if (e.type === 'touchstart') {
        armDrag(e);
      } else {
        armDrag(e);
      }
    };

    const handleRelease = e => {
      const stillPressed = e && typeof e.buttons === 'number' && e.buttons !== 0;
      if (stillPressed) return;
      if (!itemEl.classList.contains('dragging')) {
        resetDraggable();
      }
    };

    handleEl.addEventListener('mousedown', handlePress);
    handleEl.addEventListener('touchstart', handlePress, { passive: false });
    handleEl.addEventListener('mouseup', handleRelease);
    handleEl.addEventListener('mouseleave', handleRelease);
    handleEl.addEventListener('touchend', handleRelease);
    handleEl.addEventListener('touchcancel', handleRelease);

    itemEl.addEventListener('dragstart', e => {
      if (itemEl.dataset.dragArmed !== '1') {
        e.preventDefault();
        resetDraggable();
        return;
      }
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', itemEl.dataset.id || '');
      requestAnimationFrame(() => itemEl.classList.add('dragging'));
      setDropTarget(null);
    });

    itemEl.addEventListener('drag', () => {
      // keep card elevated while dragging even if browser fires multiple drag events
      if (!itemEl.classList.contains('dragging') && itemEl.dataset.dragArmed === '1') {
        itemEl.classList.add('dragging');
      }
    });

    itemEl.addEventListener('dragend', async () => {
      itemEl.classList.remove('dragging');
      resetDraggable();
      setDropTarget(null);
      try {
        await finalizeReorder();
      } catch (err) {
        console.error('Reorder failed', err);
        render(isSearchActive() ? filter(searchEl.value) : prompts);
        showTemporaryMessage('Unable to save order');
      }
    });
  }

  async function finalizeReorder() {
    const orderedItems = Array.from(listEl.children);
    if (!orderedItems.length) return;
    const orderedIds = orderedItems.map(el => el.dataset.id).filter(Boolean);
    if (!orderedIds.length) return;
    if (orderedIds.length !== prompts.length) {
      // Liste war gefiltert, ursprüngliche Reihenfolge beibehalten
      render(isSearchActive() ? filter(searchEl.value) : prompts);
      return;
    }

    const unchanged = orderedIds.every((id, idx) => id === (prompts[idx] && prompts[idx].id));
    if (unchanged) return;

    const idMap = new Map(prompts.map(p => [p.id, p]));
    const newPrompts = orderedIds.map(id => idMap.get(id)).filter(Boolean);
    if (newPrompts.length !== prompts.length) {
      // sicherheitshalber nichts überschreiben, falls IDs fehlen
      render(isSearchActive() ? filter(searchEl.value) : prompts);
      showTemporaryMessage('Unable to save order');
      return;
    }

    prompts = newPrompts;
    await chrome.storage.local.set({ prompts });
    render(isSearchActive() ? filter(searchEl.value) : prompts);
  }

  listEl.addEventListener('dragover', e => {
    const dragging = listEl.querySelector('.item.dragging');
    if (!dragging) return;
    e.preventDefault();
    const afterElement = getDragAfterElement(listEl, e.clientY);
    if (afterElement == null) {
      if (listEl.lastElementChild !== dragging) {
        listEl.appendChild(dragging);
      }
      setDropTarget(dragging);
    } else {
      if (afterElement !== dragging) {
        listEl.insertBefore(dragging, afterElement);
      }
      setDropTarget(dragging);
    }
  });

  listEl.addEventListener('drop', e => e.preventDefault());
  listEl.addEventListener('dragleave', e => {
    if (!listEl.contains(e.relatedTarget)) {
      setDropTarget(null);
    }
  });

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
    lastRenderedCount = items.length;
    countEl.textContent = `${items.length} Hits`; // Trefferanzahl im Zählerbereich aktualisieren
    for (const p of items) { // jeden Prompt-Datensatz nacheinander verarbeiten
      const wrap = document.createElement('div'); // Container für einen kompletten Listeneintrag erzeugen
      wrap.className = 'item'; // Container mit Styling für Listenelemente versehen
      wrap.dataset.id = p.id;
      wrap.draggable = false;

      // Meta-Bereich mit Label und Copy-Icon
      const meta = document.createElement('div'); // obere Zeile für Meta-Informationen erstellen
      meta.className = 'meta'; // Layout-Klasse für Meta-Bereich zuweisen

      const metaLeft = document.createElement('div');
      metaLeft.className = 'meta-left';

      const handleBtn = document.createElement('button');
      handleBtn.type = 'button';
      handleBtn.className = 'drag-handle';
      handleBtn.setAttribute('aria-label', 'Drag to reorder');
      metaLeft.appendChild(handleBtn);

      const label = document.createElement('div'); // Label-Element vorbereiten
      label.className = 'label'; // Label-Styling aktivieren
      label.textContent = p.label || p.id; // sichtbaren Text setzen, Fallback auf ID
      metaLeft.appendChild(label); // Label in den Meta-Bereich einfügen
      meta.appendChild(metaLeft);

      const actions = document.createElement('div');
      actions.className = 'meta-actions';

      // Export single prompt icon
      const exportsingle = document.createElement('img');
      exportsingle.className = 'export-single';
      exportsingle.src = '../icons/export.png';
      exportsingle.alt = 'export';
      exportsingle.title = 'export this prompt';
      exportsingle.dataset.id = p.id;
      actions.appendChild(exportsingle);

      // Edit-Icon als klickbares Bild
      const editIcon = document.createElement('img');
      editIcon.className = 'edit';
      editIcon.src = '../icons/edit.png';
      editIcon.alt = 'edit';
      editIcon.title = 'edit prompt';
      editIcon.dataset.id = p.id;
      actions.appendChild(editIcon);

      // Copy-Icon als klickbares Bild
      const copyIcon = document.createElement('img');
      copyIcon.className = 'copy';
      copyIcon.src = '../icons/copy.png';
      copyIcon.alt = 'copy';
      copyIcon.title = 'copy prompt';
      copyIcon.dataset.id = p.id;
      actions.appendChild(copyIcon);

      meta.appendChild(actions);
      wrap.appendChild(meta); // Meta-Bereich in den Listeneintrag aufnehmen

      // Prompt-Text in eigenem Feld mit Abstand und Text-Overflow
      const promptBox = document.createElement('div'); // Bereich für den eigentlichen Prompttext erzeugen
      promptBox.className = 'prompt-box'; // Styling für Textfeld anwenden
      const fullText = p.text || ''; // vollständiger Prompt bleibt für das Kopieren erhalten
      wrap.appendChild(promptBox); // Textbereich unter dem Meta-Block hinzufügen
      listEl.appendChild(wrap); // fertigen Eintrag in die Liste einsetzen
      clampPromptPreview(promptBox, fullText); // Vorschau auf maximale Höhe kürzen und Ellipse setzen
      attachDragHandlers(wrap, handleBtn);
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

  // Add Prompt Button
  const addBtn = document.getElementById('add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      window.location.href = 'add.html';
    });
  }

  document.addEventListener('click', async e => {
    // Copy
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

    const exportBtn = e.target.closest('.export-single');
    if (exportBtn) {
      const id = exportBtn.dataset.id;
      const p = prompts.find(x => x.id === id);
      if (!p) return;
      exportBtn.style.filter = 'brightness(0.7)';
      setTimeout(() => (exportBtn.style.filter = ''), 200);
      const dataStr = JSON.stringify(p, null, 2);
      const blob = new Blob([dataStr], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (p.label || 'prompt')+'.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      return;
    }
  });

  /** init */
  try { await loadPrompts(); }
  catch (err) {
    listEl.textContent = 'Fehler: ' + (err && err.message ? err.message : String(err));
    countEl.textContent = '';
  }
  // Export Button
  const exportBtn = document.getElementById('export-btn');

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (confirm('Do you want to export all prompts as JSON?')) {
        exportBtn.style.filter = 'brightness(0.7)';
        setTimeout(() => exportBtn.style.filter = '', 600);
        // Prompts als JSON exportieren und herunterladen
        const dataStr = JSON.stringify(prompts, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'prompts.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
      }
    });
  }

    const importBtn = document.getElementById('import-btn');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json,application/json';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        fileInput.addEventListener('change', async () => {
          const file = fileInput.files[0];
          if (!file) return;
          const text = await file.text();
          let imported;
          try {
            imported = JSON.parse(text);
            if (!Array.isArray(imported)) throw new Error('Json must be array');  
          } catch (e) {
            alert('invalid JSON format: ' + e.message);
            document.body.removeChild(fileInput);
            return;
          }

          // Load prompts from storage and test if they exist
          const {prompts = []} = await chrome.storage.local.get('prompts');
          let changed = false;
          for (const imp of imported) {
            if (!imp.id || !imp.label || !imp.text) continue;

            const idx = prompts.findIndex(p => p.id === imp.id);
            if (idx == -1) {
              prompts.push(imp);
              changed = true;
            } else {
              const existing = prompts[idx];
              if (
                existing.label === imp.label &&
                existing.text === imp.text
              ) {
                continue; // prompt identical, skipping
              } else if (
                  existing.label === imp.label &&
                  existing.text !== imp.text
                ) {
                  let newId = 'p' + Date.now() + Math.floor(Math.random()*10000);
                  let newLabel = imp.label + ' (imported)';
                  prompts.push({
                    id: newId,
                    label: newLabel,
                    text: imp.text,
                    tags: imp.tags || []
                  });
                  changed = true;
                } else {
                  let newId;
                  do {
                    newId = 'p' + Date.now() + Math.floor(Math.random()*10000);
                  } while (prompts.some(p => p.id === newId));
                  prompts.push({
                    id: newId,
                    label: imp.label,
                    text: imp.text,
                    tags: imp.tags || []
                  });
                  changed = true;
              }
            }
          }
          if (changed) {
            await chrome.storage.local.set({prompts});
            alert('Import successful!');
            location.reload();
          } else {
            alert('No new prompts to import.');
          }
          document.body.removeChild(fileInput);
        });
        fileInput.click();
      });
    }
})();
