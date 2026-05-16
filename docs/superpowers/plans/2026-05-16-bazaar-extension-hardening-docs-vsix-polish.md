# Bazaar Extension Hardening Docs VSIX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the next Bazaar SCM VSIX as a stability-focused release with command wiring guards, defensive input handling, stronger integration coverage, clearer extension-page documentation, and a small default shortcut set.

**Architecture:** Keep runtime behavior conservative: add guardrail tests and small validation helpers around existing command, URI, blame, branch, and diff boundaries instead of rewriting controllers. README and `package.json` remain the VSIX extension-page source of truth, while internal planning docs stay out of the packaged artifact.

**Tech Stack:** VS Code Extension API, TypeScript, Vitest, `@vscode/test-electron`, `@vscode/vsce`, Bazaar CLI.

---

## Current-State Notes

- `package.json` is currently `0.2.7` and already contributes commands, three default keybindings, view menus, and `test:integration`.
- `src/extensionCommands.ts` already separates always-available and unavailable fallback commands.
- `tests/extensionCommands.test.ts` already checks contributed command fallback coverage and normal activation registration.
- `src/scm/revisionDocumentQuery.ts` already rejects malformed JSON, absolute paths, parent-directory escapes, empty revision, `undefined`, `?`, and `-`.
- `README.md` already has Features, Commands, Keybindings, Settings, Known Limitations, Troubleshooting, and Verification sections.
- `.vscodeignore` excludes source, tests, integration fixtures, and lockfiles, but does not currently exclude generated `*.vsix` files or internal `docs/superpowers/**` plans.

## File Structure

- Modify `.vscodeignore`: exclude generated VSIX files and internal execution plans from packaged VSIX contents.
- Modify `package.json`: bump version for the next VSIX, refine user-facing command titles/descriptions only where wording is unclear, and keep default shortcuts limited.
- Modify `README.md`: polish extension-page copy and add concise security/degraded-mode notes without turning README into a specification.
- Modify `src/extensionCommands.ts`: only if tests expose contributed-command drift or missing unavailable fallback entries.
- Modify `tests/extensionCommands.test.ts`: expand command, menu, keybinding, activation-event, and duplicate-command guardrails.
- Create `tests/revisionDocumentProvider.test.ts`: prove invalid `bazaar-revision:` URIs and Bazaar read failures do not throw or call the CLI with bad inputs.
- Modify `tests/revisionDocumentQuery.test.ts`: add focused cases for encoded non-object query, array query, Windows backslash traversal, and whitespace-only revision.
- Modify `tests/blameDiff.test.ts`, `tests/blamePicker.test.ts`, and `tests/visibleEditor.test.ts`: add regression cases for invalid revision labels and diff reveal target selection.
- Modify `integration/suite/extension.test.js`: execute all contributed commands in a non-Bazaar workspace with safe dummy arguments where needed.
- Modify `integration/runTest.js`: keep isolated profile directories and add cleanup on success/failure.

---

### Task 1: Package Contents And Release Surface Audit

**Files:**
- Modify: `.vscodeignore`
- Modify: `package.json`
- Test: package output inspected by `npx vsce ls --no-dependencies`

- [ ] **Step 1: Inspect the current VSIX file list**

Run:

```powershell
npx vsce ls --no-dependencies
```

Expected: output should not contain old `vscode-bazaar-*.vsix`, `docs/superpowers/plans`, `src`, `tests`, `integration`, `.vscode-test`, or `node_modules`.

- [ ] **Step 2: Add missing package exclusions**

Edit `.vscodeignore` so it contains these lines in addition to the current exclusions:

```gitignore
*.vsix
docs/superpowers/**
```

- [ ] **Step 3: Re-run the VSIX file list audit**

Run:

```powershell
npx vsce ls --no-dependencies
```

Expected: generated VSIX files and internal planning docs are absent. The extension still includes `README.md`, `LICENSE.txt`, `package.json`, and compiled `out/**`.

- [ ] **Step 4: Decide release version**

