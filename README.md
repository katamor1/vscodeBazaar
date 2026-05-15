# Bazaar SCM for VS Code

Local VS Code extension that brings a Git-like Source Control view to Bazaar working trees.

## Features

- Shows Bazaar changes in VS Code's Source Control view.
- Splits files into `Included`, `Changes`, `Untracked`, and `Conflicts`.
- Provides a pseudo-staging UX: include files first, then commit only those files.
- Expands unknown directories into file entries so generated folder trees can be reviewed and included file-by-file.
- Opens Bazaar basis diffs through VS Code's diff editor when possible.
- Runs local Bazaar operations: refresh, add unknown files before commit, revert, commit, pull, push, resolve, and auto-resolve.
- Adds Bazaar History, Branches, Tags, Shelves, and Graph views under Source Control.
- Supports repository history, file history, history search, revision document diffs in the VS Code diff editor, and editor blame annotations with hover details.
- Supports shelve/unshelve preview/apply/keep/delete workflows.
- Adds conflict helpers for merge-editor opening, take-this, take-other, and resolve-all.
- Adds preview-first dangerous operations for clean-tree, uncommit, and break-lock.
- Supports branch create/switch/remove and tag create/delete/force move commands with confirmation for destructive operations.
- Writes command failures and fallback diff text to the `Bazaar` output channel.

## Requirements

Install Bazaar CLI and make it available as `bzr`, or set `bazaar.cliPath` to the executable path.

This extension targets a single Bazaar root in the opened workspace. Shared repositories are supported for branch listing and operations when Bazaar can discover them from the current tree.

## Views

- `Bazaar History`: recent revisions, file history, search, commit details, changed paths, file-at-revision opening, and commit file diffs.
- `Bazaar Branches`: current branch plus discovered shared-repository branches.
- `Bazaar Tags`: tag list and tag operations.
- `Bazaar Shelves`: shelved changes with preview, apply, keep, and delete actions.
- `Bazaar Graph`: Webview graph for the loaded revision history.

## Settings

- `bazaar.cliPath`: path to `bzr`.
- `bazaar.history.limit`: maximum revisions loaded for history/graph.
- `bazaar.history.includeMerged`: include merged revisions in history/graph.
- `bazaar.unknown.expandDirectories`: expand unknown directories into file entries in SCM.
- `bazaar.autoRefresh.enabled`: refresh Bazaar status after workspace file changes.
- `bazaar.autoRefresh.debounceMs`: debounce time for automatic refresh.
- `bazaar.blame.enabledFormat`: line-end blame decoration format.
- `bazaar.history.diffMode`: use VS Code diff editor or OutputChannel for history diffs.
- `bazaar.dangerousOperations.requireTypedConfirmation`: require exact typed confirmation for destructive operations.

## Local Install

Build and package:

```powershell
npm install
npm test
npm run compile
npm run package
```

Install the generated `.vsix` from VS Code with `Extensions: Install from VSIX...`.

## Notes

Bazaar does not have Git's staged index. The `Included` group is maintained by the extension and used to pass an explicit file list to `bzr commit`.

`clean-tree`, `uncommit`, `break-lock`, resolve-all, all-revert, and shelf deletion are intentionally gated by modal and typed confirmation when `bazaar.dangerousOperations.requireTypedConfirmation` is enabled.
