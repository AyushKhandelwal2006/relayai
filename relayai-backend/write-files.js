const fs = require('fs');
const path = require('path');

const injectFunc = function(promptText) {
  var tries = 0;
  var timer = setInterval(function() {
    tries++;

    // Gemini specific selectors in order of priority
    var selectors = [
      '.ql-editor',
      'rich-textarea .ql-editor', 
      'div[contenteditable="true"]',
      'rich-textarea',
      'textarea',
      'p[data-placeholder]'
    ];

    var input = null;
    for (var i = 0; i < selectors.length; i++) {
      input = document.querySelector(selectors[i]);
      if (input) break;
    }

    if (input) {
      clearInterval(timer);
      input.focus();

      // Method 1: execCommand (works for contenteditable)
      try {
        input.click();
        input.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, promptText);
        input.dispatchEvent(new InputEvent('input', { bubbles: true }));
        return;
      } catch(e) {}

      // Method 2: direct textContent
      try {
        input.textContent = promptText;
        input.dispatchEvent(new InputEvent('input', { bubbles: true }));
        return;
      } catch(e) {}

      // Method 3: clipboard paste simulation
      try {
        navigator.clipboard.writeText(promptText).then(function() {
          input.focus();
          document.execCommand('paste');
        });
      } catch(e) {}
    }

    if (tries > 30) clearInterval(timer);
  }, 600);
};

// Read current background.js and replace just the injection function
let bg = fs.readFileSync(path.join('..', 'background.js'), 'utf8');

const newInject = `func: ${injectFunc.toString()},`;
bg = bg.replace(
  /func: function\(promptText\) \{[\s\S]*?\},\s*args:/,
  newInject + '\n                args:'
);

fs.writeFileSync(path.join('..', 'background.js'), bg, 'utf8');
console.log('Gemini injection updated!');