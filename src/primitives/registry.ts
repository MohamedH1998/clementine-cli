import { Primitive } from './base.js';

/**
 * Central registry for all primitives
 * Primitives register themselves here to be discovered by the CLI
 */
class PrimitiveRegistry {
  private primitives: Map<string, Primitive> = new Map();

  register(primitive: Primitive): void {
    this.primitives.set(primitive.id, primitive);
  }

  get(id: string): Primitive | undefined {
    return this.primitives.get(id);
  }

  getAll(): Primitive[] {
    return Array.from(this.primitives.values());
  }

  getForNewProject(): Primitive[] {
    return this.getAll().filter((p) => p.supportsNewProject);
  }

  getForExisting(): Primitive[] {
    return this.getAll().filter((p) => p.supportsExisting);
  }

  has(id: string): boolean {
    return this.primitives.has(id);
  }
}

// Export singleton instance
export const registry = new PrimitiveRegistry();
