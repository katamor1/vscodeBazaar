# Bazaar SCM for VS Code

Local VS Code extension that brings a Git-like Source Control experience to Bazaar working trees.

## Features

- Source Control view for Bazaar changes, split into `Included`, `Changes`, `Untracked`, and `Conflicts`.
- Pseudo-staging workflow: include files first, then commit only those files through an explicit Bazaar file list.
- Unknown directory expansion, so generated folder trees can be reviewed and included file-by-file.
- VS Code diff editor integration for working-tree changes, history changes, and blame context-menu changes.
- History, Branches, Tags, Shelves, and Graph views under Source Control.
- File history, history search, commit details, changed paths, copy revision id, and file-at-revision opening.
- Cursor/selection-scoped blame annotations with hover details.
- GitLens-style blame context actions for line/file changes against previous revisions, working files, selected revisions, branches, and tags.
- Shelve/unshelve preview, apply, keep, and delete workflows.
- Conflict helpers for merge-editor opening plus one-click use-this, use-other, use-both-this-first, use-both-this-last, resolve selected, resolve all, and Bazaar pending-merge cleanup.
- Branch creation uses a simple folder name and creates the new branch outside the current workspace, usually as a sibling of the active tree. Switch Branch opens sibling working-tree branches in the same VS Code window instead of running `bzr switch` inside the current tree.
- Preview-first dangerous operations for clean-tree, uncommit, and break-lock.
- Defensive degraded mode: without a workspace or Bazaar tree, contributed commands show a short unavailable message instead of failing as command-not-found.

## Requirements

Install Bazaar CLI and make it available as `bzr`, or set `bazaar.cliPath` to the executable path.

This extension targets one Bazaar root in the opened workspace. Shared repositories are supported for branch listing and operations when Bazaar can discover them from the current tree.

## Commands

Main commands:

- `Bazaar: Refresh`
- `Bazaar: Commit Included Changes`
- `Bazaar: Pull`
- `Bazaar: Push`
- `Bazaar: Forget Pending Merge State`
- `Bazaar: Open Output`
- `Bazaar: Show File History`
- `Bazaar: Toggle Blame`
- `Bazaar: Quick Show Line Commit`
- `Bazaar: Open Line Changes with Previous Revision`
- `Bazaar: Open Line Changes with Working File`
- `Bazaar: Open Changes with Previous Revision`
- `Bazaar: Open Changes with Revision...`
- `Bazaar: Open Changes with Branch or Tag...`
- `Bazaar: Inspect Line Commit Details`

Most file, branch, tag, shelf, conflict, history, and graph actions are also available from their view title buttons or context menus.

## Keybindings

Default shortcuts are intentionally limited to the most common editor actions:

| Command | Windows/Linux | macOS |
| --- | --- | --- |
| Toggle Blame | `Ctrl+Alt+B` | `Cmd+Alt+B` |
| Quick Show Line Commit | `Ctrl+Alt+C` | `Cmd+Alt+C` |
| Open Line Changes with Previous Revision | `Ctrl+Alt+Shift+B` | `Cmd+Alt+Shift+B` |

All default keybindings require a file editor focus.

## Settings

- `bazaar.cliPath`: path to the Bazaar command-line executable.
- `bazaar.history.limit`: maximum revisions loaded for history and graph views.
- `bazaar.history.includeMerged`: include merged revisions in history and graph views.
- `bazaar.unknown.expandDirectories`: expand unknown directories into file entries in Source Control.
- `bazaar.autoRefresh.enabled`: refresh Bazaar status after workspace file changes.
- `bazaar.autoRefresh.debounceMs`: debounce time for automatic refresh.
- `bazaar.blame.enabledFormat`: line-end blame decoration format for the cursor line or selected range.
- `bazaar.dangerousOperations.requireTypedConfirmation`: require exact typed confirmation before destructive operations.

## Safety And Degraded Mode

- Revision inputs are validated before Bazaar commands run, so malformed history, graph, and blame actions fail with a short warning instead of passing invalid revisions to `bzr`.
- Historical file contents open as read-only virtual documents.
- Dangerous operations such as clean-tree, uncommit, break-lock, all-revert, resolve-all, and shelf deletion use confirmation prompts, with typed confirmation when enabled.
- Without an active Bazaar tree, or when Bazaar metadata is corrupt, commands degrade to unavailable messages, disabled actions, or output-channel diagnostics instead of attempting unsafe repairs.

## Local Install

Build and package:

```powershell
npm install
npm test
npm run compile
npm run package
```

Install the generated `.vsix` from VS Code with `Extensions: Install from VSIX...`.

## Known Limitations

- Bazaar itself is still the source of truth. If the local `.bzr` metadata is corrupt, this extension degrades safely but does not repair the Bazaar tree.
- The extension is scoped to one active Bazaar root per opened workspace.
- `Included` is extension-local state, not a Bazaar staging area.
- Branch discovery checks Bazaar metadata, the active checkout sibling folder, and branch roots created by this extension. `Create Branch` never creates a child folder inside the active workspace; `Switch Branch` moves the VS Code window to another working-tree branch when one is detected, and falls back to `bzr switch` for lightweight checkout targets.
- Line change commands open a file diff and reveal the blamed line area; they do not implement a separate line-only diff UI.
- Integration tests currently cover activation and command availability, not full UI click flows.

## Troubleshooting

- Open `Bazaar: Open Output` for command output and fallback diagnostics.
- If Bazaar is not on `PATH`, set `bazaar.cliPath`.
- If commands report that no Bazaar working tree is active, open a folder inside a Bazaar checkout or check that `bzr root` works in that folder.
- If `Bazaar Pull` reports that branches have diverged, Bazaar will not auto-merge like Git. The extension offers `Merge Parent`, `Show Missing`, and `Open Output`; choose `Merge Parent` to run `bzr merge`, then resolve conflicts if any and commit the merge.
- If you reverted merge file changes but Bazaar still thinks a merge is pending, run `Bazaar: Forget Pending Merge State`. It runs `bzr revert --forget-merges`, clearing the pending merge parents without changing file contents. Use `Bazaar: Revert All Changes and Merge State` when you want to abort both file changes and the pending merge state.
- If history or graph cannot load because Bazaar raises an internal recursion error, command actions should remain disabled or show short warnings instead of passing invalid revisions to `bzr`.
- If a diff opens blank for a historical file, check the output channel for the `bzr cat -r` error that was captured for that virtual document.

## Verification

Recommended release checks:

```powershell
npm run compile
npm test
npm run test:integration
npm audit --omit=dev
npm run package
```

For this local VSIX release line, `npm run package` should generate `vscode-bazaar-0.2.8.vsix`.

## Notes

Bazaar does not have Git's staged index. The `Included` group is maintained by the extension and used to pass an explicit file list to `bzr commit`.

`clean-tree`, `uncommit`, `break-lock`, resolve-all, all-revert, and shelf deletion are intentionally gated by modal and typed confirmation when `bazaar.dangerousOperations.requireTypedConfirmation` is enabled.
