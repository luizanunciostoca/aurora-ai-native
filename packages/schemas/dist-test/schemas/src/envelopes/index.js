'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.createEventEnvelopeSchema =
  exports.EventEnvelopeSchema =
  exports.createCommandEnvelopeSchema =
  exports.CommandEnvelopeSchema =
    void 0;
var command_envelope_schema_1 = require('./command-envelope.schema');
Object.defineProperty(exports, 'CommandEnvelopeSchema', {
  enumerable: true,
  get: function () {
    return command_envelope_schema_1.CommandEnvelopeSchema;
  },
});
Object.defineProperty(exports, 'createCommandEnvelopeSchema', {
  enumerable: true,
  get: function () {
    return command_envelope_schema_1.createCommandEnvelopeSchema;
  },
});
var event_envelope_schema_1 = require('./event-envelope.schema');
Object.defineProperty(exports, 'EventEnvelopeSchema', {
  enumerable: true,
  get: function () {
    return event_envelope_schema_1.EventEnvelopeSchema;
  },
});
Object.defineProperty(exports, 'createEventEnvelopeSchema', {
  enumerable: true,
  get: function () {
    return event_envelope_schema_1.createEventEnvelopeSchema;
  },
});
