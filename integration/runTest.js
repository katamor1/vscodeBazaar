const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { runTests } = require('@vscode/test-electron');

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, 'suite');
  const vscodeExecutablePath = findLocalVSCodeExecutable();
  const noBazaarWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-bazaar-no-bazaar-workspace-'));

  try {
    await runIntegrationSession({
      extensionDevelopmentPath,
      extensionTestsPath,
      vscodeExecutablePath,
      workspacePath: noBazaarWorkspace,
      env: { BAZAAR_INTEGRATION_MODE: 'no-bazaar' }
    });
  } finally {
    removeTemporaryDirectory(noBazaarWorkspace);
  }

  const bzrPath = findBazaarExecutable();
  if (!bzrPath) {
    console.log('Skipping Bazaar-backed integration tests because bzr was not found on PATH.');
    return;
  }

  await delay(2000);

  const bazaarWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-bazaar-bzr-workspace-'));
  try {
    prepareBazaarWorkspace(bazaarWorkspace, bzrPath);
    await runIntegrationSession({
      extensionDevelopmentPath,
      extensionTestsPath,
      vscodeExecutablePath,
      workspacePath: bazaarWorkspace,
      env: {
        BAZAAR_INTEGRATION_MODE: 'bazaar',
        BAZAAR_TEST_WORKSPACE: bazaarWorkspace
      }
    });
  } finally {
    removeTemporaryDirectory(bazaarWorkspace);
  }
}

async function runIntegrationSession({
  extensionDevelopmentPath,
  extensionTestsPath,
  vscodeExecutablePath,
  workspacePath,
  env
}) {
  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-bazaar-test-'));
  const userDataDir = path.join(profileRoot, 'user-data');
  const extensionsDir = path.join(profileRoot, 'extensions');

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      vscodeExecutablePath,
      extensionTestsEnv: env,
      launchArgs: [
        workspacePath,
        '--new-window',
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${extensionsDir}`,
        '--disable-extensions',
        '--disable-updates',
        '--disable-crash-reporter',
        '--disable-gpu',
        '--disable-workspace-trust',
        '--skip-welcome'
      ]
    });
  } finally {
    removeTemporaryDirectory(profileRoot);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findLocalVSCodeExecutable() {
  if (process.env.VSCODE_TEST_EXECUTABLE_PATH) {
    return process.env.VSCODE_TEST_EXECUTABLE_PATH;
  }

  if (process.platform !== 'win32') {
    return undefined;
  }

  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  const candidates = [
    path.join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe'),
    path.join(localAppData, 'Programs', 'Microsoft VS Code Insiders', 'Code - Insiders.exe'),
    path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Microsoft VS Code', 'Code.exe'),
    path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft VS Code', 'Code.exe')
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function findBazaarExecutable() {
  const configured = process.env.BAZAAR_TEST_BZR_PATH;
  if (configured && runBazaarProbe(configured)) {
    return configured;
  }
  return runBazaarProbe('bzr') ? 'bzr' : undefined;
}

function runBazaarProbe(command) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    windowsHide: true
  });
  return result.status === 0;
}

function prepareBazaarWorkspace(workspacePath, bzrPath) {
  runBazaar(bzrPath, ['init'], workspacePath);
  runBazaar(bzrPath, ['whoami', '--branch', 'Integration Test <integration@example.com>'], workspacePath);
  fs.writeFileSync(path.join(workspacePath, 'README.txt'), 'initial\n', 'utf8');
  runBazaar(bzrPath, ['add', 'README.txt'], workspacePath);
  runBazaar(bzrPath, ['commit', '-m', 'initial', 'README.txt'], workspacePath);
  fs.writeFileSync(path.join(workspacePath, 'README.txt'), 'initial\nmodified\n', 'utf8');
  fs.writeFileSync(path.join(workspacePath, 'scratch.txt'), 'scratch\n', 'utf8');
}

function runBazaar(bzrPath, args, cwd) {
  const result = spawnSync(bzrPath, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error([
      `bzr ${args.join(' ')} failed with exit code ${result.status}`,
      result.stdout,
      result.stderr
    ].filter(Boolean).join('\n'));
  }
}

function removeTemporaryDirectory(directory) {
  try {
    fs.rmSync(directory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200
    });
  } catch (error) {
    console.warn(`Could not remove temporary directory ${directory}: ${error.message}`);
  }
}
