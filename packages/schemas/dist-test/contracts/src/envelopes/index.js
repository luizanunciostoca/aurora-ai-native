'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.EVENT_ENVELOPE_KIND = exports.COMMAND_ENVELOPE_KIND = void 0;
var command_envelope_1 = require('./command-envelope');
Object.defineProperty(exports, 'COMMAND_ENVELOPE_KIND', {
  enumerable: true,
  get: function () {
    return command_envelope_1.COMMAND_ENVELOPE_KIND;
  },
});
var event_envelope_1 = require('./event-envelope');
Object.defineProperty(exports, 'EVENT_ENVELOPE_KIND', {
  enumerable: true,
  get: function () {
    return event_envelope_1.EVENT_ENVELOPE_KIND;
  },
});
