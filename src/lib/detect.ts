import fs from 'fs-extra';
import path from 'node:path';

export interface ProjectContext {
  isWorkerProject: boolean;
  wranglerConfigPath: string | null;
  wranglerConfigType: 'toml' | 'jsonc' | null;
  entryFilePath: string | null;
  srcDir: string | null;
  hasPackageJson: boolean;
}

export async function detectProjectContext(cwd: string = process.cwd()): Promise<ProjectContext> {
  const context: ProjectContext = {
    isWorkerProject: false,
    wranglerConfigPath: null,
    wranglerConfigType: null,
    entryFilePath: null,
    srcDir: null,
    hasPackageJson: false,
  };

  // Check for package.json
  const packageJsonPath = path.join(cwd, 'package.json');
  context.hasPackageJson = await fs.pathExists(packageJsonPath);

  // Check for wrangler config files
  const wranglerJsonc = path.join(cwd, 'wrangler.jsonc');
  const wranglerJson = path.join(cwd, 'wrangler.json');
  const wranglerToml = path.join(cwd, 'wrangler.toml');

  if (await fs.pathExists(wranglerJsonc)) {
    context.isWorkerProject = true;
    context.wranglerConfigPath = wranglerJsonc;
    context.wranglerConfigType = 'jsonc';
  } else if (await fs.pathExists(wranglerJson)) {
    context.isWorkerProject = true;
    context.wranglerConfigPath = wranglerJson;
    context.wranglerConfigType = 'jsonc';
  } else if (await fs.pathExists(wranglerToml)) {
    context.isWorkerProject = true;
    context.wranglerConfigPath = wranglerToml;
    context.wranglerConfigType = 'toml';
  }

  // If it's a Worker project, try to find entry file
  if (context.isWorkerProject && context.wranglerConfigPath) {
    const entryFile = await detectEntryFile(cwd, context.wranglerConfigPath);
    if (entryFile) {
      context.entryFilePath = entryFile;
      context.srcDir = path.dirname(entryFile);
    }
  }

  return context;
}

async function detectEntryFile(cwd: string, wranglerConfigPath: string): Promise<string | null> {
  // Common entry file locations
  const possiblePaths = [
    path.join(cwd, 'src', 'index.ts'),
    path.join(cwd, 'src', 'index.js'),
    path.join(cwd, 'src', 'worker.ts'),
    path.join(cwd, 'src', 'worker.js'),
    path.join(cwd, 'index.ts'),
    path.join(cwd, 'index.js'),
    path.join(cwd, 'worker.ts'),
    path.join(cwd, 'worker.js'),
  ];

  for (const filePath of possiblePaths) {
    if (await fs.pathExists(filePath)) {
      return filePath;
    }
  }

  // TODO: Parse wrangler config to get main field
  // For now, return null if standard paths don't exist
  return null;
}
