import path from 'node:path';
import fs from 'fs-extra';
import { ProjectContext } from '../detect.js';
import { logger } from '../logger.js';
import { promptExistingQueueProject } from '../prompts.js';
import {
  generateQueueWorkerCode,
  generateEventStoreCode,
  generateDashboardHTML,
} from '../templates.js';
import { patchWranglerConfigForQueues } from '../config.js';

export async function runExistingProjectFlow(context: ProjectContext): Promise<void> {
  const choices = await promptExistingQueueProject();

  if (!choices) {
    logger.info('Setup cancelled');
    process.exit(0);
  }

  const { queueName, bindingName } = choices;

  // Find wrangler config
  const configPath = context.wranglerConfigPath;
  if (!configPath) {
    logger.error('Could not find wrangler.toml or wrangler.json in the project');
    process.exit(1);
  }

  logger.step('Adding queue configuration...');

  const configPatched = await patchWranglerConfigForQueues(configPath, {
    queueName,
    bindingName,
    maxBatchSize: 4,
    maxBatchTimeout: 3,
    maxRetries: 3,
  });

  if (!configPatched) {
    logger.error('Failed to patch wrangler config');
    process.exit(1);
  }

  // Create the queue demo files in src/
  logger.step('Creating queue demo files...');

  const projectRoot = process.cwd();
  const srcDir = path.join(projectRoot, 'src');

  // Ensure src directory exists
  await fs.ensureDir(srcDir);

  // Create event-store.ts
  const eventStorePath = path.join(srcDir, 'event-store.ts');
  if (await fs.pathExists(eventStorePath)) {
    logger.warn('event-store.ts already exists, skipping');
  } else {
    const eventStoreCode = generateEventStoreCode();
    await fs.writeFile(eventStorePath, eventStoreCode, 'utf-8');
    logger.success('Created event-store.ts');
  }

  // Create dashboard.html
  const dashboardPath = path.join(srcDir, 'dashboard.html');
  if (await fs.pathExists(dashboardPath)) {
    logger.warn('dashboard.html already exists, skipping');
  } else {
    const dashboardHTML = generateDashboardHTML();
    await fs.writeFile(dashboardPath, dashboardHTML, 'utf-8');
    logger.success('Created dashboard.html');
  }

  // Create a sample queue handler file (but don't overwrite existing index.ts)
  const queueHandlerPath = path.join(srcDir, 'queue-handler.ts');
  if (await fs.pathExists(queueHandlerPath)) {
    logger.warn('queue-handler.ts already exists, skipping');
  } else {
    const workerCode = generateQueueWorkerCode({ queueName, bindingName });
    await fs.writeFile(queueHandlerPath, workerCode, 'utf-8');
    logger.success('Created queue-handler.ts as a reference');
  }

  // Provide manual instructions
  console.log('\n' + '='.repeat(80));
  logger.success('Queue configuration added!');
  console.log('='.repeat(80));

  console.log('\n📝 Manual steps required:\n');
  console.log('Your existing index.ts was not modified. You need to integrate the queue code:');
  console.log('\n1. Add to your Env interface:');
  console.log(`   ${bindingName}: Queue;`);
  console.log('   EVENT_STORE: DurableObjectNamespace;');
  console.log('\n2. Add these imports at the top of your index.ts:');
  console.log('   import { EventStore } from "./event-store";');
  console.log('   import dashboardHTML from "./dashboard.html";');
  console.log('\n3. Export the EventStore class:');
  console.log('   export { EventStore };');
  console.log('\n4. Add dashboard route to your fetch handler:');
  console.log('   if (request.method === "GET" && url.pathname === "/") {');
  console.log('     return new Response(dashboardHTML, {');
  console.log('       headers: { "Content-Type": "text/html" },');
  console.log('     });');
  console.log('   }');
  console.log('\n5. Add queue consumer handler to your worker:');
  console.log('   async queue(batch: MessageBatch, env: Env): Promise<void> {');
  console.log('     // See queue-handler.ts for full implementation');
  console.log('   }');
  console.log('\n📄 Reference: Check queue-handler.ts for the complete implementation');

  // Ask if they want to create the queue now
  console.log('');
  const prompts = await import('prompts');
  const { createQueue } = await prompts.default({
    type: 'confirm',
    name: 'createQueue',
    message: `Create the "${queueName}" queue in Cloudflare now?`,
    initial: false,
  });

  if (createQueue) {
    console.log('');
    logger.step(`Creating queue: ${queueName}...`);

    try {
      const { execa } = await import('execa');
      await execa('npx', ['wrangler', 'queues', 'create', queueName], {
        cwd: process.cwd(),
        stdio: 'inherit',
      });
      logger.success(`Queue "${queueName}" created`);
    } catch (error) {
      logger.warn('Queue creation failed (it might already exist)');
      logger.info(`You can create it later: npx wrangler queues create ${queueName}`);
    }
  } else {
    console.log(`\n⚠️  Remember to create the queue before deploying: npx wrangler queues create ${queueName}`);
  }

  console.log('\nNext steps:');
  console.log('  npm run dev');
  console.log('  Open http://localhost:8787 to view the dashboard');
  console.log('\nWhen ready to deploy:');
  if (!createQueue) {
    console.log(`  npx wrangler queues create ${queueName}`);
  }
  console.log('  npx wrangler deploy');
}
