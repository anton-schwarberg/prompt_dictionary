// Lädt die verpackte JSON einmalig in den Storage (beim ersten Install/Update)
// Lädt und ergänzt Prompts bei jedem Start, ohne Nutzereinträge zu überschreiben
async function syncPrompts() {
    const url = chrome.runtime.getURL("data/prompts.json");
    const res = await fetch(url);
    const filePrompts = await res.json();
    const { prompts: storedPrompts = [] } = await chrome.storage.local.get("prompts");

    // Füge nur neue Prompts aus der Datei hinzu (keine Duplikate anhand einer id oder text)
    // Annahme: Jeder Prompt hat eine eindeutige id oder text
    const mergedPrompts = [...storedPrompts];
    for (const prompt of filePrompts) {
        // Passe die Duplikatserkennung ggf. an (hier: nach id oder text)
        if (!mergedPrompts.some(p => p.id === prompt.id || p.text === prompt.text)) {
            mergedPrompts.push(prompt);
        }
    }
    await chrome.storage.local.set({ prompts: mergedPrompts });
    console.log(`Prompt Dictionary synchronisiert: ${mergedPrompts.length} Prompts`);
}

chrome.runtime.onStartup.addListener(syncPrompts);
chrome.runtime.onInstalled.addListener(syncPrompts);