If this pass changes runtime code or package metadata, set `package.json` version from `0.2.7` to `0.2.8` and later confirm `npm run package` generates `vscode-bazaar-0.2.8.vsix`.

Expected package snippet:

```json
{
  "version": "0.2.8"
}
```

---

### Task 2: Command Contribution And Registration Guardrails

**Files:**
- Modify: `tests/extensionCommands.test.ts`
- Modify: `src/extensionCommands.ts` only if tests expose drift

- [ ] **Step 1: Add tests for menu and keybinding command references**

Add helper functions to `tests/extensionCommands.test.ts`:

```ts
function menuCommands(parsed = packageJson()): string[] {
  const menus = parsed.contributes?.menus ?? {};
  return Object.values(menus).flat().map((entry) => entry.command).sort();
}

function keybindingCommands(parsed = packageJson()): string[] {
  const keybindings = parsed.contributes?.keybindings ?? [];
  return keybindings.map((entry: { command: string }) => entry.command).sort();
}
```

Add assertions:

```ts
it('keeps every menu command declared in contributes.commands', () => {
  const contributed = new Set(contributedCommands());
  const missing = menuCommands().filter((command) => !contributed.has(command));
  expect(missing).toEqual([]);
});

it('keeps every keybinding command declared in contributes.commands', () => {
  const contributed = new Set(contributedCommands());
  const missing = keybindingCommands().filter((command) => !contributed.has(command));
  expect(missing).toEqual([]);
});
```

- [ ] **Step 2: Add tests for duplicate command declarations**

Add this local helper and test:

```ts
function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      repeated.add(value);
    }
    seen.add(value);
  }
  return [...repeated].sort();
}

it('does not duplicate contributed or fallback command ids', () => {
  expect(duplicates(contributedCommands())).toEqual([]);
  expect(duplicates([...ALWAYS_AVAILABLE_COMMANDS, ...UNAVAILABLE_COMMANDS])).toEqual([]);
});
```

- [ ] **Step 3: Add tests for activation command references**

Extend the `PackageJson` interface in the test:

```ts
interface PackageJson {
  activationEvents?: string[];
  contributes?: {
    commands?: Array<{ command: string; icon?: string }>;
    keybindings?: Array<{ command: string }>;
    menus?: Record<string, Array<{ command: string; group?: string; when?: string }>>;
  };
}
```

Add this assertion:

```ts
it('keeps command activation events tied to contributed commands', () => {
  const contributed = new Set(contributedCommands());
  const activationCommands = (packageJson().activationEvents ?? [])
    .filter((event) => event.startsWith('onCommand:'))
    .map((event) => event.slice('onCommand:'.length));

  const missing = activationCommands.filter((command) => !contributed.has(command));
  expect(missing).toEqual([]);
});
```

- [ ] **Step 4: Run the command registry test**

Run:

```powershell
npm test -- tests/extensionCommands.test.ts
```

Expected: PASS if current wiring is coherent. If it fails, update `src/extensionCommands.ts` or `package.json` so contributed commands, menus, keybindings, activation events, normal registrations, and unavailable fallback all agree.

---

### Task 3: Bazaar Revision Virtual Document Hardening

**Files:**
- Create: `tests/revisionDocumentProvider.test.ts`
- Modify: `tests/revisionDocumentQuery.test.ts`
- Modify: `src/scm/revisionDocumentProvider.ts` only if provider tests expose an exception or unwanted client call

- [ ] **Step 1: Add provider tests for invalid URI behavior**

Create `tests/revisionDocumentProvider.test.ts`:

