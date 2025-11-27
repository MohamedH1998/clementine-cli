import path from 'node:path';
import fs from 'fs-extra';
import { execa } from 'execa';
import { ProjectContext } from '../detect.js';
import { Primitive, PrimitiveConfig } from '../../primitives/base.js';
import { logger } from '../logger.js';

/**
 * Generic flow for creating a new Worker project with any primitive
 * Works with Queues, KV, D1, Worker-only, etc.
 */
export async function runGenericNewFlow(
  primitive: Primitive,
  config: PrimitiveConfig,
  context: ProjectContext
): Promise<void> {
  const { projectName } = config;

  if (!projectName) {
    logger.error('Project name is required');
    process.exit(1);
  }

  const projectDir = path.join(process.cwd(), projectName);

  if (await fs.pathExists(projectDir)) {
    logger.error(`Directory "${projectName}" already exists`);
    process.exit(1);
  }

  // Step 1: Scaffold the Worker project using create-cloudflare
  logger.step('Creating Worker project with create-cloudflare...');

  try {
    await execa(
      'npm',
      [
        'create',
        'cloudflare@latest',
        projectName,
        '--',
        '--type',
        'hello-world',
        '--lang',
        'ts',
        '--no-deploy',
        '--git',
      ],
      {
        stdio: 'inherit',
        cwd: process.cwd(),
      }
    );

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

  // Step 3: Patch config (if primitive needs it)
  if (primitive.patchConfig) {
    logger.step(`Adding ${primitive.name} configuration...`);

    const configPatched = await primitive.patchConfig(configPath, config);

    if (!configPatched) {
      logger.error('Failed to patch wrangler config');
      process.exit(1);
    }
  }

  // Step 4: Generate files (if primitive needs it)
  logger.step(`Generating ${primitive.name} files...`);
  await primitive.generateFiles(projectDir, config);

  // Step 5: Success message
  logger.success(`Created project: ${projectName}`);

  // Step 6: Ask about deployment
  console.log('');
  const { promptDeploy, deployProject } = await import('../deploy.js');
  const shouldDeploy = await promptDeploy();

  if (shouldDeploy) {
    console.log('');

    // Run primitive-specific pre-deploy steps
    if (primitive.preDeploySteps) {
      await primitive.preDeploySteps(projectDir, config);
    }

    // Deploy
    await deployProject({
      projectDir,
      projectName,
    });

    // Show primitive-specific deployment info
    const deployInfo = primitive.getDeploymentInfo?.(config);
    if (deployInfo) {
      if (deployInfo.successMessage) {
        console.log(`\n${deployInfo.successMessage}`);
      }
      console.log('View your deployment at: https://dash.cloudflare.com');
    }
  } else {
    // Show local dev instructions
    console.log('\nFor local development:');
    console.log(`  cd ${projectName}`);
    console.log('  npm run dev');

    // Show primitive-specific next steps
    const deployInfo = primitive.getDeploymentInfo?.(config);
    if (deployInfo?.nextSteps) {
      console.log('\nTry the demo:');
      deployInfo.nextSteps.forEach((step, i) => {
        console.log(`  ${i + 1}. ${step}`);
      });
    }

    console.log('\nOr use curl:');
    console.log('  curl -X POST http://localhost:8787 -d "Hello!"');

    console.log('\nTo deploy later:');
    console.log(`  cd ${projectName}`);

    // Add primitive-specific deployment instructions
    if (primitive.id === 'queues') {
      const queueConfig = config as any;
      console.log(`  npx wrangler queues create ${queueConfig.queueName}`);
    }

    console.log('  npx wrangler deploy');
  }
}
