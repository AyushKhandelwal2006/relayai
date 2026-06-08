const { GoogleGenerativeAI } = require('@google/generative-ai');
const { buildParserPrompt }  = require('../utils/buildprompt');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MAX_RETRIES    = 3;
const RETRY_DELAY_MS = 12000; // 12s — Gemini free tier resets per minute

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

async function parseConversation(messages, rawText) {
  var lastError;

  for (var attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log('[RelayAI] Attempt ' + attempt + ' of ' + MAX_RETRIES);

      var model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 8192
        }
      });

      var prompt = buildParserPrompt(messages);
      var result = await model.generateContent(prompt);
      var response = await result.response;
      var text = response.text();

      // Strip any accidental markdown fences
      text = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

      var manifest = JSON.parse(text);

      // Validate it has expected shape
      if (!manifest.techStack) manifest.techStack = { frontend: [], backend: [], database: [], devOps: [], other: [] };
      if (!manifest.apiEndpoints) manifest.apiEndpoints = [];
      if (!manifest.codeFiles) manifest.codeFiles = [];
      if (!manifest.errorsEncountered) manifest.errorsEncountered = [];

      manifest._meta = {
        capturedAt:   new Date().toISOString(),
        source:       'chatgpt',
        target:       'claude',
        messageCount: messages.length,
        version:      '2.0',
        attempt:      attempt
      };

      return manifest;

    } catch (err) {
      lastError = err;
      console.error('[RelayAI] Attempt ' + attempt + ' failed:', err.message);

      var isRateLimit = err.message && (err.message.includes('429') || err.message.includes('quota') || err.message.includes('Too Many'));
      var isRetryable = isRateLimit || err.message.includes('500') || err.message.includes('503');

      if (!isRetryable || attempt === MAX_RETRIES) break;

      var waitMs = isRateLimit ? RETRY_DELAY_MS * attempt : 2000 * attempt;
      console.log('[RelayAI] Waiting ' + (waitMs/1000) + 's before retry...');
      await sleep(waitMs);
    }
  }

  throw lastError;
}

module.exports = { parseConversation };