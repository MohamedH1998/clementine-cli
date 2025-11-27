import { Primitive, PrimitiveConfig } from '../base.js';
import { coloredPrompts } from '../../lib/helpers.js';

export interface WorkerOnlyConfig extends PrimitiveConfig {
  projectName: string;
}

export const WorkerOnlyPrimitive: Primitive = {
  id: 'worker-only',
  name: 'Worker only',
  description: 'Basic Worker project (no primitives)',

  supportsNewProject: true,
  supportsExisting: false, // Can't "add" worker-only to existing project

  async promptNew(): Promise<WorkerOnlyConfig | null> {
    console.log('\nCreating a basic Worker project (no primitives).\n');

    const response = await coloredPrompts([
      {
        type: 'text',
        name: 'projectName',
        message: 'Project name?',
        initial: 'my-worker',
        validate: (value: string) =>
          /^[a-z0-9-]+$/.test(value) || 'Must be lowercase with hyphens (e.g., my-worker)',
      },
    ]);

    if (!response.projectName) {
      return null;
    }

    return response as WorkerOnlyConfig;
  },

  async generateFiles(projectDir: string, config: PrimitiveConfig): Promise<void> {
    // Worker-only doesn't generate any additional files
    // create-cloudflare handles everything
  },

  getDeploymentInfo(config: PrimitiveConfig) {
    return {
      successMessage: '🎉 Your worker is live!',
      nextSteps: [
        'Open your worker URL to see it in action',
        'Run "clementine" again to add primitives like Queues, KV, or D1',
      ],
    };
  },
};
