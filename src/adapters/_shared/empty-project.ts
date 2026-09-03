/**
 * EMPTY_PROJECT — a frozen no-op Project snapshot used as the initial value
 * of `latestProject` in extension.ts before the first Scanner scan completes.
 *
 * Adapters receive `() => Project` (non-null). They call `getProject()` inside
 * their handlers; if the first scan hasn't finished yet, they receive this
 * empty snapshot and should gracefully return undefined/empty results.
 *
 * Uses IndexImpl with empty stores so all `byKey`/`all()` calls return
 * undefined/[] without requiring any special adapter null-checking.
 */

import type { Project } from '$infra/types/project';
import type { Model } from '$domain/types/model';
import type { View } from '$domain/types/view';
import type { Form } from '$domain/types/form';
import type { Migration } from '$domain/types/migration';
import type { Template } from '$domain/types/template';
import type { Url } from '$domain/types/url';
import type { Helper } from '$domain/types/helper';
import { IndexImpl } from '$infra/index-impl';

export const EMPTY_PROJECT: Project = Object.freeze({
  models: new IndexImpl<Model, string>(m => `${m.appLabel}.${m.name}`),
  views: new IndexImpl<View, string>(v => v.name),
  forms: new IndexImpl<Form, string>(f => f.name),
  migrations: new IndexImpl<Migration, string>(mg => `${mg.appLabel}.${mg.name}`),
  templates: new IndexImpl<Template, string>(t => t.relativePath),
  urls: new IndexImpl<Url, string>(u => u.name),
  helpers: new IndexImpl<Helper, string>(h => `${h.library}.${h.name}`),
  workspaceFingerprint: '',
  scannedAt: 0,
});
