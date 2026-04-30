import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const srcRoot = path.join(root, 'src');
const modulesRoot = path.join(srcRoot, 'modules');

function walk(dir) {
  const entries = readdirSync(dir);
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walk(full));
      continue;
    }
    if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry)) {
      files.push(full);
    }
  }

  return files;
}

function getImports(source) {
  const imports = [];
  const regex = /from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    imports.push(match[1] ?? match[2]);
  }
  return imports;
}

function moduleNameFor(file) {
  const relative = path.relative(modulesRoot, file);
  const [name] = relative.split(path.sep);
  return name || null;
}

function classify(file) {
  if (file.includes(`${path.sep}domain${path.sep}`)) return 'domain';
  if (file.includes(`${path.sep}application${path.sep}`)) return 'application';
  if (file.includes(`${path.sep}infrastructure${path.sep}`)) return 'infrastructure';
  if (file.includes(`${path.sep}presentation${path.sep}`)) return 'presentation';
  return 'other';
}

function resolveRelativeImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  return path.normalize(path.resolve(path.dirname(fromFile), specifier));
}

const errors = [];
const files = walk(srcRoot);

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const imports = getImports(source);
  const layer = classify(file);
  const ownerModule = moduleNameFor(file);

  for (const specifier of imports) {
    if (layer === 'domain' && specifier === 'vscode') {
      errors.push(`${path.relative(root, file)}: domain layer must not import vscode`);
    }

    const resolved = resolveRelativeImport(file, specifier);
    if (!resolved) {
      if (!specifier.startsWith('src/modules/')) {
        continue;
      }
    }

    const targetPath = resolved ?? path.join(root, specifier);
    const targetLayer = classify(targetPath);
    const targetModule = moduleNameFor(targetPath);

    if (layer === 'domain' && (targetLayer === 'presentation' || targetLayer === 'infrastructure')) {
      errors.push(`${path.relative(root, file)}: domain layer must not import ${targetLayer}`);
    }

    if (layer === 'application' && targetLayer === 'presentation') {
      errors.push(`${path.relative(root, file)}: application layer must not import presentation`);
    }

    if (
      ownerModule &&
      targetModule &&
      ownerModule !== targetModule &&
      targetPath.includes(`${path.sep}modules${path.sep}`) &&
      !/([/\\]modules[/\\][^/\\]+([/\\]index)?$)/.test(targetPath)
    ) {
      errors.push(
        `${path.relative(root, file)}: cross-module deep import is forbidden -> ${specifier}`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error('Architecture boundary violations found:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Architecture boundary check passed.');
