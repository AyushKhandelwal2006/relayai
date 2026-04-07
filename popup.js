var capturedData = null;
var currentManifest = null;
var currentTarget = 'claude';
var detectedPlatform = null;
var currentHostname = '';

var captureBtn      = document.getElementById('captureBtn');
var transferBtn     = document.getElementById('transferBtn');
var copyBtn         = document.getElementById('copyBtn');
var logBox          = document.getElementById('logBox');
var statusDot       = document.getElementById('statusDot');
var statusText      = document.getElementById('statusText');
var manifestPreview = document.getElementById('manifestPreview');
var manifestBox     = document.getElementById('manifestBox');

var SUPPORTED_SOURCES = {
  'chatgpt.com':           { name: 'ChatGPT'    },
  'chat.openai.com':       { name: 'ChatGPT'    },
  'gemini.google.com':     { name: 'Gemini'     },
  'copilot.microsoft.com': { name: 'Copilot'    },
  'perplexity.ai':         { name: 'Perplexity' },
  'claude.ai':             { name: 'Claude'     }
};

var TARGETS = [
  { id: 'claude',     name: 'Claude'     },
  { id: 'chatgpt',    name: 'ChatGPT'    },
  { id: 'gemini',     name: 'Gemini'     },
  { id: 'perplexity', name: 'Perplexity' }
];

chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
  var tab = tabs[0];
  if (!tab || !tab.url) { setStatus('red', 'Cannot detect page'); return; }

  currentHostname = new URL(tab.url).hostname;
  var platform = null;

  Object.keys(SUPPORTED_SOURCES).forEach(function(key) {
    if (currentHostname.includes(key)) platform = SUPPORTED_SOURCES[key];
  });

  if (platform) {
    detectedPlatform = platform;
    setStatus('green', platform.name + ' detected — ready to capture');
    captureBtn.disabled = false;
    renderTargetSelector();
  } else {
    setStatus('red', 'Open ChatGPT, Gemini, Copilot, Perplexity or Claude');
  }
});

function renderTargetSelector() {
  var container = document.getElementById('targetSelector');
  if (!container) return;

  var wrapper = document.createElement('div');

  var label = document.createElement('div');
  label.style.cssText = 'font-size:10px;color:#555;margin-bottom:6px;letter-spacing:.5px;';
  label.textContent = 'TRANSFER TO';
  wrapper.appendChild(label);

  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

  TARGETS.forEach(function(t) {
    var isSource = currentHostname.includes(t.id);
    var isActive = t.id === currentTarget;

    var btn = document.createElement('button');
    btn.textContent = t.name;
    btn.dataset.targetId = t.id;

    btn.style.cssText = 'padding:4px 10px;border-radius:6px;border:1px solid;font-size:11px;transition:all .15s;' +
      (isActive ? 'background:#6d56fa;color:#fff;border-color:#6d56fa;' : 'background:#111;color:#888;border-color:#222;') +
      (isSource  ? 'opacity:.4;cursor:not-allowed;' : 'cursor:pointer;');

    if (isSource) {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', function() {
        currentTarget = t.id;
        var transferBtnContent = document.getElementById('transferBtnContent');
        if (transferBtnContent) {
          transferBtnContent.textContent = 'Transfer to ' + t.name;
        }
        renderTargetSelector();
      });
    }

    btnRow.appendChild(btn);
  });

  wrapper.appendChild(btnRow);
  container.innerHTML = '';
  container.appendChild(wrapper);
}

function setStep(n) {
  for (var i = 1; i <= 3; i++) {
    var circle = document.getElementById('sc' + i);
    var label  = document.getElementById('sl' + i);
    if (i < n)  { circle.classList.add('done'); circle.classList.remove('active'); circle.textContent = 'v'; }
    if (i === n){ circle.classList.add('active'); circle.classList.remove('done'); circle.textContent = i; }
    if (i > n)  { circle.classList.remove('done','active'); circle.textContent = i; }
    if (i < n)  { label.classList.add('active'); }
  }
  for (var j = 1; j <= 2; j++) {
    document.getElementById('line' + j).classList.toggle('done', j < n);
  }
}

function log(msg, type) {
  type = type || 'info';
  var div = document.createElement('div');
  div.className = type;
  div.textContent = msg;
  logBox.appendChild(div);
  logBox.scrollTop = logBox.scrollHeight;
}

function clearLog() { logBox.innerHTML = ''; }

function setStatus(color, text) {
  statusDot.className = 'dot ' + color;
  statusText.textContent = text;
}

