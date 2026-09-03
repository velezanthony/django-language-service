/**
 * Pass-2 half of cross-file choices: apply symbols found elsewhere.
 *
 * Pure — the scanner does the file reading and passes a lookup in.
 */

import type { Choice } from '$domain/types/choice';
import type { Field } from '$domain/types/field';
import type { Model } from '$domain/types/model';

/** Symbol names this model still needs looked up in another module. */
export function unresolvedSymbolsOf(model: Model): Set<string> {
  const out = new Set<string>();
  for (const f of model.fields) {
    if (f.choices?.kind === 'unresolved') out.add(f.choices.symbolName);
  }
  return out;
}

export interface FoundSymbol {
  readonly values: readonly Choice[];
  readonly sourceModule: string;
}

/**
 * Promote every unresolved field whose symbol the lookup can supply.
 *
 * Returns the SAME model object when nothing changed, so downstream identity
 * checks on Model stay meaningful. (`project-graph.ts` memoizes one level up,
 * per Project snapshot — `WeakMap<Project, ModelGraph>`.)
 */
export function resolveModelChoices(
  model: Model,
  lookup: (symbolName: string) => FoundSymbol | undefined,
): Model {
  let changed = false;

  const fields: Field[] = model.fields.map(f => {
    if (f.choices?.kind !== 'unresolved') return f as Field;
    const found = lookup(f.choices.symbolName);
    if (!found) return f as Field;
    changed = true;
    return {
      ...f,
      choices: {
        kind: 'resolved',
        symbolName: f.choices.symbolName,
        values: found.values,
        sourceModule: found.sourceModule,
      },
    };
  });

  return changed ? { ...model, fields } : model;
}
