chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'SCRAPE_CHAT') {
    try {
      var platform = detectPlatform();
      var result   = scrapeByPlatform(platform);
      sendResponse({ success: true, data: result });
    } catch(err) {
      sendResponse({ success: false, error: err.message });
    }
  }
  if (message.action === 'PING') {
    sendResponse({ alive: true });
  }
});

// ── Platform detection ─────────────────────────────────
function detectPlatform() {
  var host = window.location.hostname;
  if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'chatgpt';
  if (host.includes('gemini.google.com')) return 'gemini';
  if (host.includes('copilot.microsoft.com')) return 'copilot';
  if (host.includes('perplexity.ai')) return 'perplexity';
  if (host.includes('claude.ai')) return 'claude';
  return 'unknown';
}

// ── Route to correct scraper ───────────────────────────
function scrapeByPlatform(platform) {
  if (platform === 'chatgpt')   return scrapeChatGPT();
  if (platform === 'gemini')    return scrapeGemini();
  if (platform === 'copilot')   return scrapeCopilot();
  if (platform === 'perplexity') return scrapePerplexity();
  if (platform === 'claude')    return scrapeClaude();
  throw new Error('Unsupported platform: ' + window.location.hostname);
}

// ── Shared helpers ─────────────────────────────────────
function extractCodeBlocks(el) {
  var blocks = [];
  el.querySelectorAll('pre code').forEach(function(block) {
    var lang = (block.className || '').replace(/language-/g, '').trim() || 'unknown';
    var code = (block.innerText || block.textContent || '').trim();
    if (code) blocks.push({ language: lang, code: code });
  });
  return blocks;
}

