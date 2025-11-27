/**
 * Primitives registry - all primitives are registered here
 * To add a new primitive:
 * 1. Create a new directory under src/primitives/
 * 2. Implement the Primitive interface
 * 3. Import and register it below
 */

import { registry } from './registry.js';
import { QueuesPrimitive } from './queues/index.js';
import { WorkerOnlyPrimitive } from './worker-only/index.js';

// Register all primitives
registry.register(QueuesPrimitive);
registry.register(WorkerOnlyPrimitive);

export { registry };
export * from './base.js';
