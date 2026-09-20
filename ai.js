/**
 * ai.js — Gemini helpers for note explanations and rewrites.
 * The API key is intentionally local to this browser.
 */

const GeminiAI = (() => {
  const KEY = 'ld_gemini_api_key';
  const MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];

  const labels = {
    explain: 'Explain this note',
    rewrite: 'Rewrite this note clearly',
    summarise: 'Summarise this note',
  };

  function getKey() {
    return localStorage.getItem(KEY) || '';
  }

  function saveKey(value) {
    const key = String(value || '').trim();
    if (key) localStorage.setItem(KEY, key);
    else localStorage.removeItem(KEY);
    return key;
  }

  function clearKey() {
    localStorage.removeItem(KEY);
  }

  function initSettings() {
    const input = document.getElementById('geminiApiKey');
    const save = document.getElementById('btnSaveGeminiKey');
    const clear = document.getElementById('btnClearGeminiKey');
    if (!input || !save || !clear) return;

    input.value = getKey() ? '••••••••••••••••' : '';
    save.addEventListener('click', () => {
      if (input.value === '••••••••••••••••') {
        UI.toast('Your saved Gemini key is unchanged.', 'info');
        return;
      }
      if (!input.value.trim()) {
        UI.toast('Paste a Gemini API key first.', 'warning');
        return;
      }
      saveKey(input.value);
      input.value = '••••••••••••••••';
      UI.toast('Gemini API key saved in this browser.', 'success');
    });
    clear.addEventListener('click', () => {
      clearKey();
      input.value = '';
      UI.toast('Gemini API key cleared.', 'success');
    });
  }

  function resetPanel() {
    const panel = document.getElementById('aiPanel');
    const copy = document.getElementById('btnCopyAi');
    const use = document.getElementById('btnUseAi');
    if (panel) panel.hidden = true;
    if (copy) copy.hidden = true;
    if (use) use.hidden = true;
  }

  function setPanel(title, status, content = '', showCopy = false) {
    const panel = document.getElementById('aiPanel');
    const titleEl = document.getElementById('aiPanelTitle');
    const statusEl = document.getElementById('aiPanelStatus');
    const contentEl = document.getElementById('aiPanelContent');
    const copy = document.getElementById('btnCopyAi');
    const use = document.getElementById('btnUseAi');
    panel.hidden = false;
    titleEl.textContent = title;
    statusEl.textContent = status;
    contentEl.innerHTML = formatMarkdown(content);
    copy.hidden = !showCopy;
    copy.dataset.copyText = content;
    use.hidden = true;
    use.dataset.useText = content;
  }

  // Render only the small Markdown subset useful for AI answers.
  // Escape first so model output can never inject HTML into the app.
  function formatMarkdown(text) {
    const lines = String(text || '').trim().split(/\r?\n/);
    const html = [];
    let inList = false;
    let inCode = false;
    let codeLanguage = '';
    let codeLines = [];

    const inline = (value) => UI.escapeHtml(value)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    const closeList = () => {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
    };

    const closeCode = () => {
      if (!inCode) return;
      const languageClass = codeLanguage ? ` class="language-${UI.escapeHtml(codeLanguage)}"` : '';
      html.push(`<pre><code${languageClass}>${UI.escapeHtml(codeLines.join('\n'))}</code></pre>`);
      inCode = false;
      codeLanguage = '';
      codeLines = [];
    };

    lines.forEach((line) => {
      const value = line.trim();
      const fence = value.match(/^```\s*([\w#+.-]*)\s*$/);
      if (fence) {
        closeList();
        if (inCode) closeCode();
        else {
          inCode = true;
          codeLanguage = fence[1];
        }
        return;
      }
      if (inCode) {
        codeLines.push(line);
        return;
      }
      if (!value) {
        closeList();
        return;
      }
      const bullet = value.match(/^(?:[-*])\s+(.+)$/);
      if (bullet) {
        if (!inList) {
          html.push('<ul>');
          inList = true;
        }
        html.push(`<li>${inline(bullet[1])}</li>`);
      } else {
        closeList();
        html.push(`<p>${inline(value)}</p>`);
      }
    });
    closeList();
    closeCode();
    return html.join('');
  }

  function buildPrompt(action, category, note) {
    const instruction = {
      explain: 'Teach me this note in very easy-to-understand language, as if I am learning the topic for the first time. Give a thorough explanation of every important point. Define technical terms in simple words, explain why each idea matters, and include practical examples wherever helpful. Organise the answer with clear headings and readable paragraphs. If code is present, explain it line by line or section by section. At the very end, give one small everyday analogy that makes the main idea easy to remember. Do not omit important details or make the answer unnecessarily short.',
      rewrite: 'Rewrite these learning notes concisely and properly. Improve the structure, clarity, grammar, and wording while preserving all important technical facts, examples, code meaning, and follow-up points. Use useful headings or bullets where appropriate. Do not force the response into a fixed number of points.',
      summarise: 'Give a clear, complete summary of this note in simple language. Cover all meaningful concepts, technical terms, examples, results, and follow-up items. Do not limit the summary to 3 points or any fixed number of points. Keep it shorter than the original, but do not leave out important information.',
    }[action];
    const plainNote = UI.richTextToPlain(note);
    return `${instruction}\n\nIf the note contains code, preserve relevant snippets and explain them clearly. Support JavaScript, TypeScript, C#, and Python syntax. Use Markdown code fences with the correct language label (for example, \`\`\`js, \`\`\`ts, \`\`\`csharp, or \`\`\`python). Do not invent code that is not supported by the note.\n\nCategory: ${category}\nNote:\n${plainNote}`;
  }

  function cleanForNote(text) {
    return String(text || '')
      .replace(/^```[\w#+.-]*\s*$/gm, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*[-*]\s+/gm, '• ')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function run(action, noteId) {
    const key = getKey();
    if (!key) {
      setPanel('Gemini setup needed', 'Add your API key in Settings to use Gemini AI.', 'Open Settings → Gemini AI, paste your key, and save it.');
      return;
    }

    const note = await DB.Notes.getById(noteId);
    if (!note) return;
    const lookup = await Categories.buildLookup();
    const category = lookup[note.categoryId] || 'General';
    setPanel(labels[action], 'Gemini is thinking…');

    try {
      let lastError;
      for (const model of MODELS) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
              body: JSON.stringify({
                contents: [{ parts: [{ text: buildPrompt(action, category, note.content) }] }],
                // Keep the limit high enough for complete explanations, rewrites, and summaries.
                generationConfig: {
                  temperature: action === 'rewrite' ? 0.45 : 0.25,
                  maxOutputTokens: 8192,
                },
              }),
            });
            const payload = await response.json();
            if (!response.ok) {
              const error = new Error(payload.error?.message || `Gemini request failed (${response.status}).`);
              error.retryable = [429, 500, 502, 503, 504].includes(response.status) || /high demand|overload|temporar/i.test(error.message);
              throw error;
            }
            let text = payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
            if (!text) throw new Error('Gemini returned an empty response.');

            // If Gemini stopped only because it reached the output limit, ask it
            // to continue from the exact stopping point instead of losing content.
            if (payload.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
              setPanel(labels[action], 'Gemini is finishing the response…');
              const continuation = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
                body: JSON.stringify({
                  contents: [
                    { role: 'user', parts: [{ text: buildPrompt(action, category, note.content) }] },
                    { role: 'model', parts: [{ text }] },
                    { role: 'user', parts: [{ text: 'Continue from exactly where you stopped. Do not repeat anything. Complete the answer fully.' }] },
                  ],
                  generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
                }),
              });
              const continuationPayload = await continuation.json();
              if (continuation.ok) {
                const continuationText = continuationPayload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
                if (continuationText) text += `\n\n${continuationText}`;
              }
            }
            setPanel(labels[action], `Generated with ${model}.`, text, true);
            const useButton = document.getElementById('btnUseAi');
            if (action === 'rewrite' && useButton) {
              useButton.hidden = false;
              useButton.dataset.useText = cleanForNote(text);
            }
            return;
          } catch (error) {
            lastError = error;
            if (!error.retryable || attempt === 1) break;
            setPanel(labels[action], 'Gemini is busy; retrying…');
            await new Promise(resolve => setTimeout(resolve, 900 * (attempt + 1)));
          }
        }
        if (!lastError?.retryable) break;
      }
      throw lastError || new Error('Gemini request failed.');
    } catch (error) {
      setPanel('Gemini error', 'The request could not be completed.', `${error.message}\n\nPlease try again in a moment.`);
    }
  }

  function init() {
    initSettings();
    document.querySelectorAll('[data-ai-action]').forEach(button => {
      button.addEventListener('click', () => {
        if (typeof Notes !== 'undefined' && Notes.getCurrentViewNoteId) {
          run(button.dataset.aiAction, Notes.getCurrentViewNoteId());
        }
      });
    });
    document.getElementById('btnCopyAi')?.addEventListener('click', async (event) => {
      const text = event.currentTarget.dataset.copyText || '';
      try {
        await navigator.clipboard.writeText(text);
        UI.toast('AI response copied.', 'success');
      } catch (_) {
        UI.toast('Could not copy the response.', 'error');
      }
    });
    document.getElementById('btnUseAi')?.addEventListener('click', async (event) => {
      const content = event.currentTarget.dataset.useText || '';
      if (!content || typeof Notes === 'undefined') return;
      const confirmed = await UI.confirm({
        title: 'Use rewritten note?',
        message: 'Replace the current note text with this rewritten version?',
        sub: 'The change will appear in the editor first. Save the note to apply it.',
        okLabel: 'Use Rewrite',
        okClass: 'btn-primary',
      });
      if (confirmed) {
        await Notes.openEditWithContent(Notes.getCurrentViewNoteId(), content);
      }
    });
  }

  return { init, resetPanel };
})();
