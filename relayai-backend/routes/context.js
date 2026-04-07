const express = require('express');
const router  = express.Router();
const { parseConversation } = require('../services/aiParser');

// Simple in-memory rate limiter (per IP)
var requestLog = {};
var RATE_LIMIT  = 10;   // max requests
var RATE_WINDOW = 60000; // per 60 seconds

function isRateLimited(ip) {
  var now = Date.now();
  if (!requestLog[ip]) requestLog[ip] = [];
  requestLog[ip] = requestLog[ip].filter(function(t) { return now - t < RATE_WINDOW; });
  if (requestLog[ip].length >= RATE_LIMIT) return true;
  requestLog[ip].push(now);
  return false;
}

router.post('/parse-context', async function(req, res) {
  var ip = req.ip || 'unknown';

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests — wait 60 seconds and try again' });
  }

  var messages = req.body.messages;
  var rawText  = req.body.rawText;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required and must not be empty' });
  }

  if (messages.length > 200) {
    return res.status(400).json({ error: 'Too many messages (max 200). Please use a shorter conversation.' });
  }

  console.log('[RelayAI] Parsing ' + messages.length + ' messages from ' + ip);

  try {
    var manifest = await parseConversation(messages, rawText);
    console.log('[RelayAI] Success. Project: ' + (manifest.projectName || 'unnamed') + ' Stack: ' + JSON.stringify(manifest.techStack));
    res.json({ success: true, manifest: manifest });

  } catch (err) {
    console.error('[RelayAI] Final error:', err.message);

    if (err.message && err.message.includes('API_KEY')) {
      return res.status(401).json({ error: 'Invalid Gemini API key — check your .env file' });
    }
    if (err.message && (err.message.includes('429') || err.message.includes('quota'))) {
      return res.status(429).json({ error: 'Gemini quota exceeded — wait a minute and try again' });
    }
    if (err instanceof SyntaxError) {
      return res.status(502).json({ error: 'AI returned malformed JSON — please try again' });
    }

    res.status(500).json({ error: 'Failed to parse conversation', details: err.message });
  }
});

module.exports = router;