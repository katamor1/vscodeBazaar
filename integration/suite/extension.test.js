const assert = require('node:assert/strict');
const path = require('node:path');
const vscode = require('vscode');
const packageJson = require('../../package.json');

const noBazaarTests = {
  'activates in a non-Bazaar workspace': async () => {
    const extension = vscode.extensions.getExtension('local.vscode-bazaar');
    assert.ok(extension, 'extension should be discoverable by publisher/name');

    await extension.activate();

    assert.equal(extension.isActive, true);
  },

  'exposes every contributed command to VS Code': async () => {
    const commands = new Set(await vscode.commands.getCommands(true));
    const contributed = packageJson.contributes.commands.map((entry) => entry.command);

    for (const command of contributed) {
      assert.ok(commands.has(command), `${command} should be registered`);
    }
  },

  'contributed commands do not throw without a Bazaar tree': async () => {
    const extension = vscode.extensions.getExtension('local.vscode-bazaar');
    await extension.activate();

    const contributed = packageJson.contributes.commands.map((entry) => entry.command);
    for (const command of contributed) {
      await assert.doesNotReject(
        () => vscode.commands.executeCommand(command, ...dummyArgsForCommand(command)),
        `${command} should not reject in a non-Bazaar workspace`
      );
    }
  }
};

const bazaarTests = {
  'activates in a Bazaar workspace': async () => {
    const extension = vscode.extensions.getExtension('local.vscode-bazaar');
    assert.ok(extension, 'extension should be discoverable by publisher/name');

    await extension.activate();

    assert.equal(extension.isActive, true);
  },

  'refreshes Bazaar-backed views and source-control commands': async () => {
    const extension = vscode.extensions.getExtension('local.vscode-bazaar');
    await extension.activate();

    const workspacePath = process.env.BAZAAR_TEST_WORKSPACE;
    assert.ok(workspacePath, 'BAZAAR_TEST_WORKSPACE should be set');
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(workspacePath, 'README.txt')));
    await vscode.window.showTextDocument(document);

    for (const command of [
      'bazaar.refresh',
      'bazaar.history.refresh',
      'bazaar.history.showFileHistory',
      'bazaar.branch.refresh',
      'bazaar.tag.refresh',
      'bazaar.shelve.refresh',
      'bazaar.graph.refresh',
      'bazaar.explore.refresh',
      'bazaar.includeAll',
      'bazaar.openResourceDiff'
    ]) {
      const args = command === 'bazaar.history.showFileHistory'
        ? [document.uri]
        : [];
      await assert.doesNotReject(
        () => vscode.commands.executeCommand(command, ...args),
        `${command} should not reject in a Bazaar workspace`
      );
    }
  }
};

module.exports = process.env.BAZAAR_INTEGRATION_MODE === 'bazaar'
  ? bazaarTests
  : noBazaarTests;

function dummyArgsForCommand(command) {
  if (command === 'bazaar.history.showFileHistory') {
    return [vscode.Uri.file(__filename)];
  }

  if ([
    'bazaar.history.showCommit',
    'bazaar.history.showCommitDiff',
    'bazaar.history.copyRevisionId',
    'bazaar.history.openFileAtRevision'
  ].includes(command)) {
    return [dummyRevision(), 'dummy.txt'];
  }

  if ([
    'bazaar.branch.switch',
    'bazaar.branch.switchForce',
    'bazaar.branch.remove',
    'bazaar.branch.removeForce'
  ].includes(command)) {
    return [dummyBranch()];
  }

  if ([
    'bazaar.tag.delete',
    'bazaar.tag.forceMove'
  ].includes(command)) {
    return [dummyTag()];
  }

  if ([
    'bazaar.shelve.preview',
    'bazaar.shelve.apply',
    'bazaar.shelve.keep',
    'bazaar.shelve.delete'
  ].includes(command)) {
    return [dummyShelf()];
  }

  if ([
    'bazaar.include',
    'bazaar.uninclude',
    'bazaar.revert',
    'bazaar.merge.forgetPending',
    'bazaar.resolve',
    'bazaar.conflict.openMerge',
    'bazaar.conflict.takeThis',
    'bazaar.conflict.takeOther',
    'bazaar.conflict.takeBothThisFirst',
    'bazaar.conflict.takeBothThisLast',
    'bazaar.shelve.create',
    'bazaar.openResourceDiff'
  ].includes(command)) {
    return [dummyResource()];
  }

  return [];
}

function dummyRevision() {
  return {
    revno: '1',
    revisionId: 'dummy-revision-id',
    parentIds: [],
    tags: [],
    committer: 'Integration Test',
    branchNick: 'dummy',
    timestamp: '2026-01-01T00:00:00Z',
    message: 'Dummy revision',
    depth: 0,
    changedPaths: ['dummy.txt']
  };
}

function dummyBranch() {
  return {
    name: 'dummy',
    path: 'dummy',
    current: false
  };
}

function dummyTag() {
  return {
    name: 'dummy',
    revision: '1'
  };
}

function dummyShelf() {
  return {
    id: '1',
    message: 'Dummy shelf'
  };
}

function dummyResource() {
  return {
    resourceUri: vscode.Uri.file(__filename)
  };
}
