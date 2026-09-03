export type SearchScope = 'model' | 'fields' | 'relations';

export interface SearchParsed {
  scope: SearchScope;
  query: string;
}

const PREFIX_RE = /^(field|f|rel|r|model|m)\s*:\s*(.*)$/;

export const parseSearchQuery = (raw: string): SearchParsed => {
  const trimmed = (raw || '').toLowerCase().trim();
  if (!trimmed) return { scope: 'model', query: '' };
  const m = trimmed.match(PREFIX_RE);
  if (!m) return { scope: 'model', query: trimmed };
  const prefix = m[1];
  const rest = (m[2] ?? '').trim();
  if (prefix === 'field' || prefix === 'f') return { scope: 'fields', query: rest };
  if (prefix === 'rel' || prefix === 'r') return { scope: 'relations', query: rest };
  return { scope: 'model', query: rest };
};

export interface SearchableModel {
  appLabel?: string;
  searchModel: string;
  searchFields: string;
  searchRelations: string;
}

export interface VisibilityInputs {
  modelKeys: string[];
  dataByKey: Record<string, SearchableModel>;
  hiddenKeys: Set<string>;
  appFilter: string;
  search: SearchParsed;
}

// Pure computation: returns the set of model keys that pass the current
// hidden / app-filter / search filters. No DOM access. Legacy applyFilters
// still owns the classList mutation; this helper just computes the set.
export const computeVisibleModels = (inputs: VisibilityInputs): Set<string> => {
  const visible = new Set<string>();
  for (const key of inputs.modelKeys) {
    if (inputs.hiddenKeys.has(key)) continue;
    const d = inputs.dataByKey[key];
    if (!d) continue;
    if (inputs.appFilter && d.appLabel !== inputs.appFilter) continue;
    if (inputs.search.query) {
      const haystack =
        inputs.search.scope === 'fields'
          ? d.searchFields
          : inputs.search.scope === 'relations'
            ? d.searchRelations
            : d.searchModel;
      if (!haystack || !haystack.includes(inputs.search.query)) continue;
    }
    visible.add(key);
  }
  return visible;
};
