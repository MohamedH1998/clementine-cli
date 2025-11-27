import { coloredPrompts } from './helpers.js';

// Feature selection
export type FeatureType = 'queues' | 'worker-only';

export async function promptFeatureSelection(isExistingProject: boolean): Promise<FeatureType | null> {
  if (isExistingProject) {
    console.log('\n✨ Detected existing Worker project\n');
    const response = await coloredPrompts({
      type: 'select',
      name: 'feature',
      message: 'What would you like to add?',
      choices: [
        {
          title: 'Queues',
          description: 'Add Workers Queues with full dashboard demo',
          value: 'queues',
        },
        // Future: Add more primitives here
        // { title: 'Durable Objects', value: 'durable-objects' },
        // { title: 'KV', value: 'kv' },
      ],
      initial: 0,
    });

    return response.feature || null;
  } else {
    console.log('\n✨ No Worker project detected\n');
    const response = await coloredPrompts({
      type: 'select',
      name: 'feature',
      message: 'What would you like to create?',
      choices: [
        {
          title: 'Worker with Queues',
          description: 'Full queue demo with interactive dashboard',
          value: 'queues',
        },
        {
          title: 'Worker only',
          description: 'Basic Worker project (no primitives)',
          value: 'worker-only',
        },
      ],
      initial: 0,
    });

    return response.feature || null;
  }
}

export interface ExistingProjectChoices {
  action: 'add-demo' | 'add-empty' | 'new-subfolder';
  bindingName: string;
  createNamespace: boolean;
}

export interface NewProjectChoices {
  projectName: string;
  includeDemo: boolean;
  bindingName: string;
  createNamespace: boolean;
}

export async function promptExistingProject(): Promise<ExistingProjectChoices | null> {
  console.log('\nDetected a Cloudflare Worker project in this directory.\n');

  const response = await coloredPrompts([
    {
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        {
          title: 'Add KV with simple JSON API route (/kv)',
          value: 'add-demo',
        },
        {
          title: 'Add KV (binding only)',
          value: 'add-empty',
        },
        {
          title: 'Create a new KV demo project in a subfolder',
          value: 'new-subfolder',
        },
      ],
      initial: 0,
    },
    {
      type: 'text',
      name: 'bindingName',
      message: 'Binding name?',
      initial: 'APP_CONFIG',
      validate: (value: string) =>
        /^[A-Z][A-Z0-9_]*$/.test(value) || 'Must be uppercase with underscores (e.g., APP_CONFIG)',
    },
    {
      type: 'confirm',
      name: 'createNamespace',
      message: 'Create KV namespace now?',
      initial: true,
    },
  ]);

  if (!response.action) {
    return null;
  }

  return response as ExistingProjectChoices;
}

export async function promptNewProject(): Promise<NewProjectChoices | null> {
  console.log('\nNo Worker project detected. Let\'s create a new one!\n');

  const response = await coloredPrompts([
    {
      type: 'text',
      name: 'projectName',
      message: 'Project name?',
      initial: 'my-kv-worker',
      validate: (value: string) =>
        /^[a-z0-9-]+$/.test(value) || 'Must be lowercase with hyphens (e.g., my-kv-worker)',
    },
    {
      type: 'confirm',
      name: 'includeDemo',
      message: 'Include simple JSON API demo?',
      initial: true,
    },
    {
      type: 'text',
      name: 'bindingName',
      message: 'Binding name?',
      initial: 'APP_CONFIG',
      validate: (value: string) =>
        /^[A-Z][A-Z0-9_]*$/.test(value) || 'Must be uppercase with underscores (e.g., APP_CONFIG)',
    },
    {
      type: 'confirm',
      name: 'createNamespace',
      message: 'Create KV namespace now?',
      initial: true,
    },
  ]);

  if (!response.projectName) {
    return null;
  }

  return response as NewProjectChoices;
}

export async function confirmAction(message: string): Promise<boolean> {
  const response = await coloredPrompts({
    type: 'confirm',
    name: 'confirmed',
    message,
    initial: true,
  });

  return response.confirmed ?? false;
}

// Queue-specific prompts

export interface NewQueueProjectChoices {
  projectName: string;
  queueName: string;
  bindingName: string;
}

export interface ExistingQueueProjectChoices {
  action: 'add-minimal' | 'add-dashboard' | 'new-subfolder';
  queueName: string;
  bindingName: string;
}

export async function promptNewQueueProject(): Promise<NewQueueProjectChoices | null> {
  console.log('\nNo Worker project detected. Let\'s create a new one with Queues!\n');

  const response = await coloredPrompts([
    {
      type: 'text',
      name: 'projectName',
      message: 'Project name?',
      initial: 'my-queue-worker',
      validate: (value: string) =>
        /^[a-z0-9-]+$/.test(value) || 'Must be lowercase with hyphens (e.g., my-queue-worker)',
    },
    {
      type: 'text',
      name: 'queueName',
      message: 'Queue name?',
      initial: 'demo-queue',
      validate: (value: string) =>
        /^[a-z0-9-]+$/.test(value) || 'Must be lowercase with hyphens (e.g., demo-queue)',
    },
    {
      type: 'text',
      name: 'bindingName',
      message: 'Binding name?',
      initial: 'DEMO_QUEUE',
      validate: (value: string) =>
        /^[A-Z][A-Z0-9_]*$/.test(value) || 'Must be uppercase with underscores (e.g., DEMO_QUEUE)',
    },
  ]);

  if (!response.projectName) {
    return null;
  }

  return response as NewQueueProjectChoices;
}

// Worker-only prompts

export interface WorkerOnlyProjectChoices {
  projectName: string;
}

export async function promptWorkerOnlyProject(): Promise<WorkerOnlyProjectChoices | null> {
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

  return response as WorkerOnlyProjectChoices;
}

export async function promptExistingQueueProject(): Promise<ExistingQueueProjectChoices | null> {
  console.log('\nDetected a Cloudflare Worker project in this directory.\n');

  const response = await coloredPrompts([
    {
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        {
          title: 'Add Queues (minimal setup)',
          value: 'add-minimal',
        },
        {
          title: 'Add Queues with full dashboard (Phase 2)',
          value: 'add-dashboard',
          disabled: true,
        },
        {
          title: 'Create a new queue project in a subfolder',
          value: 'new-subfolder',
        },
      ],
      initial: 0,
    },
    {
      type: 'text',
      name: 'queueName',
      message: 'Queue name?',
      initial: 'demo-queue',
      validate: (value: string) =>
        /^[a-z0-9-]+$/.test(value) || 'Must be lowercase with hyphens (e.g., demo-queue)',
    },
    {
      type: 'text',
      name: 'bindingName',
      message: 'Binding name?',
      initial: 'DEMO_QUEUE',
      validate: (value: string) =>
        /^[A-Z][A-Z0-9_]*$/.test(value) || 'Must be uppercase with underscores (e.g., DEMO_QUEUE)',
    },
  ]);

  if (!response.action) {
    return null;
  }

  return response as ExistingQueueProjectChoices;
}
