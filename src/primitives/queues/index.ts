import path from 'node:path';
import fs from 'fs-extra';
import { execa } from 'execa';
import { Primitive, PrimitiveConfig } from '../base.js';
import { promptNewQueueProject, promptExistingQueueProject } from './prompts.js';
import { patchWranglerConfigForQueues } from './config.js';
import { generateQueueWorkerCode, generateEventStoreCode, generateDashboardHTML } from './templates.js';
import { logger } from '../../lib/logger.js';

export interface QueuesPrimitiveConfig extends PrimitiveConfig {
  projectName: string;
  queueName: string;
  bindingName: string;
}

export const QueuesPrimitive: Primitive = {
  id: 'queues',
  name: 'Queues',
  description: 'Workers Queues with interactive dashboard',

  supportsNewProject: true,
  supportsExisting: true,

  async promptNew(): Promise<QueuesPrimitiveConfig | null> {
    const choices = await promptNewQueueProject();
    return choices;
  },

  async promptExisting(): Promise<QueuesPrimitiveConfig | null> {
    const choices = await promptExistingQueueProject();
    if (!choices) return null;

    // For existing projects, we don't have projectName
    return {
      queueName: choices.queueName,
      bindingName: choices.bindingName,
    } as QueuesPrimitiveConfig;
  },

  async patchConfig(configPath: string, config: PrimitiveConfig): Promise<boolean> {
    const queueConfig = config as QueuesPrimitiveConfig;
    return await patchWranglerConfigForQueues(configPath, {
      queueName: queueConfig.queueName,
      bindingName: queueConfig.bindingName,
      maxBatchSize: 4,
      maxBatchTimeout: 3,
      maxRetries: 3,
    });
  },

  async generateFiles(projectDir: string, config: PrimitiveConfig): Promise<void> {
    const queueConfig = config as QueuesPrimitiveConfig;
    const srcDir = path.join(projectDir, 'src');

    // Ensure src directory exists
    await fs.ensureDir(srcDir);

    // Generate index.ts with full demo worker
    const entryFilePath = path.join(srcDir, 'index.ts');
    const workerCode = generateQueueWorkerCode({
      queueName: queueConfig.queueName,
      bindingName: queueConfig.bindingName,
    });
    await fs.writeFile(entryFilePath, workerCode, 'utf-8');

    // Generate event-store.ts
    const eventStorePath = path.join(srcDir, 'event-store.ts');
    const eventStoreCode = generateEventStoreCode();
    await fs.writeFile(eventStorePath, eventStoreCode, 'utf-8');

    // Generate dashboard.html
    const dashboardPath = path.join(srcDir, 'dashboard.html');
    const dashboardHTML = generateDashboardHTML();
    await fs.writeFile(dashboardPath, dashboardHTML, 'utf-8');

    logger.success('Created queue demo files (index.ts, event-store.ts, dashboard.html)');
  },

  async preDeploySteps(projectDir: string, config: PrimitiveConfig): Promise<void> {
    const queueConfig = config as QueuesPrimitiveConfig;

    logger.step(`Creating queue: ${queueConfig.queueName}...`);

    try {
      await execa('npx', ['wrangler', 'queues', 'create', queueConfig.queueName], {
        cwd: projectDir,
        stdio: 'inherit',
      });
      logger.success(`Queue "${queueConfig.queueName}" created`);
    } catch (error) {
      // Queue might already exist, which is okay
      logger.warn(`Queue creation failed (it might already exist)`);
      logger.info('Continuing with deployment...');
    }
  },

  getDeploymentInfo(config: PrimitiveConfig) {
    return {
      successMessage: '🎉 Your queue worker is live!',
      nextSteps: [
        'Open http://localhost:8787 in your browser to view the live dashboard',
        'Click "Enqueue Message" to send messages to the queue',
        'Watch the real-time visualization of queue → consumer → events',
      ],
    };
  },
};
