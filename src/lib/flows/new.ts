import path from 'node:path';
import fs from 'fs-extra';
import { execa } from 'execa';
import { ProjectContext } from '../detect.js';
import { promptNewQueueProject } from '../prompts.js';
import {
  generateQueueWorkerCode,
  generateEventStoreCode,
  generateDashboardHTML,
} from '../templates.js';
import { patchWranglerConfigForQueues } from '../config.js';
import { logger } from '../logger.js';

export async function runNewProjectFlow(context: ProjectContext): Promise<void> {
  const choices = await promptNewQueueProject();

  if (!choices) {
    logger.info('Setup cancelled');
    process.exit(0);
  }

  const { projectName, queueName, bindingName } = choices;

  const projectDir = path.join(process.cwd(), projectName);

  if (await fs.pathExists(projectDir)) {
    logger.error(`Directory "${projectName}" already exists`);
    process.exit(1);
  }

  // Step 1: Use c3 to scaffold the Worker project
  logger.step('Scaffolding Worker project with create-cloudflare...');

  try {
    await execa('npm', [
      'create',
      'cloudflare@latest',
      projectName,
      '--',
      '--type', 'hello-world',
      '--lang', 'ts',
      '--no-deploy',
      '--git',
    ], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    logger.success('Base Worker project created');
  } catch (error) {
    logger.error('Failed to run create-cloudflare');
    logger.info('Make sure you have npm installed and internet connection');
    process.exit(1);
  }

  // Step 2: Detect which wrangler config file was generated
  const wranglerJsoncPath = path.join(projectDir, 'wrangler.jsonc');
  const wranglerJsonPath = path.join(projectDir, 'wrangler.json');
  const wranglerTomlPath = path.join(projectDir, 'wrangler.toml');

  let configPath: string;

  // Check in priority order: jsonc, json, toml
  if (await fs.pathExists(wranglerJsoncPath)) {
    configPath = wranglerJsoncPath;
    logger.info('Detected wrangler.jsonc configuration');
  } else if (await fs.pathExists(wranglerJsonPath)) {
    configPath = wranglerJsonPath;
    logger.info('Detected wrangler.json configuration');
  } else if (await fs.pathExists(wranglerTomlPath)) {
    configPath = wranglerTomlPath;
    logger.info('Detected wrangler.toml configuration');
  } else {
    logger.error('Could not find wrangler config in the generated project');
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

  // Step 3: Create the full queue demo files
  logger.step('Generating queue demo files...');

  const srcDir = path.join(projectDir, 'src');

  // 3a. Create index.ts with full demo worker
  const entryFilePath = path.join(srcDir, 'index.ts');
  const workerCode = generateQueueWorkerCode({ queueName, bindingName });
  await fs.writeFile(entryFilePath, workerCode, 'utf-8');

  // 3b. Create event-store.ts
  const eventStorePath = path.join(srcDir, 'event-store.ts');
  const eventStoreCode = generateEventStoreCode();
  await fs.writeFile(eventStorePath, eventStoreCode, 'utf-8');

  // 3c. Create dashboard.html
  const dashboardPath = path.join(srcDir, 'dashboard.html');
  const dashboardHTML = generateDashboardHTML();
  await fs.writeFile(dashboardPath, dashboardHTML, 'utf-8');

  logger.success('Created queue demo files (index.ts, event-store.ts, dashboard.html)');

  // Success message
  logger.success(`Created project: ${projectName}`);

  // Ask about deployment
  console.log('');
  const { promptDeploy, deployProject } = await import('../deploy.js');
  const shouldDeploy = await promptDeploy();

  if (shouldDeploy) {
    console.log('');
    await deployProject({
      projectDir,
      queueName,
      projectName,
    });
  } else {
    // Show local dev instructions
    console.log('\nFor local development:');
    console.log(`  cd ${projectName}`);
    console.log('  npm run dev');
    console.log('\nTry the demo:');
    console.log('  1. Open http://localhost:8787 in your browser to view the live dashboard');
    console.log('  2. Click "Enqueue Message" to send messages to the queue');
    console.log('  3. Watch the real-time visualization of queue → consumer → events');
    console.log('\nOr use curl:');
    console.log('  curl -X POST http://localhost:8787 -d "Hello queue!"');

    console.log('\nTo deploy later:');
    console.log(`  cd ${projectName}`);
    console.log(`  npx wrangler queues create ${queueName}`);
    console.log('  npx wrangler deploy');
  }
}