```ts
import * as vscode from 'vscode';
import { describe, expect, it, vi } from 'vitest';
import { BazaarRevisionDocumentProvider } from '../src/scm/revisionDocumentProvider';
import { encodeRevisionDocumentQuery } from '../src/scm/revisionDocumentQuery';

function output() {
  return {
    appendLine: vi.fn()
  } as unknown as vscode.OutputChannel;
}

describe('BazaarRevisionDocumentProvider', () => {
  it('returns empty content for malformed URI queries without calling Bazaar', async () => {
    const client = { catAtRevision: vi.fn() };
    const provider = new BazaarRevisionDocumentProvider(client as never, output());
    const uri = vscode.Uri.from({ scheme: BazaarRevisionDocumentProvider.scheme, path: '/README.md', query: '%7Bbad-json' });

    await expect(provider.provideTextDocumentContent(uri)).resolves.toBe('');
    expect(client.catAtRevision).not.toHaveBeenCalled();
  });

  it('returns empty content for empty revision queries without calling Bazaar', async () => {
    const client = { catAtRevision: vi.fn() };
    const provider = new BazaarRevisionDocumentProvider(client as never, output());
    const uri = vscode.Uri.from({
      scheme: BazaarRevisionDocumentProvider.scheme,
      path: '/README.md',
      query: encodeRevisionDocumentQuery({ path: 'README.md', revision: '' })
    });

    await expect(provider.provideTextDocumentContent(uri)).resolves.toBe('');
    expect(client.catAtRevision).not.toHaveBeenCalled();
  });

  it('captures Bazaar cat failures and returns empty content', async () => {
    const client = { catAtRevision: vi.fn().mockRejectedValue(new Error('cat failed')) };
    const provider = new BazaarRevisionDocumentProvider(client as never, output());
    const uri = vscode.Uri.from({
      scheme: BazaarRevisionDocumentProvider.scheme,
      path: '/README.md',
      query: encodeRevisionDocumentQuery({ path: 'README.md', revision: '7' })
    });

    await expect(provider.provideTextDocumentContent(uri)).resolves.toBe('');
    expect(client.catAtRevision).toHaveBeenCalledWith('7', 'README.md');
  });
});
```

- [ ] **Step 2: Add parser edge cases**

Extend `tests/revisionDocumentQuery.test.ts` with:

```ts
it('rejects decoded arrays and primitive query payloads', () => {
  expect(decodeRevisionDocumentQuery(encodeURIComponent(JSON.stringify([])))).toBeUndefined();
  expect(decodeRevisionDocumentQuery(encodeURIComponent(JSON.stringify('README.md')))).toBeUndefined();
});

it('rejects Windows backslash traversal and whitespace-only revisions', () => {
  expect(decodeRevisionDocumentQuery(encodeRevisionDocumentQuery({ path: 'docs\\..\\secret.txt', revision: '1' }))).toBeUndefined();
  expect(decodeRevisionDocumentQuery(encodeRevisionDocumentQuery({ path: 'README.md', revision: '   ' }))).toBeUndefined();
});
```

- [ ] **Step 3: Run revision document tests**

Run:

```powershell
npm test -- tests/revisionDocumentQuery.test.ts tests/revisionDocumentProvider.test.ts
```

Expected: PASS. If the provider throws, keep the existing output logging behavior but return `''` for invalid URI and read errors.

---

### Task 4: Blame, Diff, Picker, And Reveal Regression Review

**Files:**
- Modify: `tests/blameDiff.test.ts`
- Modify: `tests/blamePicker.test.ts`
- Modify: `tests/visibleEditor.test.ts`
- Modify: `src/views/blameDiff.ts`, `src/views/blamePicker.ts`, or `src/views/visibleEditor.ts` only if new tests expose a failing boundary

- [ ] **Step 1: Add invalid revision coverage to blame diff helpers**

Extend `tests/blameDiff.test.ts`:

```ts
it('rejects working-file diff targets when the blamed revision is invalid', () => {
  expect(createWorkingFileDiffTarget({ ...revision, revno: '', revisionId: '' }, 'undefined')).toBeUndefined();
});

it('rejects manual comparison placeholders before URI creation', () => {
  expect(createComparisonToWorkingFileTarget('null')).toBeUndefined();
  expect(createComparisonToWorkingFileTarget('?')).toBeUndefined();
  expect(createComparisonToWorkingFileTarget('-')).toBeUndefined();
});
```

- [ ] **Step 2: Add picker normalization coverage for branch and tag labels**

Extend `tests/blamePicker.test.ts`:

