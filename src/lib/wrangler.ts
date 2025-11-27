import { execa } from 'execa';
import { logger } from './logger.js';

export interface KVNamespace {
  id: string;
  title: string;
}

export interface CreateNamespaceOptions {
  bindingName: string;
  updateConfig?: boolean;
  env?: string;
}

export async function createKVNamespace(
  options: CreateNamespaceOptions
): Promise<string | null> {
  try {
    const { bindingName, updateConfig = false, env } = options;

    logger.step(`Creating KV namespace: ${bindingName}...`);

    const args = ['wrangler', 'kv', 'namespace', 'create', bindingName];

    // Add --update-config flag to have Wrangler automatically update the config
    if (updateConfig) {
      args.push('--update-config');
    }

    // Add environment if specified
    if (env) {
      args.push('--env', env);
    }

    const { stdout } = await execa('npx', args);

    // Parse the namespace ID from wrangler output
    // Example output: "🌀 Creating namespace with title \"worker-APP_CONFIG\""
    // "✨ Success! Add the following to your wrangler.toml under [env.production]:"
    // "kv_namespaces = [ { binding = \"APP_CONFIG\", id = \"abc123def456\" } ]"

    const idMatch = stdout.match(/id\s*=\s*"([^"]+)"/);
    if (idMatch && idMatch[1]) {
      logger.success(`Created KV namespace with ID: ${idMatch[1]}`);
      if (updateConfig) {
        logger.success('Updated wrangler config automatically');
      }
      return idMatch[1];
    }

    // Alternative parsing for different wrangler versions
    const lines = stdout.split('\n');
    for (const line of lines) {
      if (line.includes('id')) {
        const match = line.match(/[a-f0-9]{32}/);
        if (match) {
          logger.success(`Created KV namespace with ID: ${match[0]}`);
          if (updateConfig) {
            logger.success('Updated wrangler config automatically');
          }
          return match[0];
        }
      }
    }

    logger.warn('Could not parse namespace ID from wrangler output');
    logger.info('Wrangler output:');
    console.log(stdout);
    return null;
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Failed to create KV namespace: ${error.message}`);
    }
    return null;
  }
}

export async function checkWranglerInstalled(): Promise<boolean> {
  try {
    await execa('npx', ['wrangler', '--version']);
    return true;
  } catch {
    return false;
  }
}
