import { detectProjectContext } from '../lib/detect.js';
import { runNewProjectFlow } from '../lib/flows/new.js';
import { runExistingProjectFlow } from '../lib/flows/existing.js';
import { logger } from '../lib/logger.js';

export interface QueueOptions {
  add?: boolean;
  new?: boolean;
}

export async function initQueues(options: QueueOptions): Promise<void> {
  // Validate options
  if (options.add && options.new) {
    logger.error('Cannot use both --add and --new flags');
    process.exit(1);
  }

  const context = await detectProjectContext();

  if (options.new) {
    await runNewProjectFlow(context);
  } else if (options.add) {
    if (!context.isWorkerProject) {
      logger.error('Not a Worker project. Use --new to create a new project.');
      process.exit(1);
    }
    await runExistingProjectFlow(context);
  } else {
    if (context.isWorkerProject) {
      logger.info('Detected existing Worker project');
      await runExistingProjectFlow(context);
    } else {
      logger.info('No Worker project detected. Creating new project...');
      await runNewProjectFlow(context);
    }
  }
}