```ts
it('does not create tag revision specs for whitespace-only tag names', () => {
  expect(tagRevisionSpec({ name: '\t ', revision: '4' })).toBeUndefined();
});

it('does not create branch tip specs from placeholder revisions', () => {
  expect(branchTipRevisionSpec({ ...revision, revisionId: 'undefined', revno: '' })).toBeUndefined();
});
```

- [ ] **Step 3: Add reveal selection coverage for identical URI strings**

Extend `tests/visibleEditor.test.ts`:

```ts
it('matches diff virtual documents by full URI including query', () => {
  const left = uri('bazaar-revision:/README.md?left');
  const right = uri('bazaar-revision:/README.md?right');
  const rightEditor = { document: { uri: right }, id: 'right' };

  expect(findVisibleEditorByUri([
    { document: { uri: left }, id: 'left' },
    rightEditor
  ], right)).toBe(rightEditor);
});
```

- [ ] **Step 4: Run blame and reveal tests**

Run:

```powershell
npm test -- tests/blameDiff.test.ts tests/blamePicker.test.ts tests/visibleEditor.test.ts
```

Expected: PASS. If a placeholder revision can still create a diff target, tighten `manualRevisionSpec()` or `revisionSpecForDocument()` before URI creation.

---

### Task 5: Integration Tests For No-Bazaar Degraded Mode

**Files:**
- Modify: `integration/suite/extension.test.js`
- Modify: `integration/runTest.js`

- [ ] **Step 1: Execute all safe contributed commands in a non-Bazaar workspace**

Replace the representative command list in `integration/suite/extension.test.js` with a generated list and a small argument map:

```js
const safeArgs = {
  'bazaar.history.showCommitDiff': [undefined],
  'bazaar.history.showCommit': [undefined],
  'bazaar.history.copyRevisionId': [undefined],
  'bazaar.history.openFileAtRevision': [undefined],
  'bazaar.branch.switch': [undefined],
  'bazaar.branch.switchForce': [undefined],
  'bazaar.branch.remove': [undefined],
  'bazaar.branch.removeForce': [undefined],
  'bazaar.tag.delete': [undefined],
  'bazaar.tag.forceMove': [undefined],
  'bazaar.shelve.preview': [undefined],
  'bazaar.shelve.apply': [undefined],
  'bazaar.shelve.keep': [undefined],
  'bazaar.shelve.delete': [undefined]
};

for (const command of packageJson.contributes.commands.map((entry) => entry.command)) {
  await assert.doesNotReject(() => vscode.commands.executeCommand(command, ...(safeArgs[command] ?? [])), command);
}
```

Keep `bazaar.openOutput` in the generated command list; it should remain always available.

- [ ] **Step 2: Clean integration test profile folders after test runs**

In `integration/runTest.js`, wrap `runTests()` in `try/finally`:

```js
try {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    vscodeExecutablePath,
    launchArgs: [
      workspacePath,
      '--new-window',
      `--user-data-dir=${userDataDir}`,
      `--extensions-dir=${extensionsDir}`,
      '--disable-workspace-trust',
      '--skip-welcome'
    ]
  });
} finally {
  fs.rmSync(profileRoot, { recursive: true, force: true });
}
```

- [ ] **Step 3: Run integration tests**

Run:

```powershell
npm run test:integration
```

Expected: VS Code extension host launches, activates the extension in `integration/fixtures/no-bazaar`, reports every contributed command as registered, and all contributed commands execute without throwing.

---

### Task 6: README And VSIX Extension Page Polish

**Files:**
- Modify: `README.md`
- Modify: `package.json`

- [ ] **Step 1: Tighten package description**

Use a description that matches the implemented surface:

```json
"description": "Bazaar SCM integration with status, history, graph, blame, branch, tag, shelf, conflict, and diff tools for Visual Studio Code."
```

- [ ] **Step 2: Review command titles for clarity**

Keep command ids unchanged. Prefer titles that describe visible behavior:

