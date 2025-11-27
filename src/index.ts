#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { logger } from './lib/logger.js';
import { init } from './commands/init.js';
import { initQueues } from './commands/queues.js';

async function main() {
  try {
    const { positionals, values } = parseArgs({
      options: {
        add: {
          type: 'boolean',
          short: 'a',
          default: false,
        },
        new: {
          type: 'boolean',
          short: 'n',
          default: false,
        },
        help: {
          type: 'boolean',
          short: 'h',
          default: false,
        },
        version: {
          type: 'boolean',
          short: 'v',
          default: false,
        },
      },
      allowPositionals: true,
    });

    if (values.help) {
      printHelp();
      process.exit(0);
    }

    if (values.version) {
      console.log('clementine-cli v0.1.0');
      process.exit(0);
    }

    const command = positionals[0];

    logger.intro('🍊 Clementine');

    // Route based on command
    if (!command) {
      // Default: interactive mode with feature selection
      await init(values);
    } else if (command === 'queues') {
      // Legacy: direct queues command for backwards compatibility
      await initQueues(values);
    } else {
      logger.error(`Unknown command: ${command}`);
      logger.info('Run "clementine --help" for usage');
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof Error) {
      logger.error(error.message);
    } else {
      logger.error('An unexpected error occurred');
    }
    process.exit(1);
  }
}

function printHelp() {
  const help = `
🍊 Clementine - Instant Cloudflare Workers primitives

Usage:
  clementine [command] [options]
  clem [command] [options]

Commands:
  (none)          Interactive mode - choose what to create/add
  queues          Add Workers Queues to your project

Options:
  -a, --add       Force add to existing project
  -n, --new       Force create new project
  -h, --help      Show this help message
  -v, --version   Show version

Examples:
  clementine              # Interactive mode - choose Worker or Queues
  clementine queues       # Add Queues directly
  clementine --new        # Force create new project (shows options)
  clementine --add        # Force add to existing project (shows options)

  clem                    # Short alias works too!
  `;

  process.stdout.write(help);
}

main();
