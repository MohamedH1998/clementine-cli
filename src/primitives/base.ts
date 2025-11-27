/**
 * Base interface for all primitives (Queues, KV, D1, R2, etc.)
 * Each primitive implements this interface to provide consistent behavior
 */

export interface PrimitiveConfig {
  projectName?: string;
  [key: string]: any; // Primitive-specific config
}

export interface Primitive {
  // Metadata
  id: string; // 'queues', 'kv', 'd1', 'worker-only', etc.
  name: string; // 'Queues', 'KV', 'D1', 'Worker only'
  description: string; // For menu display

  // Capabilities
  supportsNewProject: boolean; // Can create new projects
  supportsExisting: boolean; // Can add to existing projects

  // Prompts - gather user input
  promptNew(): Promise<PrimitiveConfig | null>;
  promptExisting?(): Promise<PrimitiveConfig | null>;

  // Config patching - update wrangler.toml/jsonc
  patchConfig?(configPath: string, config: PrimitiveConfig): Promise<boolean>;

  // File generation - create source files
  generateFiles(projectDir: string, config: PrimitiveConfig): Promise<void>;

  // Pre-deployment steps (optional) - e.g., create queue, create namespace
  preDeploySteps?(projectDir: string, config: PrimitiveConfig): Promise<void>;

  // Post-deployment info (optional) - what to show after deployment
  getDeploymentInfo?(config: PrimitiveConfig): DeploymentInfo;

  // Dependencies (optional) - other primitives this depends on
  dependencies?: string[];
}

export interface DeploymentInfo {
  successMessage?: string;
  nextSteps?: string[];
}
