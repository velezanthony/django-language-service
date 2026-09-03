/**
 * Integration test runner.
 *
 * Downloads VS Code, loads the extension, and runs Mocha tests
 * inside the real VS Code Extension Host.
 */

import * as path from 'path';
import { execSync } from 'child_process';
import { runTests } from '@vscode/test-electron';

/**
 * Kill any test-electron processes left over from a prior run. VS Code only permits one
 * Electron instance per user-data-dir; a crashed/interrupted test run leaves the binary
 * still-running and the next invocation errors with "Running extension tests from the
 * command line is currently only supported if no other instance of Code is running."
 */
function killLeftoverTestElectron(extensionDevelopmentPath: string): void {
  const testBin = path.resolve(extensionDevelopmentPath, '.vscode-test');
  try {
    // pgrep -f matches by full command line. Scoping to our .vscode-test dir avoids killing
    // the user's normal VS Code.
    execSync(`pkill -f ${JSON.stringify(testBin)}`, { stdio: 'ignore' });
  } catch {
    // pkill exits 1 when nothing matched — that's the happy path.
  }
}

async function main(): Promise<void> {
  // From out/src/integration-tests/ → go up 3 levels to project root
  const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');
  // Use the test Django project as workspace for real-world validation
  const testWorkspace = path.resolve(extensionDevelopmentPath, 'src/test-django-project');

  killLeftoverTestElectron(extensionDevelopmentPath);

  // Isolated user-data dir so tests can run alongside a user's regular VS Code instance.
  const userDataDir = path.resolve(extensionDevelopmentPath, '.vscode-test/test-user-data');

  try {
    await runTests({
      // Pinned deliberately. Left on 'stable', a VS Code release turns a
      // green suite red without a line of code changing: the runner goes
      // off to fetch 334 MB, and a reset connection then reads as a test
      // failure. Bump this on purpose, not by surprise.
      version: '1.132.0',
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        testWorkspace,
        '--disable-extensions',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        `--user-data-dir=${userDataDir}`,
      ],
    });
  } catch (err) {
    // The error was discarded and this line printed on its own. It is the
    // same mistake esbuild.js fixed on the other side of the repo, and the
    // comment above about the 334 MB download says exactly when it bites:
    // a reset connection and a failing test produce identical output, so
    // the log cannot tell you which one happened.
    console.error('Integration tests failed');
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exit(1);
  }
}

main();
