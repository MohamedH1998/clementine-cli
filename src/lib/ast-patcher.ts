import { Project, SyntaxKind, SourceFile } from 'ts-morph';
import fs from 'fs-extra';
import { logger } from './logger.js';

export interface PatchOptions {
  bindingName: string;
  includeDemo: boolean;
}

export async function patchEntryFile(
  filePath: string,
  options: PatchOptions
): Promise<boolean> {
  try {
    const project = new Project();
    const sourceFile = project.addSourceFileAtPath(filePath);

    // Check if KV binding already exists in Env interface
    if (hasKVBinding(sourceFile, options.bindingName)) {
      logger.warn(`Binding "${options.bindingName}" already exists in Env interface`);
      return true;
    }

    // Patch the file
    const success = patchSourceFile(sourceFile, options);

    if (success) {
      await sourceFile.save();
      logger.success(`Patched entry file: ${filePath}`);
      return true;
    }

    return false;
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Failed to patch entry file: ${error.message}`);
      logger.info('You may need to manually add the KV binding to your worker');
      printManualInstructions(options);
    }
    return false;
  }
}

function hasKVBinding(sourceFile: SourceFile, bindingName: string): boolean {
  const envInterfaces = sourceFile.getInterfaces().filter((i) => i.getName() === 'Env');

  for (const envInterface of envInterfaces) {
    const properties = envInterface.getProperties();
    if (properties.some((p) => p.getName() === bindingName)) {
      return true;
    }
  }

  return false;
}

function patchSourceFile(sourceFile: SourceFile, options: PatchOptions): boolean {
  // Find or create Env interface
  let envInterface = sourceFile.getInterface('Env');

  if (!envInterface) {
    // Create new Env interface
    envInterface = sourceFile.addInterface({
      name: 'Env',
      isExported: true,
      properties: [
        {
          name: options.bindingName,
          type: 'KVNamespace',
        },
      ],
    });
  } else {
    // Add property to existing interface
    envInterface.addProperty({
      name: options.bindingName,
      type: 'KVNamespace',
    });
  }

  // If demo is requested, try to add /kv route
  if (options.includeDemo) {
    addDemoRoute(sourceFile, options.bindingName);
  }

  return true;
}

function addDemoRoute(sourceFile: SourceFile, bindingName: string): void {
  // Find the default export
  const defaultExport = sourceFile.getDefaultExportSymbol();

  if (!defaultExport) {
    logger.warn('Could not find default export. Skipping demo route injection.');
    return;
  }

  // This is a simplified approach - in production you'd want more robust AST manipulation
  // For now, we'll just add a comment suggesting the user adds the route manually
  logger.info('Note: Demo route code needs to be added manually to the fetch handler');
}

function printManualInstructions(options: PatchOptions): void {
  console.log('\nAdd the following to your Env interface:\n');
  console.log(`  ${options.bindingName}: KVNamespace;\n`);

  if (options.includeDemo) {
    console.log('And add this route to your fetch handler:\n');
    console.log(`
    if (url.pathname === "/kv") {
      if (request.method === "GET") {
        const key = url.searchParams.get("key");
        if (!key) return new Response("Missing ?key", { status: 400 });

        const value = await env.${options.bindingName}.get(key);
        if (value === null) return new Response("Not found", { status: 404 });

        return new Response(JSON.stringify({ key, value }), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    `);
  }
}

export async function createNewEntryFile(
  filePath: string,
  content: string
): Promise<boolean> {
  try {
    await fs.ensureDir(filePath.substring(0, filePath.lastIndexOf('/')));
    await fs.writeFile(filePath, content, 'utf-8');
    logger.success(`Created entry file: ${filePath}`);
    return true;
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Failed to create entry file: ${error.message}`);
    }
    return false;
  }
}
