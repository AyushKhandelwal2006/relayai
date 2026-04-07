chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'CAPTURE_CONTEXT') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      var tab = tabs[0];
      if (!tab || !tab.id) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }
      chrome.tabs.sendMessage(tab.id, { action: 'SCRAPE_CHAT' }, function(response) {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: 'Content script not ready. Refresh the page.' });
        } else {
          sendResponse(response);
        }
      });
    });
    return true;
  }

  if (message.action === 'TRANSFER_TO_CLAUDE') {
    handleTransfer(message.data, message.target || 'claude', sendResponse);
    return true;
  }

  if (message.action === 'RETRANSFER_MANIFEST') {
    var prompt  = buildPrompt(message.manifest);
    var target  = message.target || 'claude';
    openTarget(target, prompt);
    return true;
  }
});

function getTargetUrl(target) {
  var urls = {
    claude:      'https://claude.ai/new?q=',
    chatgpt:     'https://chatgpt.com/?q=',
    gemini:      'https://gemini.google.com/app',
    perplexity:  'https://www.perplexity.ai/?q='
  };
  return urls[target] || urls.claude;
}

function openTarget(target, prompt) {
  var encoded    = encodeURIComponent(prompt);
  var urlTargets = ['claude', 'chatgpt', 'perplexity'];

  if (urlTargets.includes(target)) {
    chrome.tabs.create({ url: getTargetUrl(target) + encoded });
    return;
  }

  // Gemini — needs special injection
  chrome.tabs.create({ url: 'https://gemini.google.com/app' }, function(tab) {
    var checkReady = setInterval(function() {
      chrome.tabs.get(tab.id, function(t) {
        if (chrome.runtime.lastError) { clearInterval(checkReady); return; }
        if (t.status === 'complete') {
          clearInterval(checkReady);
          // Wait extra time for Gemini's React to mount
          setTimeout(function() {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: function(promptText) {
                var tries = 0;
                var timer = setInterval(function() {
                  tries++;

                  var input =
                    document.querySelector('.ql-editor') ||
                    document.querySelector('rich-textarea .ql-editor') ||
                    document.querySelector('div[contenteditable="true"]') ||
                    document.querySelector('rich-textarea') ||
                    document.querySelector('textarea') ||
                    document.querySelector('p[data-placeholder]');

                  if (input) {
                    clearInterval(timer);
                    input.click();
                    input.focus();

                    // Try execCommand first — best for contenteditable
                    var success = document.execCommand('insertText', false, promptText);

                    if (!success) {
                      // Fallback: set textContent and fire events
                      input.textContent = promptText;
                      input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
                      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
                      input.dispatchEvent(new KeyboardEvent('keyup',  { bubbles: true }));
                    }
                  }

                  if (tries > 30) {
                    clearInterval(timer);
                    // Last resort — copy to clipboard and alert user
                    navigator.clipboard.writeText(promptText).then(function() {
                      alert('RelayAI: Could not auto-fill. Your context has been copied to clipboard — press Ctrl+V to paste it.');
                    });
                  }
                }, 600);
              },
              args: [prompt]
            });
          }, 3000);
        }
      });
    }, 500);
  });
}

async function handleTransfer(data, target, sendResponse) {
  try {
    var res = await fetch('http://localhost:3000/api/parse-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: data.messages, rawText: data.rawText })
    });

    if (!res.ok) throw new Error('Backend error: ' + res.status);

    var json     = await res.json();
    var manifest = json.manifest;

    await chrome.storage.local.set({ pendingManifest: manifest });

    var prompt = buildPrompt(manifest);
    openTarget(target, prompt);

    sendResponse({ success: true, manifest: manifest });

  } catch(err) {
    console.error('[RelayAI] Transfer failed:', err);
    sendResponse({ success: false, error: err.message });
  }
}

function buildPrompt(manifest) {
  var stack = [].concat(
    (manifest.techStack && manifest.techStack.frontend) || [],
    (manifest.techStack && manifest.techStack.backend)  || [],
    (manifest.techStack && manifest.techStack.database) || []
  ).join(', ') || 'Not detected';

  var endpoints = (manifest.apiEndpoints && manifest.apiEndpoints.length)
    ? manifest.apiEndpoints.map(function(e) { return '  - ' + e.method + ' ' + e.path + ': ' + e.description; }).join('\n')
    : '  - None detected';

  var errors = (manifest.errorsEncountered && manifest.errorsEncountered.length)
    ? manifest.errorsEncountered.map(function(e) { return '  - ' + e.error + ' | Cause: ' + e.cause + ' | Fix: ' + (e.resolution || 'Unresolved'); }).join('\n')
    : '  - None';

  var files = (manifest.codeFiles && manifest.codeFiles.length)
    ? manifest.codeFiles.map(function(f) {
        return '  ' + f.filename + ' (' + f.language + ')\n  Purpose: ' + f.purpose + '\n```' + f.language + '\n' + f.latestCode + '\n```';
      }).join('\n\n')
    : '  - None';

  var models = (manifest.dataModels && manifest.dataModels.length)
    ? manifest.dataModels.map(function(m) {
        var fields = Object.entries(m.fields || {}).map(function(kv) { return kv[0] + ': ' + kv[1]; }).join(', ');
        return '  - ' + m.name + ': ' + fields;
      }).join('\n')
    : '  - None';

  return 'Hi! I am continuing a development project. Here is my full technical context transferred via RelayAI:\n\n' +
    '================================\n' +
    'PROJECT CONTEXT MANIFEST\n' +
    '================================\n\n' +
    'PROJECT: ' + (manifest.projectName || 'Unnamed') + '\n\n' +
    'SUMMARY:\n' + (manifest.summary || 'No summary') + '\n\n' +
    'TECH STACK: ' + stack + '\n\n' +
    'API ENDPOINTS:\n' + endpoints + '\n\n' +
    'DATA MODELS:\n' + models + '\n\n' +
    'CODE FILES:\n' + files + '\n\n' +
    'ERRORS ENCOUNTERED:\n' + errors + '\n\n' +
    'CURRENT STATUS:\n' + (manifest.currentStatus || 'Unknown') + '\n\n' +
    'NEXT STEPS:\n' + ((manifest.nextSteps || []).map(function(s) { return '  - ' + s; }).join('\n') || '  - Continue from current status') + '\n\n' +
    'IMPORTANT CONTEXT:\n' + (manifest.importantContext || 'None') + '\n\n' +
    '================================\n\n' +
    'Please confirm you understand this context and ask me what to work on next.';
}