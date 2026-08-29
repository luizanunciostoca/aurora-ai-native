# W00-C Test Foundation

Canonical baseline smoke coverage uses Node.js built-in `node:test` and adds no third-party test framework.

Root `npm test` runs the smoke suite first and then W00-A's canonical workspace test dispatcher. Failures are not masked.

Later contract/integration suites are introduced only when their canonical W01+ contracts/runtime boundaries exist.
