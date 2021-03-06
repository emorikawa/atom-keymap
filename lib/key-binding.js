(function() {
  var KeyBinding, calculateSpecificity;

  calculateSpecificity = require('./helpers').calculateSpecificity;

  module.exports = KeyBinding = (function() {
    KeyBinding.currentIndex = 1;

    KeyBinding.prototype.enabled = true;

    function KeyBinding(source, command, keystrokes, selector) {
      this.source = source;
      this.command = command;
      this.keystrokes = keystrokes;
      this.keystrokeCount = this.keystrokes.split(' ').length;
      this.selector = selector.replace(/!important/g, '');
      this.specificity = calculateSpecificity(selector);
      this.index = this.constructor.currentIndex++;
    }

    KeyBinding.prototype.matches = function(keystroke) {
      var multiKeystroke;
      multiKeystroke = /\s/.test(keystroke);
      if (multiKeystroke) {
        return keystroke === this.keystroke;
      } else {
        return keystroke.split(' ')[0] === this.keystroke.split(' ')[0];
      }
    };

    KeyBinding.prototype.compare = function(keyBinding) {
      if (keyBinding.specificity === this.specificity) {
        return keyBinding.index - this.index;
      } else {
        return keyBinding.specificity - this.specificity;
      }
    };

    return KeyBinding;

  })();

}).call(this);
