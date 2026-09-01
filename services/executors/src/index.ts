/**
 * Canonical Executor Plane shared publication root.
 *
 * Program Control owns this barrel. Only independently accepted W07 leaves may
 * be exported here. Exporting a leaf publishes its API surface; it does not
 * grant execution authority, provider binding, or side-effect permission.
 */
export * from './target-resolution/index.js';