```json
{
  "command": "bazaar.branch.switch",
  "title": "Bazaar: Switch Branch or Open Branch Worktree"
}
```

Do not rename destructive commands to softer wording; `Run Clean Tree`, `Run Uncommit`, and `Break Lock` should stay explicit.

- [ ] **Step 3: Keep default shortcuts limited to three**

Verify `contributes.keybindings` still contains only:

```json
[
  { "command": "bazaar.blame.toggle" },
  { "command": "bazaar.blame.quickShowLineCommit" },
  { "command": "bazaar.blame.openLineChangesWithPreviousRevision" }
]
```

If adding another default shortcut is considered, reject it in this release unless it replaces one of these three.

- [ ] **Step 4: Add a short Safety And Degraded Mode README section**

Add this section after Settings:

```markdown
## Safety And Degraded Mode

- Revision, blame, and diff commands validate Bazaar revision specs before invoking `bzr`.
- Historical files are opened through read-only virtual documents, so closing them should not prompt for saving.
- Dangerous operations such as clean-tree, uncommit, break-lock, resolve-all, all-revert, and shelf deletion use confirmation prompts.
- If Bazaar metadata is corrupt or a workspace is not a Bazaar tree, commands should show a short VS Code message and log details in the Bazaar output channel.
```

- [ ] **Step 5: Run documentation sanity checks**

Run:

```powershell
npm test -- tests/extensionCommands.test.ts
npm run compile
```

Expected: command title and package changes do not break JSON structure or command registration tests.

---

### Task 7: Final Review And Release Verification

**Files:**
- No planned source edits in this task
- Output artifact: `vscode-bazaar-0.2.8.vsix` if the version was bumped

- [ ] **Step 1: Review high-risk paths manually**

Inspect these files for unvalidated user input, accidental OutputChannel-only UI, and destructive commands without confirmation:

```powershell
Get-Content src/bazaar/client.ts
Get-Content src/scm/bazaarScmProvider.ts
Get-Content src/views/blameController.ts
Get-Content src/views/historyView.ts
Get-Content src/views/branchView.ts
Get-Content src/views/confirmation.ts
```

Expected: revision/path inputs pass through normalization helpers before CLI use; destructive operations call confirmation helpers; diff-style actions use VS Code editors or virtual documents instead of dumping primary content to the output channel.

- [ ] **Step 2: Run unit and integration checks**

Run:

```powershell
npm run compile
npm test
npm run test:integration
```

Expected: all commands exit with code 0.

- [ ] **Step 3: Run dependency audit**

Run:

```powershell
npm audit --omit=dev
```

Expected: `found 0 vulnerabilities`.

If full `npm audit` fails because of certificate verification, record the exact certificate error in the work log and do not claim full dependency audit coverage.

- [ ] **Step 4: Package the VSIX**

Run:

```powershell
npm run package
```

Expected if version was bumped: `vscode-bazaar-0.2.8.vsix` is generated. Expected if version stays unchanged: `vscode-bazaar-0.2.7.vsix` is regenerated.

- [ ] **Step 5: Confirm package contents after packaging**

Run:

```powershell
npx vsce ls --no-dependencies
```

Expected: no generated `.vsix`, `src`, `tests`, `integration`, `.vscode-test`, `node_modules`, or `docs/superpowers` entries are included.

---

## Self-Review

- Spec coverage: covers bug/security review, command registration, unavailable fallback, revision URI handling, blame/diff robustness, VS Code integration tests, README/extension-page copy, keybinding restraint, audit, and VSIX packaging.
- Placeholder scan: no banned placeholder phrases and no unspecified test target remains.
- Type consistency: the plan uses existing exported names from current source: `ALWAYS_AVAILABLE_COMMANDS`, `UNAVAILABLE_COMMANDS`, `BazaarRevisionDocumentProvider`, `encodeRevisionDocumentQuery`, `decodeRevisionDocumentQuery`, `createWorkingFileDiffTarget`, `createComparisonToWorkingFileTarget`, `tagRevisionSpec`, `branchTipRevisionSpec`, and `findVisibleEditorByUri`.
