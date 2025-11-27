import { execa } from 'execa';
import { logger } from './logger.js';
import { coloredPrompts } from './helpers.js';

export interface DeployOptions {
  projectDir: string;
  queueName?: string;
  projectName: string;
}

export async function promptDeploy(): Promise<boolean> {
  const response = await coloredPrompts({
    type: 'confirm',
    name: 'deploy',
    message: 'Deploy to Cloudflare now?',
    initial: false,
  });

  return response.deploy ?? false;
}

export async function deployProject(options: DeployOptions): Promise<void> {
  const { projectDir, queueName, projectName } = options;

  try {
    // Step 1: If there's a queue, create it first
    if (queueName) {
      logger.step(`Creating queue: ${queueName}...`);

      try {
        await execa('npx', ['wrangler', 'queues', 'create', queueName], {
          cwd: projectDir,
          stdio: 'inherit',
        });
        logger.success(`Queue "${queueName}" created`);
      } catch (error) {
        // Queue might already exist, which is okay
        logger.warn(`Queue creation failed (it might already exist)`);
        logger.info('Continuing with deployment...');
      }
    }

    // Step 2: Deploy the worker
    logger.step('Deploying to Cloudflare...');

    await execa('npx', ['wrangler', 'deploy'], {
      cwd: projectDir,
      stdio: 'inherit',
    });

    logger.success(`Successfully deployed ${projectName}!`);

    if (queueName) {
      console.log('\n🎉 Your queue worker is live!');
      console.log('View your deployment at: https://dash.cloudflare.com');
    } else {
      console.log('\n🎉 Your worker is live!');
      console.log('View your deployment at: https://dash.cloudflare.com');
    }
  } catch (error) {
    logger.error('Deployment failed');

    if (error instanceof Error) {
      if (error.message.includes('not authenticated')) {
        logger.info('Run "wrangler login" to authenticate with Cloudflare');
      } else {
        logger.info(`You can deploy later by running: cd ${projectName} && npx wrangler deploy`);

        if (queueName) {
          logger.info(`Remember to create the queue first: npx wrangler queues create ${queueName}`);
        }
      }
    }
  }
}
