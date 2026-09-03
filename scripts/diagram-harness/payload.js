/* Synthetic __DIAGRAM_DATA__ for the browser harness.
 *
 * Shaped to stress the app-zone overlay specifically: several apps, each with
 * enough models to earn a zone (drawAppZones skips apps with < 2 models), plus
 * cross-app relations so the force layout interleaves the clusters and their
 * bounding boxes overlap — the condition that makes zones stack their fills.
 *
 * Deterministic: no Math.random, so two runs produce the same layout and the
 * same measurements. */
(function () {
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const APPS = ['catalog', 'orders', 'accounts', 'billing', 'shipping', 'analytics'];
  const PER_APP = 12;

  const tooltipData = [];
  const modelKeys = [];
  const relations = [];

  APPS.forEach((app, appIdx) => {
    for (let i = 0; i < PER_APP; i++) {
      const name = `${app.charAt(0).toUpperCase()}${app.slice(1)}Model${i}`;
      const key = `${app}.${name}`;
      modelKeys.push(key);

      const fields = [];
      for (let f = 0; f < 4 + (i % 5); f++) {
        fields.push({
          name: `field_${f}`,
          type: f === 0 ? 'AutoField' : 'CharField',
          attrs: f === 0 ? ['primary_key'] : ['max_length=100'],
          doc: '',
        });
      }

      // One of each FieldChoices kind, so the chip counts and the popup body
      // can be exercised without an extension host.
      if (i === 0) {
        fields.push(
          {
            name: 'inline_status',
            type: 'CharField',
            attrs: [],
            doc: '',
            choices: {
              kind: 'inline',
              values: [
                { value: 'draft', label: 'Draft' },
                { value: 'published', label: 'Published' },
              ],
            },
          },
          {
            name: 'resolved_status',
            type: 'CharField',
            attrs: [],
            doc: '',
            choices: {
              kind: 'resolved',
              symbolName: 'StockStatus',
              sourceModule: '.enums',
              values: [
                { value: 'in_stock', label: 'In Stock' },
                { value: 'low', label: 'Low Stock' },
                { value: 'out', label: 'Out of Stock' },
              ],
            },
          },
          {
            name: 'unresolved_status',
            type: 'CharField',
            attrs: [],
            doc: '',
            choices: { kind: 'unresolved', symbolName: 'NowhereToBeFound' },
          },
        );
      }

      tooltipData.push({
        key,
        name,
        appLabel: app,
        dbTable: `${app}_${name.toLowerCase()}`,
        fieldCount: fields.length,
        fields,
        relations: [],
        referencedBy: [],
        // One model carries properties so the hover-for-source popup can be
        // exercised without an extension host.
        properties:
          i === 0
            ? [
                {
                  name: 'display_name',
                  source: [
                    '@property',
                    'def display_name(self):',
                    '    if not self.field_1:',
                    '        return str(self.pk)',
                    '    return f"{self.field_1} ({self.pk})"',
                  ].join('\n'),
                },
                {
                  name: 'is_active',
                  source: '@property\ndef is_active(self):\n    return self.field_2 is not None',
                },
              ]
            : [],
        hubTier: i % 4,
        isOrphan: i === PER_APP - 1,
        isAbstract: i === 0,
        isProxy: false,
        isInCycle: false,
        genericFkCount: 0,
        searchModel: `${app}.${name}`.toLowerCase(),
        searchFields: fields.map(f => f.name).join(' '),
        searchRelations: '',
      });

      // Intra-app chain — keeps each app a recognisable cluster.
      if (i > 0) {
        relations.push({
          from: key,
          to: `${app}.${app.charAt(0).toUpperCase()}${app.slice(1)}Model${i - 1}`,
          fieldName: `parent_${i}`,
          type: 'FK',
          onDelete: 'CASCADE',
        });
      }

      // Cross-app edges — this is what drags clusters into each other.
      if (i % 4 === 0 && appIdx < APPS.length - 1) {
        const other = APPS[appIdx + 1];
        relations.push({
          from: key,
          to: `${other}.${other.charAt(0).toUpperCase()}${other.slice(1)}Model${(i + 3) % PER_APP}`,
          fieldName: `link_${i}`,
          type: i % 8 === 0 ? 'M2M' : 'O2O',
        });
      }
    }
  });

  window.__DIAGRAM_DATA__ = {
    tooltipData,
    relations,
    modelKeys,
    appLabels: APPS,
    mermaidSrc: '',
    dbmlSrc: '',
    plantUmlSrc: '',
    // Enough migration history to open the panel and exercise its controls.
    timelineSteps: APPS.slice(0, 3).flatMap((app, i) =>
      [
        {
          key: `${app}.0001_initial`,
          name: '0001_initial',
          appLabel: app,
          isInitial: true,
          dependencies: [],
          opSummary: [`CreateModel ${cap(app)}Model0`, `CreateModel ${cap(app)}Model1`],
          diff: {
            addedModels: [`${cap(app)}Model0`, `${cap(app)}Model1`],
            removedModels: [],
            addedFields: [],
            alteredFields: [],
            renamedFields: [],
          },
        },
        {
          key: `${app}.0002_more`,
          name: '0002_more',
          appLabel: app,
          dependencies: [`${app}.0001_initial`],
          // Touches many models on purpose: this is the shape that used to leave
          // the survivors scattered outside the viewport.
          opSummary: [`AddField ${cap(app)}Model0.extra`],
          diff: {
            addedModels: [],
            removedModels: [],
            addedFields: Array.from({ length: 8 }, (_, k) => ({
              model: `${cap(app)}Model${k}`,
              field: 'extra',
            })),
            alteredFields: [],
            renamedFields: [],
          },
        },
      ].slice(0, i === 0 ? 2 : 1),
    ),
    // snapshots[i] = esquema tras aplicar la migracion i. El comparador de
    // modo paso lee snapshots[i-1] contra snapshots[i].
    snapshots: APPS.slice(0, 3).flatMap((app, i) => {
      const mk = extra => ({
        models: [
          {
            name: `${cap(app)}Model1`,
            appLabel: app,
            fields: [
              { name: 'field_0', fieldType: 'AutoField', attrs: ['primary_key'] },
              { name: 'field_1', fieldType: extra ? 'TextField' : 'CharField' },
              // Same type on both sides — only the precision moves. Nothing at
              // all showed here before the signature comparison landed.
              {
                name: 'total',
                fieldType: 'DecimalField',
                attrs: extra
                  ? ['max_digits=12', 'decimal_places=4']
                  : ['max_digits=10', 'decimal_places=2'],
              },
            ].concat(extra ? [{ name: 'extra', fieldType: 'BooleanField' }] : []),
          },
        ],
      });
      return i === 0 ? [mk(false), mk(true)] : [mk(false)];
    }),
    // The toolbar gates the history entry on THIS list, not on timelineSteps.
    migrationComparisons: APPS.slice(0, 3).map((app, i) => ({
      migrationIdx: i,
      migrationName: i === 0 ? '0001_initial' : '0002_more',
      appLabel: app,
      comparison: {
        addedModels: [`${app}.${cap(app)}Model0`],
        removedModels: [],
        // A changed model, so the BEFORE/AFTER tooltip has something to render.
        changedModels: [
          { key: `${app}.${cap(app)}Model1`, added: ['extra'], removed: [], altered: ['field_1'] },
        ],
        unchangedModels: [`${app}.${cap(app)}Model2`],
      },
    })),
  };
})();
