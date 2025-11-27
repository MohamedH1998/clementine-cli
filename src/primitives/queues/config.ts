import fs from 'fs-extra';
import * as jsonc from 'jsonc-parser';
import { logger } from '../../lib/logger.js';

export interface QueueConfig {
  queueName: string;
  bindingName: string;
  maxBatchSize?: number;
  maxBatchTimeout?: number;
  maxRetries?: number;
}

export async function patchWranglerConfigForQueues(
  configPath: string,
  config: QueueConfig
): Promise<boolean> {
  try {
    const content = await fs.readFile(configPath, 'utf-8');

    // Check if it's TOML
    if (configPath.endsWith('.toml')) {
      return await patchTomlConfigForQueues(configPath, content, config);
    }

    // Handle JSON/JSONC
    return await patchJsonConfigForQueues(configPath, content, config);
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Failed to patch config: ${error.message}`);
    }
    return false;
  }
}

async function patchTomlConfigForQueues(
  configPath: string,
  content: string,
  config: QueueConfig
): Promise<boolean> {
  try {
    const {
      queueName,
      bindingName,
      maxBatchSize = 4,
      maxBatchTimeout = 3,
      maxRetries = 3
    } = config;

    // Check if queue already exists
    if (content.includes(`queue = "${queueName}"`)) {
      logger.warn(`Queue "${queueName}" already exists in config`);
      return true;
    }

    let updatedContent = content;

    // 1. Add HTML module rule if not present
    if (!content.includes('globs = ["**/*.html"]')) {
      const htmlRule = `
[[rules]]
type = "Text"
globs = ["**/*.html"]
fallthrough = true
`;
      updatedContent += htmlRule;
    }

    // 2. Add queue producer and consumer configuration
    const queueConfig = `
# Queue Configuration
[[queues.producers]]
queue = "${queueName}"
binding = "${bindingName}"

[[queues.consumers]]
queue = "${queueName}"
max_batch_size = ${maxBatchSize}
max_batch_timeout = ${maxBatchTimeout}
max_retries = ${maxRetries}
`;
    updatedContent += queueConfig;

    // 3. Add Durable Object binding if not present
    if (!content.includes('name = "EVENT_STORE"')) {
      const doBinding = `
# Durable Object for Event Storage
[[durable_objects.bindings]]
name = "EVENT_STORE"
class_name = "EventStore"
`;
      updatedContent += doBinding;
    }

    // 4. Add migration if not present
    if (!content.includes('new_classes = ["EventStore"]')) {
      const migration = `
# Durable Object Migrations
[[migrations]]
tag = "v1"
new_classes = ["EventStore"]
`;
      updatedContent += migration;
    }

    await fs.writeFile(configPath, updatedContent, 'utf-8');
    logger.success('Updated wrangler.toml with queue configuration');
    return true;
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Failed to patch TOML config: ${error.message}`);
    }
    return false;
  }
}

async function patchJsonConfigForQueues(
  configPath: string,
  content: string,
  config: QueueConfig
): Promise<boolean> {
  try {
    const {
      queueName,
      bindingName,
      maxBatchSize = 4,
      maxBatchTimeout = 3,
      maxRetries = 3
    } = config;

    const parsedConfig = jsonc.parse(content);

    // Check if queue already exists
    if (parsedConfig.queues?.producers?.some((p: any) => p.queue === queueName)) {
      logger.warn(`Queue "${queueName}" already exists in config`);
      return true;
    }

    let updatedContent = content;

    // 1. Add HTML module rule if not present
    const rules = parsedConfig.rules || [];
    const hasHtmlRule = rules.some((r: any) =>
      r.type === 'Text' && r.globs?.includes('**/*.html')
    );

    if (!hasHtmlRule) {
      const htmlRule = {
        type: 'Text',
        globs: ['**/*.html'],
        fallthrough: true
      };
      const edits = jsonc.modify(updatedContent, ['rules'], [...rules, htmlRule], {});
      updatedContent = jsonc.applyEdits(updatedContent, edits);
    }

    // 2. Add queue producer
    const producers = parsedConfig.queues?.producers || [];
    const newProducer = {
      queue: queueName,
      binding: bindingName
    };
    let edits = jsonc.modify(
      updatedContent,
      ['queues', 'producers'],
      [...producers, newProducer],
      {}
    );
    updatedContent = jsonc.applyEdits(updatedContent, edits);

    // 3. Add queue consumer
    const consumers = parsedConfig.queues?.consumers || [];
    const newConsumer = {
      queue: queueName,
      max_batch_size: maxBatchSize,
      max_batch_timeout: maxBatchTimeout,
      max_retries: maxRetries
    };
    edits = jsonc.modify(
      updatedContent,
      ['queues', 'consumers'],
      [...consumers, newConsumer],
      {}
    );
    updatedContent = jsonc.applyEdits(updatedContent, edits);

    // 4. Add Durable Object binding if not present
    const doBindings = parsedConfig.durable_objects?.bindings || [];
    const hasEventStore = doBindings.some((b: any) => b.name === 'EVENT_STORE');

    if (!hasEventStore) {
      const newBinding = {
        name: 'EVENT_STORE',
        class_name: 'EventStore'
      };
      edits = jsonc.modify(
        updatedContent,
        ['durable_objects', 'bindings'],
        [...doBindings, newBinding],
        {}
      );
      updatedContent = jsonc.applyEdits(updatedContent, edits);
    }

    // 5. Add migration if not present
    const migrations = parsedConfig.migrations || [];
    const hasMigration = migrations.some((m: any) =>
      m.new_classes?.includes('EventStore')
    );

    if (!hasMigration) {
      const newMigration = {
        tag: 'v1',
        new_classes: ['EventStore']
      };
      edits = jsonc.modify(
        updatedContent,
        ['migrations'],
        [...migrations, newMigration],
        {}
      );
      updatedContent = jsonc.applyEdits(updatedContent, edits);
    }

    await fs.writeFile(configPath, updatedContent, 'utf-8');
    logger.success('Updated wrangler config with queue configuration');
    return true;
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Failed to patch JSON config: ${error.message}`);
    }
    return false;
  }
}
