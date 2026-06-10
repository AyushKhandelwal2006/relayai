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
    var res = await fetch('https://relayai-2wfo.onrender.com/api/parse-context', {
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
    (manifest.techStack && manifest.techStack.database) || [],
    (manifest.techStack && manifest.techStack.other)    || []
  ).join(', ') || 'Not detected';

  var endpoints = (manifest.apiEndpoints && manifest.apiEndpoints.length)
    ? manifest.apiEndpoints.map(function(e) {
        return '  ' + e.method + ' ' + e.path + '\n' +
               '  Description: ' + e.description + '\n' +
               '  Auth: ' + (e.authRequired ? 'Required' : 'Not required') + '\n' +
               '  Status: ' + (e.status || 'unknown') + '\n' +
               '  Request: ' + JSON.stringify(e.requestBody || {}) + '\n' +
               '  Response: ' + JSON.stringify(e.responseSchema || {});
      }).join('\n\n')
    : '  None detected';

  var models = (manifest.dataModels && manifest.dataModels.length)
    ? manifest.dataModels.map(function(m) {
        var fields = Object.entries(m.fields || {})
          .map(function(kv) { return '    - ' + kv[0] + ': ' + kv[1]; })
          .join('\n');
        return '  ' + m.name + '\n' +
               '  Description: ' + m.description + '\n' +
               '  Fields:\n' + fields + '\n' +
               '  Relationships: ' + (m.relationships || 'none') + '\n' +
               '  Validations: ' + (m.validations || 'none');
      }).join('\n\n')
    : '  None detected';

  var files = (manifest.codeFiles && manifest.codeFiles.length)
    ? manifest.codeFiles.map(function(f) {
        return '  FILE: ' + f.filename + ' (' + f.language + ')\n' +
               '  Purpose: ' + f.purpose + '\n' +
               '  Key Functions: ' + (f.keyFunctions || []).join(', ') + '\n' +
               '  Dependencies: ' + (f.dependencies || []).join(', ') + '\n' +
               '  Latest Code:\n```' + f.language + '\n' + f.latestCode + '\n```';
      }).join('\n\n')
    : '  None captured';

  var errors = (manifest.errorsEncountered && manifest.errorsEncountered.length)
    ? manifest.errorsEncountered.map(function(e) {
        return '  ERROR: ' + e.error + '\n' +
               '  Context: ' + (e.context || 'unknown') + '\n' +
               '  Root Cause: ' + e.cause + '\n' +
               '  Resolution: ' + (e.resolution || 'UNRESOLVED') + '\n' +
               '  Prevention: ' + (e.preventionNote || 'none');
      }).join('\n\n')
    : '  None';

  var failed = (manifest.failedApproaches && manifest.failedApproaches.length)
    ? manifest.failedApproaches.map(function(f) {
        return '  - Tried: ' + f.approach + '\n' +
               '    Failed because: ' + f.reason + '\n' +
               '    Lesson: ' + (f.lesson || 'none');
      }).join('\n\n')
    : '  None';

  var decisions = (manifest.decisions && manifest.decisions.length)
    ? manifest.decisions.map(function(d) {
        return '  - Decision: ' + d.decision + '\n' +
               '    Reasoning: ' + d.reasoning + '\n' +
               '    Alternatives considered: ' + (d.alternatives || 'none');
      }).join('\n\n')
    : '  None recorded';

  var completed = (manifest.completedFeatures && manifest.completedFeatures.length)
    ? manifest.completedFeatures.map(function(f) { return '  ✓ ' + f; }).join('\n')
    : '  None listed';

  var pending = (manifest.pendingFeatures && manifest.pendingFeatures.length)
    ? manifest.pendingFeatures.map(function(f) { return '  ○ ' + f; }).join('\n')
    : '  None listed';

  var arch = manifest.architecture || {};

  return '# RelayAI Context Transfer\n\n' +
    'I am continuing a development project. Below is a COMPLETE technical manifest ' +
    'generated from my previous AI session. Please read it carefully and fully before responding.\n\n' +

    '════════════════════════════════════════\n' +
    '  PROJECT: ' + (manifest.projectName || 'Unnamed Project') + '\n' +
    '════════════════════════════════════════\n\n' +

    '## SUMMARY\n' +
    (manifest.summary || 'No summary available') + '\n\n' +

    '## TECH STACK\n' +
    stack + '\n\n' +

    '## ARCHITECTURE\n' +
    '**Overview:** ' + (arch.overview || 'Not documented') + '\n' +
    '**Frontend:** ' + (arch.frontend || 'Not documented') + '\n' +
    '**Backend:** ' + (arch.backend || 'Not documented') + '\n' +
    '**Database:** ' + (arch.database || 'Not documented') + '\n' +
    '**Deployment:** ' + (arch.deployment || 'Not documented') + '\n\n' +

    '## COMPLETED FEATURES\n' + completed + '\n\n' +

    '## PENDING FEATURES\n' + pending + '\n\n' +

    '## API ENDPOINTS\n' + endpoints + '\n\n' +

    '## DATA MODELS\n' + models + '\n\n' +

    '## CODE FILES\n' + files + '\n\n' +

    '## ERRORS ENCOUNTERED\n' + errors + '\n\n' +

    '## FAILED APPROACHES (DO NOT REPEAT THESE)\n' + failed + '\n\n' +

    '## TECHNICAL DECISIONS MADE\n' + decisions + '\n\n' +

    '## CURRENT STATUS\n' +
    (manifest.currentStatus || 'Unknown') + '\n\n' +

    '## NEXT STEPS (IN PRIORITY ORDER)\n' +
    ((manifest.nextSteps || []).map(function(s, i) { 
      return (i+1) + '. ' + s; 
    }).join('\n') || '  Continue from current status') + '\n\n' +

    '## IMPORTANT CONTEXT & CONVENTIONS\n' +
    (manifest.importantContext || 'None') + '\n\n' +

    '════════════════════════════════════════\n\n' +

    'You now have the COMPLETE context of this project. ' +
    'Please confirm you have understood everything above, ' +
    'summarize the current state in 2-3 sentences, ' +
    'and ask me what we should work on next.';
}