captureBtn.addEventListener('click', function() {
  captureBtn.disabled = true;
  document.getElementById('captureBtnContent').textContent = 'Capturing...';
  clearLog();
  setStatus('amber', 'Scraping conversation...');
  log('Connecting to page...', 'info');

  chrome.runtime.sendMessage({ action: 'CAPTURE_CONTEXT' }, function(response) {
    document.getElementById('captureBtnContent').textContent = 'Capture Context';
    captureBtn.disabled = false;

    if (response && response.success) {
      capturedData = response.data;
      var count = (capturedData && capturedData.messages) ? capturedData.messages.length : 0;
      setStatus('green', 'Captured ' + count + ' messages');
      setStep(2);
      log('Captured ' + count + ' messages', 'ok');
      log('Source: ' + (capturedData.source || currentHostname), 'info');
      renderManifestPreview(null);
      manifestPreview.style.display = 'block';
    } else {
      setStatus('red', 'Capture failed');
      log('Error: ' + ((response && response.error) || 'Unknown error'), 'err');
    }
  });
});

function renderManifestPreview(manifest) {
  if (!manifest) {
    manifestBox.innerHTML = '<div class="m-row"><span class="m-label">Status</span><span class="m-value" style="color:#555">Ready to parse — click Transfer to generate manifest</span></div>';
    return;
  }
  var stack = [].concat(
    (manifest.techStack && manifest.techStack.frontend) || [],
    (manifest.techStack && manifest.techStack.backend)  || [],
    (manifest.techStack && manifest.techStack.database) || []
  );
  var html = '';
  html += row('Project',  manifest.projectName || 'Unnamed');
  var summary = manifest.summary || '';
  html += row('Summary',  summary.slice(0,120) + (summary.length > 120 ? '...' : ''));
  if (stack.length) {
    html += row('Stack', stack.map(function(s) { return '<span class="m-badge">' + s + '</span>'; }).join(''));
  }
  if (manifest.apiEndpoints && manifest.apiEndpoints.length) {
    html += row('Endpoints', manifest.apiEndpoints.map(function(e) { return '<span class="m-badge">' + e.method + ' ' + e.path + '</span>'; }).join(''));
  }
  if (manifest.codeFiles && manifest.codeFiles.length) {
    html += row('Files', manifest.codeFiles.map(function(f) { return '<span class="m-badge file">' + f.filename + '</span>'; }).join(''));
  }
  if (manifest.errorsEncountered && manifest.errorsEncountered.length) {
    html += row('Errors', manifest.errorsEncountered.map(function(e) { return '<span class="m-badge error">' + (e.error || '').slice(0,30) + '</span>'; }).join(''));
  }
  html += row('Status', (manifest.currentStatus || '').slice(0,100) || '-');
  manifestBox.innerHTML = html;
}

function row(label, value) {
  return '<div class="m-row"><span class="m-label">' + label + '</span><span class="m-value">' + value + '</span></div>';
}

copyBtn.addEventListener('click', function() {
  if (!currentManifest) { log('No manifest yet — transfer first', 'err'); return; }
  navigator.clipboard.writeText(JSON.stringify(currentManifest, null, 2)).then(function() {
    copyBtn.textContent = 'Copied!';
    setTimeout(function() { copyBtn.textContent = 'Copy Manifest'; }, 2000);
  });
});

transferBtn.addEventListener('click', function() {
  if (!capturedData) return;
  transferBtn.disabled = true;
  document.getElementById('transferBtnContent').textContent = 'Parsing with AI...';
  setStatus('amber', 'Generating manifest...');
  setStep(2);
  log('Sending to backend...', 'info');
  log('Target: ' + currentTarget, 'info');

  chrome.runtime.sendMessage({
    action: 'TRANSFER_TO_CLAUDE',
    data:   capturedData,
    target: currentTarget
  }, function(response) {
    var targetName = currentTarget.charAt(0).toUpperCase() + currentTarget.slice(1);
    document.getElementById('transferBtnContent').textContent = 'Transfer to ' + targetName;
    transferBtn.disabled = false;

    if (response && response.success) {
      currentManifest = response.manifest;
      renderManifestPreview(currentManifest);
      setStep(3);
      setStatus('green', 'Transferred to ' + targetName + '!');
      log('Manifest generated', 'ok');
      log('Opening ' + targetName + ' in new tab', 'ok');
      saveToHistory(currentManifest, capturedData);
    } else {
      setStatus('red', 'Transfer failed');
      log('Error: ' + ((response && response.error) || 'Unknown error'), 'err');
      if (response && response.error && response.error.includes('fetch')) {
        log('Make sure backend is running: node server.js', 'info');
      }
    }
  });
});

