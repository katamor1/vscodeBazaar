const assert = require('node:assert/strict');
const vscode = require('vscode');
const packageJson = require('../../package.json');

module.exports = {
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
