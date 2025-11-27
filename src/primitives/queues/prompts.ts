import { coloredPrompts } from '../../lib/helpers.js';

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
