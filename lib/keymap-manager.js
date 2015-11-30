(function() {
  var CSON, CommandEvent, CompositeDisposable, Disposable, Emitter, File, KeyBinding, KeymapManager, OtherPlatforms, Platforms, characterForKeyboardEvent, fs, isAtomModifier, isSelectorValid, keydownEvent, keystrokeForKeyboardEvent, normalizeKeystrokes, observeCurrentKeyboardLayout, path, _ref, _ref1,
    __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  CSON = require('season');

  fs = require('fs-plus');

  isSelectorValid = require('clear-cut').isSelectorValid;

  observeCurrentKeyboardLayout = require('keyboard-layout').observeCurrentKeyboardLayout;

  path = require('path');

  File = require('pathwatcher').File;

  _ref = require('event-kit'), Emitter = _ref.Emitter, Disposable = _ref.Disposable, CompositeDisposable = _ref.CompositeDisposable;

  KeyBinding = require('./key-binding');

  CommandEvent = require('./command-event');

  _ref1 = require('./helpers'), normalizeKeystrokes = _ref1.normalizeKeystrokes, keystrokeForKeyboardEvent = _ref1.keystrokeForKeyboardEvent, isAtomModifier = _ref1.isAtomModifier, keydownEvent = _ref1.keydownEvent, characterForKeyboardEvent = _ref1.characterForKeyboardEvent;

  Platforms = ['darwin', 'freebsd', 'linux', 'sunos', 'win32'];

  OtherPlatforms = Platforms.filter(function(platform) {
    return platform !== process.platform;
  });

  module.exports = KeymapManager = (function() {

    /*
    Section: Class Methods
     */
    KeymapManager.buildKeydownEvent = function(key, options) {
      return keydownEvent(key, options);
    };


    /*
    Section: Properties
     */

    KeymapManager.prototype.partialMatchTimeout = 1000;

    KeymapManager.prototype.defaultTarget = null;

    KeymapManager.prototype.pendingPartialMatches = null;

    KeymapManager.prototype.pendingStateTimeoutHandle = null;

    KeymapManager.prototype.dvorakQwertyWorkaroundEnabled = false;


    /*
    Section: Construction and Destruction
     */

    function KeymapManager(options) {
      var key, value;
      if (options == null) {
        options = {};
      }
      for (key in options) {
        value = options[key];
        this[key] = value;
      }
      this.watchSubscriptions = {};
      this.clear();
      this.enableDvorakQwertyWorkaroundIfNeeded();
    }

    KeymapManager.prototype.clear = function() {
      this.emitter = new Emitter;
      this.keyBindings = [];
      this.queuedKeyboardEvents = [];
      return this.queuedKeystrokes = [];
    };

    KeymapManager.prototype.destroy = function() {
      var filePath, subscription, _ref2;
      this.keyboardLayoutSubscription.dispose();
      _ref2 = this.watchSubscriptions;
      for (filePath in _ref2) {
        subscription = _ref2[filePath];
        subscription.dispose();
      }
    };

    KeymapManager.prototype.enableDvorakQwertyWorkaroundIfNeeded = function() {
      return this.keyboardLayoutSubscription = observeCurrentKeyboardLayout((function(_this) {
        return function(layoutId) {
          return _this.dvorakQwertyWorkaroundEnabled = (layoutId != null ? layoutId.indexOf('DVORAK-QWERTYCMD') : void 0) > -1;
        };
      })(this));
    };


    /*
    Section: Event Subscription
     */

    KeymapManager.prototype.onDidMatchBinding = function(callback) {
      return this.emitter.on('did-match-binding', callback);
    };

    KeymapManager.prototype.onDidPartiallyMatchBindings = function(callback) {
      return this.emitter.on('did-partially-match-binding', callback);
    };

    KeymapManager.prototype.onDidFailToMatchBinding = function(callback) {
      return this.emitter.on('did-fail-to-match-binding', callback);
    };

    KeymapManager.prototype.onDidReloadKeymap = function(callback) {
      return this.emitter.on('did-reload-keymap', callback);
    };

    KeymapManager.prototype.onDidUnloadKeymap = function(callback) {
      return this.emitter.on('did-unload-keymap', callback);
    };

    KeymapManager.prototype.onDidFailToReadFile = function(callback) {
      return this.emitter.on('did-fail-to-read-file', callback);
    };


    /*
    Section: Adding and Removing Bindings
     */

    KeymapManager.prototype.add = function(source, keyBindingsBySelector) {
      var addedKeyBindings, command, keyBinding, keyBindings, keystrokes, normalizedKeystrokes, selector, _ref2;
      addedKeyBindings = [];
      for (selector in keyBindingsBySelector) {
        keyBindings = keyBindingsBySelector[selector];
        if (!isSelectorValid(selector.replace(/!important/g, ''))) {
          console.warn("Encountered an invalid selector adding key bindings from '" + source + "': '" + selector + "'");
          return;
        }
        for (keystrokes in keyBindings) {
          command = keyBindings[keystrokes];
          command = (_ref2 = command != null ? typeof command.toString === "function" ? command.toString() : void 0 : void 0) != null ? _ref2 : '';
          if (command.length === 0) {
            console.warn("Empty command for binding: `" + selector + "` `" + keystrokes + "` in " + source);
            return;
          }
          if (normalizedKeystrokes = normalizeKeystrokes(keystrokes)) {
            keyBinding = new KeyBinding(source, command, normalizedKeystrokes, selector);
            addedKeyBindings.push(keyBinding);
            this.keyBindings.push(keyBinding);
          } else {
            console.warn("Invalid keystroke sequence for binding: `" + keystrokes + ": " + command + "` in " + source);
          }
        }
      }
      return new Disposable((function(_this) {
        return function() {
          var index, _i, _len;
          for (_i = 0, _len = addedKeyBindings.length; _i < _len; _i++) {
            keyBinding = addedKeyBindings[_i];
            index = _this.keyBindings.indexOf(keyBinding);
            if (index !== -1) {
              _this.keyBindings.splice(index, 1);
            }
          }
        };
      })(this));
    };

    KeymapManager.prototype.removeBindingsFromSource = function(source) {
      this.keyBindings = this.keyBindings.filter(function(keyBinding) {
        return keyBinding.source !== source;
      });
      return void 0;
    };


    /*
    Section: Accessing Bindings
     */

    KeymapManager.prototype.getKeyBindings = function() {
      return this.keyBindings.slice();
    };

    KeymapManager.prototype.findKeyBindings = function(params) {
      var bindings, candidateBindings, command, element, keyBindings, keystrokes, matchingBindings, target;
      if (params == null) {
        params = {};
      }
      keystrokes = params.keystrokes, command = params.command, target = params.target, keyBindings = params.keyBindings;
      bindings = keyBindings != null ? keyBindings : this.keyBindings;
      if (command != null) {
        bindings = bindings.filter(function(binding) {
          return binding.command === command;
        });
      }
      if (keystrokes != null) {
        bindings = bindings.filter(function(binding) {
          return binding.keystrokes === keystrokes;
        });
      }
      if (target != null) {
        candidateBindings = bindings;
        bindings = [];
        element = target;
        while ((element != null) && element !== document) {
          matchingBindings = candidateBindings.filter(function(binding) {
            return element.webkitMatchesSelector(binding.selector);
          }).sort(function(a, b) {
            return a.compare(b);
          });
          bindings.push.apply(bindings, matchingBindings);
          element = element.parentElement;
        }
      }
      return bindings;
    };


    /*
    Section: Managing Keymap Files
     */

    KeymapManager.prototype.loadKeymap = function(bindingsPath, options) {
      var checkIfDirectory, filePath, _i, _len, _ref2, _ref3;
      checkIfDirectory = (_ref2 = options != null ? options.checkIfDirectory : void 0) != null ? _ref2 : true;
      if (checkIfDirectory && fs.isDirectorySync(bindingsPath)) {
        _ref3 = fs.listSync(bindingsPath, ['.cson', '.json']);
        for (_i = 0, _len = _ref3.length; _i < _len; _i++) {
          filePath = _ref3[_i];
          if (this.filePathMatchesPlatform(filePath)) {
            this.loadKeymap(filePath, {
              checkIfDirectory: false
            });
          }
        }
      } else {
        this.add(bindingsPath, this.readKeymap(bindingsPath, options != null ? options.suppressErrors : void 0));
        if (options != null ? options.watch : void 0) {
          this.watchKeymap(bindingsPath);
        }
      }
      return void 0;
    };

    KeymapManager.prototype.watchKeymap = function(filePath) {
      var file, reloadKeymap;
      if ((this.watchSubscriptions[filePath] == null) || this.watchSubscriptions[filePath].disposed) {
        file = new File(filePath);
        reloadKeymap = (function(_this) {
          return function() {
            return _this.reloadKeymap(filePath);
          };
        })(this);
        this.watchSubscriptions[filePath] = new CompositeDisposable(file.onDidChange(reloadKeymap), file.onDidRename(reloadKeymap), file.onDidDelete(reloadKeymap));
      }
      return void 0;
    };

    KeymapManager.prototype.reloadKeymap = function(filePath) {
      var bindings;
      if (fs.isFileSync(filePath)) {
        bindings = this.readKeymap(filePath, true);
        if (typeof bindings !== "undefined") {
          this.removeBindingsFromSource(filePath);
          this.add(filePath, bindings);
          return this.emitter.emit('did-reload-keymap', {
            path: filePath
          });
        }
      } else {
        this.removeBindingsFromSource(filePath);
        return this.emitter.emit('did-unload-keymap', {
          path: filePath
        });
      }
    };

    KeymapManager.prototype.readKeymap = function(filePath, suppressErrors) {
      var error, _ref2;
      if (suppressErrors) {
        try {
          return CSON.readFileSync(filePath);
        } catch (_error) {
          error = _error;
          console.warn("Failed to reload key bindings file: " + filePath, (_ref2 = error.stack) != null ? _ref2 : error);
          this.emitter.emit('did-fail-to-read-file', error);
          return void 0;
        }
      } else {
        return CSON.readFileSync(filePath);
      }
    };

    KeymapManager.prototype.filePathMatchesPlatform = function(filePath) {
      var component, otherPlatforms, _i, _len, _ref2;
      otherPlatforms = this.getOtherPlatforms();
      _ref2 = path.basename(filePath).split('.').slice(0, -1);
      for (_i = 0, _len = _ref2.length; _i < _len; _i++) {
        component = _ref2[_i];
        if (__indexOf.call(otherPlatforms, component) >= 0) {
          return false;
        }
      }
      return true;
    };


    /*
    Section: Managing Keyboard Events
     */

    KeymapManager.prototype.handleKeyboardEvent = function(event) {
      var currentTarget, enableTimeout, exactMatch, exactMatchCandidates, exactMatches, foundMatch, keystroke, keystrokes, partialMatchCandidates, partialMatches, target, _i, _len, _ref2;
      keystroke = this.keystrokeForKeyboardEvent(event);
      if (this.queuedKeystrokes.length > 0 && isAtomModifier(keystroke)) {
        event.preventDefault();
        return;
      }
      this.queuedKeyboardEvents.push(event);
      this.queuedKeystrokes.push(keystroke);
      keystrokes = this.queuedKeystrokes.join(' ');
      target = event.target;
      if (event.target === document.body && (this.defaultTarget != null)) {
        target = this.defaultTarget;
      }
      _ref2 = this.findMatchCandidates(keystrokes), partialMatchCandidates = _ref2.partialMatchCandidates, exactMatchCandidates = _ref2.exactMatchCandidates;
      partialMatches = this.findPartialMatches(partialMatchCandidates, target);
      if (exactMatchCandidates.length > 0) {
        currentTarget = target;
        while ((currentTarget != null) && currentTarget !== document) {
          exactMatches = this.findExactMatches(exactMatchCandidates, currentTarget);
          for (_i = 0, _len = exactMatches.length; _i < _len; _i++) {
            exactMatch = exactMatches[_i];
            if (exactMatch.command === 'native!') {
              this.clearQueuedKeystrokes();
              return;
            }
            if (exactMatch.command === 'abort!') {
              this.clearQueuedKeystrokes();
              event.preventDefault();
              return;
            }
            if (exactMatch.command === 'unset!') {
              break;
            }
            foundMatch = true;
            if (partialMatches.length > 0) {
              break;
            }
            this.clearQueuedKeystrokes();
            this.cancelPendingState();
            if (this.dispatchCommandEvent(exactMatch.command, target, event)) {
              this.emitter.emit('did-match-binding', {
                keystrokes: keystrokes,
                binding: exactMatch,
                keyboardEventTarget: target
              });
              return;
            }
          }
          currentTarget = currentTarget.parentElement;
        }
      }
      if (partialMatches.length > 0) {
        event.preventDefault();
        enableTimeout = (this.pendingStateTimeoutHandle != null) || foundMatch || (characterForKeyboardEvent(this.queuedKeyboardEvents[0]) != null);
        this.enterPendingState(partialMatches, enableTimeout);
        return this.emitter.emit('did-partially-match-binding', {
          keystrokes: keystrokes,
          partiallyMatchedBindings: partialMatches,
          keyboardEventTarget: target
        });
      } else {
        this.emitter.emit('did-fail-to-match-binding', {
          keystrokes: keystrokes,
          keyboardEventTarget: target
        });
        if (this.pendingPartialMatches != null) {
          return this.terminatePendingState();
        } else {
          if (event.defaultPrevented) {
            this.simulateTextInput(event);
          }
          return this.clearQueuedKeystrokes();
        }
      }
    };

    KeymapManager.prototype.keystrokeForKeyboardEvent = function(event) {
      return keystrokeForKeyboardEvent(event, this.dvorakQwertyWorkaroundEnabled);
    };

    KeymapManager.prototype.getPartialMatchTimeout = function() {
      return this.partialMatchTimeout;
    };


    /*
    Section: Private
     */

    KeymapManager.prototype.simulateTextInput = function(keydownEvent) {
      var character, textInputEvent;
      if (character = characterForKeyboardEvent(keydownEvent, this.dvorakQwertyWorkaroundEnabled)) {
        textInputEvent = document.createEvent("TextEvent");
        textInputEvent.initTextEvent("textInput", true, true, window, character);
        return keydownEvent.path[0].dispatchEvent(textInputEvent);
      }
    };

    KeymapManager.prototype.getOtherPlatforms = function() {
      return OtherPlatforms;
    };

    KeymapManager.prototype.findMatchCandidates = function(keystrokes) {
      var binding, exactMatchCandidates, keystrokesWithSpace, partialMatchCandidates, _i, _len, _ref2;
      partialMatchCandidates = [];
      exactMatchCandidates = [];
      keystrokesWithSpace = keystrokes + ' ';
      _ref2 = this.keyBindings;
      for (_i = 0, _len = _ref2.length; _i < _len; _i++) {
        binding = _ref2[_i];
        if (binding.enabled) {
          if (binding.keystrokes === keystrokes) {
            exactMatchCandidates.push(binding);
          } else if (binding.keystrokes.indexOf(keystrokesWithSpace) === 0) {
            partialMatchCandidates.push(binding);
          }
        }
      }
      return {
        partialMatchCandidates: partialMatchCandidates,
        exactMatchCandidates: exactMatchCandidates
      };
    };

    KeymapManager.prototype.findPartialMatches = function(partialMatchCandidates, target) {
      var ignoreKeystrokes, partialMatches;
      partialMatches = [];
      ignoreKeystrokes = new Set;
      partialMatchCandidates.forEach(function(binding) {
        if (binding.command === 'unset!') {
          return ignoreKeystrokes.add(binding.keystrokes);
        }
      });
      while (partialMatchCandidates.length > 0 && (target != null) && target !== document) {
        partialMatchCandidates = partialMatchCandidates.filter(function(binding) {
          if (!ignoreKeystrokes.has(binding.keystrokes) && target.webkitMatchesSelector(binding.selector)) {
            partialMatches.push(binding);
            return false;
          } else {
            return true;
          }
        });
        target = target.parentElement;
      }
      return partialMatches.sort(function(a, b) {
        return b.keystrokeCount - a.keystrokeCount;
      });
    };

    KeymapManager.prototype.findExactMatches = function(exactMatchCandidates, target) {
      return exactMatchCandidates.filter(function(binding) {
        return target.webkitMatchesSelector(binding.selector);
      }).sort(function(a, b) {
        return a.compare(b);
      });
    };

    KeymapManager.prototype.clearQueuedKeystrokes = function() {
      this.queuedKeyboardEvents = [];
      return this.queuedKeystrokes = [];
    };

    KeymapManager.prototype.enterPendingState = function(pendingPartialMatches, enableTimeout) {
      if (this.pendingStateTimeoutHandle != null) {
        this.cancelPendingState();
      }
      this.pendingPartialMatches = pendingPartialMatches;
      if (enableTimeout) {
        return this.pendingStateTimeoutHandle = setTimeout(this.terminatePendingState.bind(this, true), this.partialMatchTimeout);
      }
    };

    KeymapManager.prototype.cancelPendingState = function() {
      clearTimeout(this.pendingStateTimeoutHandle);
      this.pendingStateTimeoutHandle = null;
      return this.pendingPartialMatches = null;
    };

    KeymapManager.prototype.terminatePendingState = function(timeout) {
      var binding, bindingsToDisable, event, eventsToReplay, _i, _j, _k, _len, _len1, _len2;
      bindingsToDisable = this.pendingPartialMatches;
      eventsToReplay = this.queuedKeyboardEvents;
      this.cancelPendingState();
      this.clearQueuedKeystrokes();
      for (_i = 0, _len = bindingsToDisable.length; _i < _len; _i++) {
        binding = bindingsToDisable[_i];
        binding.enabled = false;
      }
      for (_j = 0, _len1 = eventsToReplay.length; _j < _len1; _j++) {
        event = eventsToReplay[_j];
        this.handleKeyboardEvent(event);
        if ((bindingsToDisable != null) && (this.pendingPartialMatches == null)) {
          for (_k = 0, _len2 = bindingsToDisable.length; _k < _len2; _k++) {
            binding = bindingsToDisable[_k];
            binding.enabled = true;
          }
          bindingsToDisable = null;
        }
      }
      if (typeof atom !== "undefined" && atom !== null) {
        atom.assert(bindingsToDisable == null, "Invalid keymap state");
      }
      if (timeout && (this.pendingPartialMatches != null)) {
        this.terminatePendingState(true);
      }
    };

    KeymapManager.prototype.dispatchCommandEvent = function(command, target, keyboardEvent) {
      var commandEvent, keyBindingAborted;
      commandEvent = new CustomEvent(command, {
        bubbles: true,
        cancelable: true
      });
      commandEvent.__proto__ = CommandEvent.prototype;
      commandEvent.originalEvent = keyboardEvent;
      if (document.contains(target)) {
        target.dispatchEvent(commandEvent);
      } else {
        this.simulateBubblingOnDetachedTarget(target, commandEvent);
      }
      keyBindingAborted = commandEvent.keyBindingAborted;
      if (!keyBindingAborted) {
        keyboardEvent.preventDefault();
      }
      return !keyBindingAborted;
    };

    KeymapManager.prototype.simulateBubblingOnDetachedTarget = function(target, commandEvent) {
      var currentTarget, _ref2;
      Object.defineProperty(commandEvent, 'target', {
        get: function() {
          return target;
        }
      });
      Object.defineProperty(commandEvent, 'currentTarget', {
        get: function() {
          return currentTarget;
        }
      });
      currentTarget = target;
      while (currentTarget != null) {
        currentTarget.dispatchEvent(commandEvent);
        if (commandEvent.propagationStopped) {
          break;
        }
        if (currentTarget === window) {
          break;
        }
        currentTarget = (_ref2 = currentTarget.parentNode) != null ? _ref2 : window;
      }
    };

    return KeymapManager;

  })();

}).call(this);
