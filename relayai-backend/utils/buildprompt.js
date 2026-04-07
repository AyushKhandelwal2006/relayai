const MAX_CHARS_PER_MESSAGE = 400;
const MAX_TOTAL_MESSAGES    = 40;

function truncateMessage(text, max) {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max) + '... [truncated]';
}

function buildParserPrompt(messages) {
  var msgs = messages;

  // If too many messages, keep first 5 and last 35 (context + recent work)
  if (msgs.length > MAX_TOTAL_MESSAGES) {
    var first = msgs.slice(0, 5);
    var last  = msgs.slice(-(MAX_TOTAL_MESSAGES - 5));
    msgs = first.concat([{ role: 'system', text: '... [' + (messages.length - MAX_TOTAL_MESSAGES) + ' messages omitted for length] ...', codeBlocks: [] }], last);
  }

  var conversation = msgs.map(function(m) {
    var codeSection = '';
    if (m.codeBlocks && m.codeBlocks.length) {
      codeSection = '\nCode:\n' + m.codeBlocks.map(function(b) {
        return '```' + b.language + '\n' + truncateMessage(b.code, 300) + '\n```';
      }).join('\n');
    }
    return '[' + (m.role || 'user').toUpperCase() + ']: ' + truncateMessage(m.text, MAX_CHARS_PER_MESSAGE) + codeSection;
  }).join('\n\n---\n\n');

  return 'You are a technical context extractor for developer AI workflows.\n\n' +
    'Analyze the following conversation between a developer and an AI assistant.\n' +
    'Extract ALL technical information and return ONLY a valid JSON object — no markdown, no explanation, no backticks.\n\n' +
    'CONVERSATION:\n' + conversation + '\n\n' +
    'Return this EXACT JSON structure (use empty arrays/null if not found):\n' +
    JSON.stringify({
      projectName: "inferred project name or null",
      summary: "2-3 sentence summary of what is being built and current state",
      techStack: { frontend: [], backend: [], database: [], devOps: [], other: [] },
      apiEndpoints: [{ method: "POST", path: "/example", description: "what it does", requestBody: {}, responseSchema: {} }],
      dataModels: [{ name: "ModelName", fields: { fieldName: "type" }, description: "what it represents" }],
      codeFiles: [{ filename: "example.js", language: "javascript", purpose: "what this file does", latestCode: "most recent version" }],
      errorsEncountered: [{ error: "error message", cause: "what caused it", resolution: "how fixed or null" }],
      failedApproaches: [{ approach: "what was tried", reason: "why it failed" }],
      currentStatus: "what was the last thing being worked on",
      nextSteps: ["step 1", "step 2"],
      importantContext: "any other critical context"
    }, null, 2);
}

module.exports = { buildParserPrompt };