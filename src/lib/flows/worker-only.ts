import path from 'node:path';
import fs from 'fs-extra';
import { execa } from 'execa';
import { ProjectContext } from '../detect.js';
import { promptWorkerOnlyProject } from '../prompts.js';
import { logger } from '../logger.js';

export async function runWorkerOnlyFlow(context: ProjectContext): Promise<void> {
  const choices = await promptWorkerOnlyProject();

  if (!choices) {
    logger.info('Setup cancelled');
    process.exit(0);
  }

  const { projectName } = choices;

  const projectDir = path.join(process.cwd(), projectName);

  if (await fs.pathExists(projectDir)) {
    logger.error(`Directory "${projectName}" already exists`);
    process.exit(1);
  }

  // Scaffold the Worker project using create-cloudflare
  logger.step('Creating Worker project with create-cloudflare...');

  try {
    // Run c3 with non-interactive flags
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

    logger.success('Worker project created');
  } catch (error) {
    logger.error('Failed to run create-cloudflare');
    logger.info('Make sure you have npm installed and internet connection');
    process.exit(1);
  }

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
      projectName,
    });
  } else {
    // Show local dev instructions
    console.log('\nFor local development:');
    console.log(`  cd ${projectName}`);
    console.log('  npm run dev');
    console.log('\nYour Worker will be available at http://localhost:8787');

    console.log('\nTo deploy later:');
    console.log(`  cd ${projectName}`);
    console.log('  npx wrangler deploy');
  }

  console.log('\nTo add primitives later, run:');
  console.log('  clementine');
}
