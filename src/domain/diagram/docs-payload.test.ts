/**
 * Writes a diagram payload from the real test project, for the docs media.
 *
 * Not a test — it lives here because it needs the domain code and the vitest
 * path aliases. Skipped unless OUT names a destination, so a normal run does
 * not touch the filesystem:
 *
 *   APPS=shop OUT=/tmp/payload-shop.js npx vitest run src/domain/diagram/docs-payload.test.ts
 *
 * Feed the result to the harness with PAYLOAD=<file>; see
 * scripts/diagram-harness/README.md.
 */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Scanner } from '$infra/scanner';
import { NodeFileSystem } from '$infra/file-system';
import { buildDiagramPayload } from '$domain/diagram/diagram-serializer';
import type { Project } from '$infra/types/project';

const APPS = (process.env.APPS ?? 'shop,billing,accounts').split(',');

it.skipIf(!process.env.OUT)(
  'payload',
  async () => {
    const emitterFactory = () =>
      ({
        event: () => ({ dispose: () => undefined }),
        fire: () => undefined,
        dispose: () => undefined,
      }) as unknown as import('vscode').EventEmitter<Project>;
    const project = await new Scanner({ fs: new NodeFileSystem(), emitterFactory }).scan([
      resolve('src/test-django-project'),
    ]);

    const models = project.models.all().filter(m => APPS.includes(m.appLabel));
    // Targets are raw here ('Product', 'self'); buildDiagramPayload resolves
    // them and drops whatever lands outside the selection.
    const rels = models.flatMap(m => [...m.relations]);
    const migs = project.migrations.all().filter(m => APPS.includes(m.appLabel));

    const payload = buildDiagramPayload(models, rels, migs);
    writeFileSync(
      process.env.OUT as string,
      'window.__DIAGRAM_DATA__ = ' + JSON.stringify(payload, null, 0) + ';\n',
    );
    console.log(
      `modelos=${models.length} relaciones=${payload.relations.length} migraciones=${migs.length}`,
    );
  },
  120000,
);
