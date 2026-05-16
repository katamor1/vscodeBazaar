const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { runTests } = require('@vscode/test-electron');

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, 'suite');
  const workspacePath = path.resolve(__dirname, 'fixtures', 'no-bazaar');
  const vscodeExecutablePath = findLocalVSCodeExecutable();
  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-bazaar-test-'));
  const userDataDir = path.join(profileRoot, 'user-data');
  const extensionsDir = path.join(profileRoot, 'extensions');

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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

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
