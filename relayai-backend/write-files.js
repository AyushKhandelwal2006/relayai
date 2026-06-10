const fs = require('fs');
const path = require('path');

let bg = fs.readFileSync(path.join('..', 'background.js'), 'utf8');

const newBuildPrompt = `
function buildPrompt(manifest) {
  var stack = [].concat(
    (manifest.techStack && manifest.techStack.frontend) || [],
    (manifest.techStack && manifest.techStack.backend)  || [],
    (manifest.techStack && manifest.techStack.database) || [],
    (manifest.techStack && manifest.techStack.other)    || []
  ).join(', ') || 'Not detected';

  var endpoints = (manifest.apiEndpoints && manifest.apiEndpoints.length)
    ? manifest.apiEndpoints.map(function(e) {
        return '  ' + e.method + ' ' + e.path + '\\n' +
               '  Description: ' + e.description + '\\n' +
               '  Auth: ' + (e.authRequired ? 'Required' : 'Not required') + '\\n' +
               '  Status: ' + (e.status || 'unknown') + '\\n' +
               '  Request: ' + JSON.stringify(e.requestBody || {}) + '\\n' +
               '  Response: ' + JSON.stringify(e.responseSchema || {});
      }).join('\\n\\n')
    : '  None detected';

  var models = (manifest.dataModels && manifest.dataModels.length)
    ? manifest.dataModels.map(function(m) {
        var fields = Object.entries(m.fields || {})
          .map(function(kv) { return '    - ' + kv[0] + ': ' + kv[1]; })
          .join('\\n');
        return '  ' + m.name + '\\n' +
               '  Description: ' + m.description + '\\n' +
               '  Fields:\\n' + fields + '\\n' +
               '  Relationships: ' + (m.relationships || 'none') + '\\n' +
               '  Validations: ' + (m.validations || 'none');
      }).join('\\n\\n')
    : '  None detected';

  var files = (manifest.codeFiles && manifest.codeFiles.length)
    ? manifest.codeFiles.map(function(f) {
        return '  FILE: ' + f.filename + ' (' + f.language + ')\\n' +
               '  Purpose: ' + f.purpose + '\\n' +
               '  Key Functions: ' + (f.keyFunctions || []).join(', ') + '\\n' +
               '  Dependencies: ' + (f.dependencies || []).join(', ') + '\\n' +
               '  Latest Code:\\n\`\`\`' + f.language + '\\n' + f.latestCode + '\\n\`\`\`';
      }).join('\\n\\n')
    : '  None captured';

  var errors = (manifest.errorsEncountered && manifest.errorsEncountered.length)
    ? manifest.errorsEncountered.map(function(e) {
        return '  ERROR: ' + e.error + '\\n' +
               '  Context: ' + (e.context || 'unknown') + '\\n' +
               '  Root Cause: ' + e.cause + '\\n' +
               '  Resolution: ' + (e.resolution || 'UNRESOLVED') + '\\n' +
               '  Prevention: ' + (e.preventionNote || 'none');
      }).join('\\n\\n')
    : '  None';

  var failed = (manifest.failedApproaches && manifest.failedApproaches.length)
    ? manifest.failedApproaches.map(function(f) {
        return '  - Tried: ' + f.approach + '\\n' +
               '    Failed because: ' + f.reason + '\\n' +
               '    Lesson: ' + (f.lesson || 'none');
      }).join('\\n\\n')
    : '  None';

  var decisions = (manifest.decisions && manifest.decisions.length)
    ? manifest.decisions.map(function(d) {
        return '  - Decision: ' + d.decision + '\\n' +
               '    Reasoning: ' + d.reasoning + '\\n' +
               '    Alternatives considered: ' + (d.alternatives || 'none');
      }).join('\\n\\n')
    : '  None recorded';

  var completed = (manifest.completedFeatures && manifest.completedFeatures.length)
    ? manifest.completedFeatures.map(function(f) { return '  ✓ ' + f; }).join('\\n')
    : '  None listed';

  var pending = (manifest.pendingFeatures && manifest.pendingFeatures.length)
    ? manifest.pendingFeatures.map(function(f) { return '  ○ ' + f; }).join('\\n')
    : '  None listed';

  var arch = manifest.architecture || {};

  return '# RelayAI Context Transfer\\n\\n' +
    'I am continuing a development project. Below is a COMPLETE technical manifest ' +
    'generated from my previous AI session. Please read it carefully and fully before responding.\\n\\n' +

    '════════════════════════════════════════\\n' +
    '  PROJECT: ' + (manifest.projectName || 'Unnamed Project') + '\\n' +
    '════════════════════════════════════════\\n\\n' +

    '## SUMMARY\\n' +
    (manifest.summary || 'No summary available') + '\\n\\n' +

    '## TECH STACK\\n' +
    stack + '\\n\\n' +

    '## ARCHITECTURE\\n' +
    '**Overview:** ' + (arch.overview || 'Not documented') + '\\n' +
    '**Frontend:** ' + (arch.frontend || 'Not documented') + '\\n' +
    '**Backend:** ' + (arch.backend || 'Not documented') + '\\n' +
    '**Database:** ' + (arch.database || 'Not documented') + '\\n' +
    '**Deployment:** ' + (arch.deployment || 'Not documented') + '\\n\\n' +

    '## COMPLETED FEATURES\\n' + completed + '\\n\\n' +

    '## PENDING FEATURES\\n' + pending + '\\n\\n' +

    '## API ENDPOINTS\\n' + endpoints + '\\n\\n' +

    '## DATA MODELS\\n' + models + '\\n\\n' +

    '## CODE FILES\\n' + files + '\\n\\n' +

    '## ERRORS ENCOUNTERED\\n' + errors + '\\n\\n' +

    '## FAILED APPROACHES (DO NOT REPEAT THESE)\\n' + failed + '\\n\\n' +

    '## TECHNICAL DECISIONS MADE\\n' + decisions + '\\n\\n' +

    '## CURRENT STATUS\\n' +
    (manifest.currentStatus || 'Unknown') + '\\n\\n' +

    '## NEXT STEPS (IN PRIORITY ORDER)\\n' +
    ((manifest.nextSteps || []).map(function(s, i) { 
      return (i+1) + '. ' + s; 
    }).join('\\n') || '  Continue from current status') + '\\n\\n' +

    '## IMPORTANT CONTEXT & CONVENTIONS\\n' +
    (manifest.importantContext || 'None') + '\\n\\n' +

    '════════════════════════════════════════\\n\\n' +

    'You now have the COMPLETE context of this project. ' +
    'Please confirm you have understood everything above, ' +
    'summarize the current state in 2-3 sentences, ' +
    'and ask me what we should work on next.';
}
`;

// Replace old buildPrompt function
var start = bg.indexOf('function buildPrompt(');
var depth = 0;
var end = start;
for (var i = start; i < bg.length; i++) {
  if (bg[i] === '{') depth++;
  if (bg[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}

bg = bg.slice(0, start) + newBuildPrompt + bg.slice(end);
fs.writeFileSync(path.join('..', 'background.js'), bg, 'utf8');
console.log('buildPrompt upgraded in background.js!');