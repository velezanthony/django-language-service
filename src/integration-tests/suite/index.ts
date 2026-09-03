/**
 * Mocha test suite loader for VS Code integration tests.
 *
 * Runs INSIDE the VS Code Extension Host process.
 */

import * as path from 'path';
import Mocha from 'mocha';
import * as fs from 'fs';

export async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 30_000,
    // Allow up to 2 retries on flaky tests. With 216 models in test-django-project,
    // activation/scanner contention occasionally pushes timing-sensitive tests over their sleeps.
    retries: 2,
  });

  const testsRoot = __dirname;
  const files = fs.readdirSync(testsRoot).filter(f => f.endsWith('.test.js'));

  for (const file of files) {
    mocha.addFile(path.resolve(testsRoot, file));
  }

  return new Promise<void>((resolve, reject) => {
    mocha.run(failures => {
      if (failures > 0) {
        reject(new Error(`${failures} integration test(s) failed`));
      } else {
        resolve();
      }
    });
  });
}
