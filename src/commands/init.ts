import { detectProjectContext } from '../lib/detect.js';
import { registry } from '../primitives/index.js';
import { runGenericNewFlow } from '../lib/flows/generic-new.js';
import { runGenericExistingFlow } from '../lib/flows/generic-existing.js';
import { logger } from '../lib/logger.js';
import prompts from 'prompts';

export interface InitOptions {
  add?: boolean;
  new?: boolean;
}

export async function init(options: InitOptions): Promise<void> {
  // Validate options
  if (options.add && options.new) {
    logger.error('Cannot use both --add and --new flags');
    process.exit(1);
  }

  // Detect project context
  const context = await detectProjectContext();

  // Determine if we should show feature selection
  const showFeatureSelection = !options.add && !options.new;

  if (showFeatureSelection) {
    // Interactive mode - show primitive selection menu
    const selectedPrimitiveId = await promptPrimitiveSelection(context.isWorkerProject);

    if (!selectedPrimitiveId) {
      logger.info('Setup cancelled');
      process.exit(0);
    }

    const primitive = registry.get(selectedPrimitiveId);

    if (!primitive) {
      logger.error(`Unknown primitive: ${selectedPrimitiveId}`);
      process.exit(1);
    }

    // Get primitive-specific config
    if (context.isWorkerProject) {
      if (!primitive.supportsExisting) {
        logger.warn(`${primitive.name} cannot be added to existing projects.`);
        process.exit(0);
      }

      if (!primitive.promptExisting) {
        logger.error(`${primitive.name} does not support existing projects.`);
        process.exit(1);
      }

      const config = await primitive.promptExisting();
      if (!config) {
        logger.info('Setup cancelled');
        process.exit(0);
      }

      await runGenericExistingFlow(primitive, config, context);
    } else {
      const config = await primitive.promptNew();
      if (!config) {
        logger.info('Setup cancelled');
        process.exit(0);
      }

      await runGenericNewFlow(primitive, config, context);
    }
  } else {
    // Flag-based mode (--new or --add) - default to queues for backwards compatibility
    const queuesPrimitive = registry.get('queues');

    if (!queuesPrimitive) {
      logger.error('Queues primitive not found');
      process.exit(1);
    }

    if (options.new) {
      // Force new project with queues
      const config = await queuesPrimitive.promptNew();
      if (!config) {
        logger.info('Setup cancelled');
        process.exit(0);
      }
      await runGenericNewFlow(queuesPrimitive, config, context);
    } else if (options.add) {
      // Force add to existing
      if (!context.isWorkerProject) {
        logger.error('Not a Worker project. Use --new to create a new project.');
        process.exit(1);
      }

      if (!queuesPrimitive.promptExisting) {
        logger.error('Queues does not support existing projects.');
        process.exit(1);
      }

      const config = await queuesPrimitive.promptExisting();
      if (!config) {
        logger.info('Setup cancelled');
        process.exit(0);
      }
      await runGenericExistingFlow(queuesPrimitive, config, context);
    }
  }
}

async function promptPrimitiveSelection(isExistingProject: boolean): Promise<string | null> {
  const primitives = isExistingProject
    ? registry.getForExisting()
    : registry.getForNewProject();

  if (primitives.length === 0) {
    logger.error('No primitives available');
    return null;
  }

  const message = isExistingProject
    ? 'What would you like to add?'
    : 'What would you like to create?';

  console.log(isExistingProject ? '\n✨ Detected existing Worker project\n' : '\n✨ No Worker project detected\n');

  const response = await prompts({
    type: 'select',
    name: 'primitive',
    message,
    choices: primitives.map((p) => ({
      title: p.name,
      description: p.description,
      value: p.id,
    })),
    initial: 0,
  });

  return response.primitive || null;
}