function cleanText(el) {
  var clone = el.cloneNode(true);
  clone.querySelectorAll('pre, code, button, svg').forEach(function(e) { e.remove(); });
  return (clone.innerText || clone.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

function buildResult(messages, platform) {
  if (messages.length === 0) {
    throw new Error('No messages found on ' + platform + '. Make sure a conversation is open.');
  }
  return {
    messages:     messages,
    rawText:      messages.map(function(m) { return '[' + m.role.toUpperCase() + ']: ' + m.text; }).join('\n\n'),
    capturedAt:   new Date().toISOString(),
    source:       platform,
    url:          window.location.href,
    messageCount: messages.length
  };
}

// ── ChatGPT scraper ────────────────────────────────────
function scrapeChatGPT() {
  var messages = [];

  // Strategy 1: data-message-author-role
  var turns = document.querySelectorAll('[data-message-author-role]');

  // Strategy 2: article tags
  if (turns.length === 0) {
    turns = document.querySelectorAll('article[data-testid]');
  }

  if (turns.length === 0) {
    throw new Error('No ChatGPT messages found. Make sure a conversation is open.');
  }

  turns.forEach(function(turn) {
    var role = turn.getAttribute('data-message-author-role') || 'user';
    var contentEl = turn.querySelector('.markdown, [class*="prose"], [class*="markdown"]') || turn;
    var codeBlocks = extractCodeBlocks(contentEl);
    var text = cleanText(contentEl);
    if (text || codeBlocks.length > 0) {
      messages.push({ role: role, text: text, codeBlocks: codeBlocks });
    }
  });

  return buildResult(messages, 'chatgpt');
}

// ── Gemini scraper ─────────────────────────────────────
function scrapeGemini() {
  var messages = [];

  // Gemini uses model-response and user-query containers
  var turns = document.querySelectorAll('user-query, model-response, .conversation-container > *');

  if (turns.length === 0) {
    // Fallback: look for message bubbles
    turns = document.querySelectorAll('[data-message-id], .message-content, [class*="user-query"], [class*="model-response"]');
  }

  if (turns.length === 0) {
    throw new Error('No Gemini messages found. Make sure a conversation is open.');
  }

  turns.forEach(function(turn) {
    var tagName  = turn.tagName ? turn.tagName.toLowerCase() : '';
    var classes  = turn.className || '';
    var isUser   = tagName === 'user-query' || classes.includes('user-query') || classes.includes('human');
    var isModel  = tagName === 'model-response' || classes.includes('model-response') || classes.includes('assistant');
    var role     = isUser ? 'user' : (isModel ? 'assistant' : null);

    if (!role) return;

    var contentEl  = turn.querySelector('.message-content, .response-content, [class*="content"]') || turn;
    var codeBlocks = extractCodeBlocks(contentEl);
    var text       = cleanText(contentEl);

    if (text || codeBlocks.length > 0) {
      messages.push({ role: role, text: text, codeBlocks: codeBlocks });
    }
  });

  return buildResult(messages, 'gemini');
}

// ── Copilot scraper ────────────────────────────────────
function scrapeCopilot() {
  var messages = [];

  // Copilot uses cib-chat-turn web components
  var turns = document.querySelectorAll('cib-chat-turn');

  if (turns.length === 0) {
    // Fallback for newer Copilot UI
    turns = document.querySelectorAll('[class*="ChatTurn"], [class*="chat-turn"], [data-turn]');
  }

  if (turns.length === 0) {
    // Last resort: look for message containers
    turns = document.querySelectorAll('[class*="message"], [role="listitem"]');
  }

  if (turns.length === 0) {
    throw new Error('No Copilot messages found. Make sure a conversation is open.');
  }

  turns.forEach(function(turn) {
    var slotAttr = turn.getAttribute('slot') || '';
    var classes  = turn.className || '';
    var isUser   = slotAttr.includes('human') || classes.includes('human') || classes.includes('user');
    var role     = isUser ? 'user' : 'assistant';

    var contentEl  = turn.querySelector('[class*="message-content"], [class*="response"], p') || turn;
    var codeBlocks = extractCodeBlocks(contentEl);
    var text       = cleanText(contentEl);

    if (text || codeBlocks.length > 0) {
      messages.push({ role: role, text: text, codeBlocks: codeBlocks });
    }
  });

  return buildResult(messages, 'copilot');
}

// ── Perplexity scraper ─────────────────────────────────
function scrapePerplexity() {
  var messages = [];

  // Perplexity uses prose class for answers
  var answers = document.querySelectorAll('.prose, [class*="prose"], [data-testid*="answer"]');

  // Get questions separately
  var questions = document.querySelectorAll('[class*="query"], [data-testid*="query"], textarea');

  // Merge them in order by DOM position
  var allEls = [];

  questions.forEach(function(el) {
    allEls.push({ el: el, role: 'user' });
  });

  answers.forEach(function(el) {
    allEls.push({ el: el, role: 'assistant' });
  });

  // Sort by vertical position
  allEls.sort(function(a, b) {
    return a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top;
  });

  if (allEls.length === 0) {
    // Fallback
    var containers = document.querySelectorAll('[class*="Thread"], [class*="thread"] > *');
    containers.forEach(function(el) {
      var text = cleanText(el);
      if (text) messages.push({ role: 'user', text: text, codeBlocks: [] });
    });
  } else {
    allEls.forEach(function(item) {
      var codeBlocks = extractCodeBlocks(item.el);
      var text = cleanText(item.el);
      if (text || codeBlocks.length > 0) {
        messages.push({ role: item.role, text: text, codeBlocks: codeBlocks });
      }
    });
  }

  return buildResult(messages, 'perplexity');
}

// ── Claude scraper ─────────────────────────────────────
function scrapeClaude() {
  var messages = [];

  // Claude uses human/assistant turn structure
  var turns = document.querySelectorAll('[data-testid="human-turn"], [data-testid="assistant-turn"]');

  if (turns.length === 0) {
    turns = document.querySelectorAll('.human-turn, .assistant-turn, [class*="HumanTurn"], [class*="AssistantTurn"]');
  }

  if (turns.length === 0) {
    // Generic fallback
    turns = document.querySelectorAll('[class*="message"], [class*="Message"]');
  }

  if (turns.length === 0) {
    throw new Error('No Claude messages found. Make sure a conversation is open.');
  }

  turns.forEach(function(turn) {
    var testId  = turn.getAttribute('data-testid') || '';
    var classes = turn.className || '';
    var isUser  = testId.includes('human') || classes.includes('human') || classes.includes('Human');
    var role    = isUser ? 'user' : 'assistant';

    var codeBlocks = extractCodeBlocks(turn);
    var text = cleanText(turn);

    if (text || codeBlocks.length > 0) {
      messages.push({ role: role, text: text, codeBlocks: codeBlocks });
    }
  });

  return buildResult(messages, 'claude');
}