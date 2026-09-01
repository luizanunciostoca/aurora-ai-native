'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.safeParseWith = safeParseWith;
function safeParseWith(parse, input) {
  try {
    return { success: true, data: parse(input) };
  } catch (error) {
    if (error instanceof TypeError) {
      return { success: false, error };
    }
    throw error;
  }
}