function saveToHistory(manifest, rawData) {
  chrome.storage.local.get('relayai_history', function(data) {
    var history = data.relayai_history;
    if (!Array.isArray(history)) history = [];
    history.unshift({
      id: Date.now(),
      projectName: manifest.projectName || 'Unnamed Project',
      summary: (manifest.summary || '').slice(0,100),
      stack: [].concat(
        (manifest.techStack && manifest.techStack.frontend) || [],
        (manifest.techStack && manifest.techStack.backend)  || [],
        (manifest.techStack && manifest.techStack.database) || []
      ),
      messageCount: (rawData && rawData.messages) ? rawData.messages.length : 0,
      capturedAt: new Date().toISOString(),
      target: currentTarget,
      manifest: manifest
    });
    chrome.storage.local.set({ relayai_history: history.slice(0,20) });
  });
}

function renderHistory() {
  var list = document.getElementById('historyList');
  list.innerHTML = '<div style="color:#444;font-size:11px;padding:4px 0;">Loading...</div>';
  chrome.storage.local.get('relayai_history', function(data) {
    var history = data.relayai_history || [];
    if (!Array.isArray(history) || !history.length) {
      list.innerHTML = '<div class="empty-state">No transfers yet.<br>Capture a conversation to get started.</div>';
      return;
    }

    list.innerHTML = '';
    history.forEach(function(item) {
      var div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML =
        '<div class="hi-top"><span class="hi-name">' + item.projectName + '</span><span class="hi-time">' + timeAgo(item.capturedAt) + '</span></div>' +
        '<div class="hi-stack">' + (item.stack||[]).slice(0,5).join(' · ') + ' · ' + (item.messageCount||0) + ' msgs</div>' +
        '<div class="hi-summary" style="font-size:10.5px;color:#555;margin-top:3px;">' + (item.summary||'') + '</div>' +
        '<div class="hi-actions">' +
          '<button class="hi-btn" data-action="retransfer" data-id="' + item.id + '">Re-transfer</button>' +
          '<button class="hi-btn" data-action="copy"       data-id="' + item.id + '">Copy</button>' +
          '<button class="hi-btn" data-action="delete"     data-id="' + item.id + '" style="color:#f87171">Delete</button>' +
        '</div>';

      div.querySelectorAll('.hi-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var action = btn.dataset.action;
          var id     = parseInt(btn.dataset.id);
          if (action === 'retransfer') retransfer(id);
          if (action === 'copy')       copyHistoryItem(id);
          if (action === 'delete')     deleteHistoryItem(id);
        });
      });

      list.appendChild(div);
    });
  });
}

function retransfer(id) {
  chrome.storage.local.get('relayai_history', function(data) {
    var item = (data.relayai_history||[]).find(function(h) { return h.id === id; });
    if (item) chrome.runtime.sendMessage({ action: 'RETRANSFER_MANIFEST', manifest: item.manifest, target: item.target || 'claude' });
  });
}

function copyHistoryItem(id) {
  chrome.storage.local.get('relayai_history', function(data) {
    var item = (data.relayai_history||[]).find(function(h) { return h.id === id; });
    if (item) navigator.clipboard.writeText(JSON.stringify(item.manifest, null, 2));
  });
}

function deleteHistoryItem(id) {
  chrome.storage.local.get('relayai_history', function(data) {
    var filtered = (data.relayai_history||[]).filter(function(h) { return h.id !== id; });
    chrome.storage.local.set({ relayai_history: filtered }, renderHistory);
  });
}

function timeAgo(iso) {
  var diff = Date.now() - new Date(iso).getTime();
  var m = Math.floor(diff/60000), h = Math.floor(m/60), d = Math.floor(h/24);
  if (d > 0) return d + 'd ago';
  if (h > 0) return h + 'h ago';
  if (m > 0) return m + 'm ago';
  return 'just now';
}

document.getElementById('tab-transfer').addEventListener('click', function() {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.tab').forEach(function(t)  { t.classList.remove('active'); });
  document.getElementById('page-transfer').classList.add('active');
  document.getElementById('tab-transfer').classList.add('active');
});

document.getElementById('tab-history').addEventListener('click', function() {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.tab').forEach(function(t)  { t.classList.remove('active'); });
  document.getElementById('page-history').classList.add('active');
  document.getElementById('tab-history').classList.add('active');
  renderHistory();
});

document.getElementById('clearHistoryBtn').addEventListener('click', function() {
  chrome.storage.local.set({ relayai_history: [] }, renderHistory);
});