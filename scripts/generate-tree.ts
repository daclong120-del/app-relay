import * as fs from 'fs';
import * as path from 'path';

export interface TreeOptions {
  maxDepth?: number;
  exclude?: string;
  outputFile?: string | null;
}

// Default directories and files to ignore
const DEFAULT_IGNORES: Set<string> = new Set([
  '.git',
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'build',
  'coverage',
  '.gitnexus',
  '.gemini',
  '.idea',
  '.vscode',
  '.DS_Store',
  'Thumbs.db'
]);

/**
 * Parse .gitignore if available to append extra ignore rules
 */
function getGitIgnoreRules(rootDir: string): Set<string> {
  const gitignorePath = path.join(rootDir, '.gitignore');
  const rules = new Set<string>(DEFAULT_IGNORES);

  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (let line of lines) {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          const cleaned = line.replace(/^\//, '').replace(/\/$/, '');
          if (cleaned && !cleaned.includes('*')) {
            rules.add(cleaned);
          }
        }
      }
    } catch {
      // Ignore reading error
    }
  }
  return rules;
}

/**
 * Build directory tree recursively
 */
function buildTree(
  dirPath: string,
  rootDir: string,
  ignoreSet: Set<string>,
  options: TreeOptions = {},
  depth: number = 0,
  prefix: string = ''
): string[] {
  const { maxDepth = Infinity } = options;
  if (depth > maxDepth) return [];

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  // Filter out ignored entries
  entries = entries.filter((entry) => !ignoreSet.has(entry.name));

  // Sort: directories first, then files alphabetically
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  const lines: string[] = [];
  const total = entries.length;

  entries.forEach((entry, index) => {
    const isLast = index === total - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    const displayName = entry.isDirectory() ? `${entry.name}/` : entry.name;
    lines.push(`${prefix}${connector}${displayName}`);

    if (entry.isDirectory()) {
      const fullChildPath = path.join(dirPath, entry.name);
      const childLines = buildTree(
        fullChildPath,
        rootDir,
        ignoreSet,
        options,
        depth + 1,
        prefix + childPrefix
      );
      lines.push(...childLines);
    }
  });

  return lines;
}

/**
 * Generate project directory tree as Markdown
 */
export function generateDirectoryTree(
  targetDir: string = '.',
  outputFile: string | null = 'STRUCTURE.md',
  options: TreeOptions = {}
): string {
  const absoluteRootDir = path.resolve(targetDir);
  const rootName = path.basename(absoluteRootDir) + '/';

  const ignoreSet = getGitIgnoreRules(absoluteRootDir);

  if (options.exclude) {
    options.exclude.split(',').forEach((item) => ignoreSet.add(item.trim()));
  }

  const treeLines = buildTree(absoluteRootDir, absoluteRootDir, ignoreSet, options);
  const fullTree = [rootName, ...treeLines].join('\n');

  const markdownOutput = `# Project Directory Structure\n\n\`\`\`\n${fullTree}\n\`\`\`\n`;

  if (outputFile) {
    const absoluteOutputPath = path.resolve(outputFile);
    fs.writeFileSync(absoluteOutputPath, markdownOutput, 'utf8');
    console.log(`✅ Directory tree successfully generated at: ${absoluteOutputPath}`);
  } else {
    console.log(markdownOutput);
  }

  return markdownOutput;
}

// CLI Execution
const isMainModule = typeof require !== 'undefined' && require.main === module;
const isTsxExecution = Boolean(process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/generate-tree.ts'));

if (isMainModule || isTsxExecution) {
  const args = process.argv.slice(2);
  let targetDir = '.';
  let outputFile: string | null = 'STRUCTURE.md';
  const options: TreeOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-o' || arg === '--output') {
      outputFile = args[++i] ?? 'STRUCTURE.md';
    } else if (arg === '--stdout') {
      outputFile = null;
    } else if (arg === '-d' || arg === '--dir' || arg === '--path') {
      targetDir = args[++i] ?? '.';
    } else if (arg === '--max-depth') {
      const nextArg = args[++i];
      if (nextArg) options.maxDepth = parseInt(nextArg, 10);
    } else if (arg === '--exclude') {
      const nextArg = args[++i];
      if (nextArg) options.exclude = nextArg;
    } else if (!arg.startsWith('-')) {
      targetDir = arg;
    }
  }

  generateDirectoryTree(targetDir, outputFile, options);
}
