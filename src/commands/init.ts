import { detectProjectContext } from '../lib/detect.js';
import { promptFeatureSelection } from '../lib/prompts.js';
import { runNewProjectFlow } from '../lib/flows/new.js';
import { runExistingProjectFlow } from '../lib/flows/existing.js';
import { runWorkerOnlyFlow } from '../lib/flows/worker-only.js';
import { logger } from '../lib/logger.js';

export interface InitOptions {
  add?: boolean;
  new?: boolean;
}

export async function init(options: InitOptions): Promise<void> {
  if (options.add && options.new) {
    logger.error('Cannot use both --add and --new flags');
    process.exit(1);
  }

  const context = await detectProjectContext();

  const showFeatureSelection = !options.add && !options.new;

  if (showFeatureSelection) {
    const feature = await promptFeatureSelection(context.isWorkerProject);

    if (!feature) {
      logger.info('Setup cancelled');
      process.exit(0);
    }

    if (feature === 'queues') {
      if (context.isWorkerProject) {
        await runExistingProjectFlow(context);
      } else {
        await runNewProjectFlow(context);
      }
    } else if (feature === 'worker-only') {
      if (context.isWorkerProject) {
        logger.warn('Already in a Worker project. Nothing to do!');
        process.exit(0);
      } else {
        await runWorkerOnlyFlow(context);
      }
    }
  } else {
    if (options.new) {
      await runNewProjectFlow(context);
    } else if (options.add) {
      // Force add to existing
      if (!context.isWorkerProject) {
        logger.error('Not a Worker project. Use --new to create a new project.');
        process.exit(1);
      }
      await runExistingProjectFlow(context);
    }
  }
}
