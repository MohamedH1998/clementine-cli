import path from 'node:path';
import fs from 'fs-extra';
import prompts from 'prompts';
import { execa } from 'execa';
import { ProjectContext } from '../detect.js';
import { Primitive, PrimitiveConfig } from '../../primitives/base.js';
import { logger } from '../logger.js';

/**
 * Generic flow for adding a primitive to an existing Worker project
 * Works with Queues, KV, D1, etc.
 */
export async function runGenericExistingFlow(
  primitive: Primitive,
  config: PrimitiveConfig,
  context: ProjectContext
): Promise<void> {
  // Find wrangler config
  const configPath = context.wranglerConfigPath;
  if (!configPath) {
    logger.error('Could not find wrangler.toml or wrangler.json in the project');
    process.exit(1);
  }

  // Step 1: Patch config (if primitive needs it)
  if (primitive.patchConfig) {
    logger.step(`Adding ${primitive.name} configuration...`);

    const configPatched = await primitive.patchConfig(configPath, config);

    if (!configPatched) {
      logger.error('Failed to patch wrangler config');
      process.exit(1);
    }
  }

  // Step 2: Generate files
  logger.step(`Creating ${primitive.name} files...`);

  const projectRoot = process.cwd();
  const srcDir = path.join(projectRoot, 'src');

  // Ensure src directory exists
  await fs.ensureDir(srcDir);

  // Generate primitive-specific files
  await primitive.generateFiles(projectRoot, config);

  // Step 3: Success message
  console.log('\n' + '='.repeat(80));
  logger.success(`${primitive.name} configuration added!`);
  console.log('='.repeat(80));

  // Show integration instructions if needed
  if (primitive.id === 'queues') {
    console.log('\n📝 Manual steps required:\n');
    console.log('Your existing index.ts was not modified. You need to integrate the queue code:');
    console.log('\n1. Add to your Env interface:');
    console.log(`   ${(config as any).bindingName}: Queue;`);
    console.log('   EVENT_STORE: DurableObjectNamespace;');
    console.log('\n2. Add these imports at the top of your index.ts:');
    console.log('   import { EventStore } from "./event-store";');
    console.log('   import dashboardHTML from "./dashboard.html";');
    console.log('\n3. Export the EventStore class:');
    console.log('   export { EventStore };');
    console.log('\n4. Add dashboard route to your fetch handler:');
    console.log('   if (request.method === "GET" && url.pathname === "/") {');
    console.log('     return new Response(dashboardHTML, {');
    console.log('       headers: { "Content-Type": "text/html" },');
    console.log('     });');
    console.log('   }');
    console.log('\n5. Add queue consumer handler to your worker:');
    console.log('   async queue(batch: MessageBatch, env: Env): Promise<void> {');
    console.log('     // See queue-handler.ts for full implementation');
    console.log('   }');
    console.log('\n📄 Reference: Check queue-handler.ts for the complete implementation');
  }

  // Step 4: Ask if they want to run primitive-specific setup
  if (primitive.preDeploySteps) {
    console.log('');
    const response = await prompts({
      type: 'confirm',
      name: 'createResource',
      message: `Create ${primitive.name} resources in Cloudflare now?`,
      initial: false,
    });

    if (response.createResource) {
      console.log('');
      await primitive.preDeploySteps(process.cwd(), config);
    } else {
      if (primitive.id === 'queues') {
        const queueConfig = config as any;
        console.log(`\n⚠️  Remember to create the queue before deploying: npx wrangler queues create ${queueConfig.queueName}`);
      }
    }
  }

  // Step 5: Show next steps
  console.log('\nNext steps:');
  console.log('  npm run dev');

  const deployInfo = primitive.getDeploymentInfo?.(config);
  if (deployInfo?.nextSteps) {
    deployInfo.nextSteps.forEach((step) => {
      console.log(`  ${step}`);
    });
  }

  console.log('\nWhen ready to deploy:');
  console.log('  npx wrangler deploy');
}
