import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { ALWAYS_AVAILABLE_COMMANDS, UNAVAILABLE_COMMANDS } from '../src/extensionCommands';

interface PackageJson {
  activationEvents?: string[];
  contributes?: {
    commands?: Array<{ command: string; icon?: string }>;
    keybindings?: Array<{ command: string; key?: string; mac?: string; when?: string }>;
    menus?: Record<string, Array<{ command: string; group?: string; when?: string }>>;
  };
}

function contributedCommands(parsed = packageJson()): string[] {
  return parsed.contributes?.commands?.map((entry) => entry.command).sort() ?? [];
}

function packageJson(): PackageJson {
  const packagePath = path.join(process.cwd(), 'package.json');
  return JSON.parse(fs.readFileSync(packagePath, 'utf8')) as PackageJson;
}

function menuCommands(parsed = packageJson()): string[] {
  return Object.values(parsed.contributes?.menus ?? {})
    .flat()
    .map((entry) => entry.command);
}

function keybindingCommands(parsed = packageJson()): string[] {
  return parsed.contributes?.keybindings?.map((entry) => entry.command) ?? [];
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicated.add(value);
    }
    seen.add(value);
  }
  return [...duplicated].sort();
}

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function isRegisterCommandCall(node: ts.CallExpression): boolean {
  const expression = node.expression;
  if (ts.isIdentifier(expression)) {
    return expression.text === 'registerCommand';
  }
  return ts.isPropertyAccessExpression(expression) && expression.name.text === 'registerCommand';
}

let registeredCommandCache: Set<string> | undefined;

function registeredCommandLiterals(): Set<string> {
  if (!registeredCommandCache) {
    registeredCommandCache = collectRegisteredCommandLiterals();
  }
  return registeredCommandCache;
}

function collectRegisteredCommandLiterals(): Set<string> {
  const registered = new Set<string>();
  for (const file of sourceFiles(path.join(process.cwd(), 'src'))) {
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('registerCommand')) {
      continue;
    }
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && isRegisterCommandCall(node)) {
        const command = node.arguments[0];
        if (command && ts.isStringLiteral(command)) {
          registered.add(command.text);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return registered;
}

describe('extension command registration', () => {
  it('covers every contributed command in the unavailable fallback', () => {
    const contributed = contributedCommands();
    const fallbackCommands = [...ALWAYS_AVAILABLE_COMMANDS, ...UNAVAILABLE_COMMANDS].sort();
    expect(fallbackCommands).toEqual(contributed);
  });

  it('keeps every menu command contributed', () => {
    const parsed = packageJson();
    const contributed = new Set(contributedCommands(parsed));
    const missing = menuCommands(parsed).filter((command) => !contributed.has(command));
    expect(missing).toEqual([]);
  });

  it('keeps every keybinding command contributed', () => {
    const parsed = packageJson();
    const contributed = new Set(contributedCommands(parsed));
    const missing = keybindingCommands(parsed).filter((command) => !contributed.has(command));
    expect(missing).toEqual([]);
  });

  it('does not duplicate command ids in contributed commands or fallback arrays', () => {
    const parsed = packageJson();
    expect(duplicates(contributedCommands(parsed))).toEqual([]);
    expect(duplicates([...ALWAYS_AVAILABLE_COMMANDS, ...UNAVAILABLE_COMMANDS])).toEqual([]);
  });

  it('keeps every onCommand activation event contributed', () => {
    const parsed = packageJson();
    const contributed = new Set(contributedCommands(parsed));
    const missing = (parsed.activationEvents ?? [])
      .filter((event) => event.startsWith('onCommand:'))
      .map((event) => event.slice('onCommand:'.length))
      .filter((command) => !contributed.has(command));
    expect(missing).toEqual([]);
  });

  it('keeps the default keybindings scoped to the blame commands', () => {
    expect(keybindingCommands().sort()).toEqual([
      'bazaar.blame.openLineChangesWithPreviousRevision',
      'bazaar.blame.quickShowLineCommit',
      'bazaar.blame.toggle'
    ]);
  });

  // AST scan intentionally covers src/**/*.ts instead of a file-specific regex.
  it('keeps every contributed command registered on the normal activation path', () => {
    const missing = contributedCommands().filter((command) => !registeredCommandLiterals().has(command));
    expect(missing).toEqual([]);
  }, 10_000);

  it('exposes toggle blame as an icon button in editor and SCM title bars', () => {
    const parsed = packageJson();
    const toggleCommand = parsed.contributes?.commands?.find((entry) => entry.command === 'bazaar.blame.toggle');
    const editorTitle = parsed.contributes?.menus?.['editor/title'] ?? [];
    const scmTitle = parsed.contributes?.menus?.['scm/title'] ?? [];

    expect(toggleCommand?.icon).toBe('$(eye)');
    expect(editorTitle).toContainEqual(expect.objectContaining({
      command: 'bazaar.blame.toggle',
      group: expect.stringMatching(/^navigation/)
    }));
    expect(scmTitle).toContainEqual(expect.objectContaining({
      command: 'bazaar.blame.toggle',
      group: expect.stringMatching(/^navigation/)
    }));
  });
});
