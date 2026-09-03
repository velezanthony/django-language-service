<script lang="ts">
  import {
    DropdownHint,
    DropdownLabel,
    DropdownSeparator,
    IconButton,
    Spinner,
    ToolbarBtn,
    ToolbarRow,
    ToolbarSep,
    ToolbarStat,
  } from '$atoms';
  import {
    IconBolt,
    IconContentCopy,
    IconFilter,
    IconFit,
    IconFolderOpen,
    IconList,
    IconLoop,
    IconMenu,
    IconPan,
    IconRefresh,
    IconRefresh as IconAutorenew,
    IconSchedule,
    IconSchema,
    IconScience,
    IconShare,
    IconVisibility,
  } from '$icons';
  import {
    AppFilter,
    Dropdown,
    FilterButton,
    OffcanvasPanel,
    SearchBox,
    Tabs,
    ZoomControl,
  } from '$molecules';
  import type { TabItem } from '$molecules/Tabs.svelte';
  import { actions, toolbar } from '$lib/state/toolbar.svelte';
  import { RELATION_KINDS, RELATION_LABELS } from '$lib/types/relations';

  // Below md (< 768px) the toolbar hides Row 2 (Search + filter dots + App
  // filter) entirely — those items move into a Filters TAB inside the ☰ menu.
  // At md+ Row 2 is back inline and the Filters tab disappears from the menu
  // so we don't duplicate.
  //
  // matchMedia is the cleanest way to flip the tab list reactively — Tailwind
  // can't conditionally include/exclude items from a JS array.
  let menuOpen = $state(false);
  let isNarrow = $state(false);

  $effect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 767px)');
    isNarrow = mql.matches;
    const onChange = (e: MediaQueryListEvent): void => {
      isNarrow = e.matches;
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  });

  type TabId = 'filters' | 'view' | 'analyze' | 'export';
  let activeTab = $state<TabId>('filters');

  const FILTERS_TAB: TabItem = { id: 'filters', label: 'Filters', icon: IconFilter };
  const SECONDARY_TABS: TabItem[] = [
    { id: 'view', label: 'View', icon: IconVisibility },
    { id: 'analyze', label: 'Analyze', icon: IconScience },
    { id: 'export', label: 'Export', icon: IconShare },
  ];

  // Tabs list adapts to width — Filters tab only exists at narrow widths
  // where Row 2 is hidden from the toolbar.
  const tabs = $derived(isNarrow ? [FILTERS_TAB, ...SECONDARY_TABS] : SECONDARY_TABS);

  // If the active tab disappears on resize (e.g. user was on 'filters' then
  // widened past md), fall through to the first available tab instead of
  // showing an empty body.
  $effect(() => {
    if (!tabs.find(t => t.id === activeTab)) {
      const first = tabs[0];
      if (first) activeTab = first.id as TabId;
    }
  });
</script>

<!--
  Section header snippet — accent mini-bar + uppercase tracked label. Shared
  by every grouped block in the offcanvas content snippets below.
-->
{#snippet sectionLabel(label: string)}
  <div
    class="flex items-center gap-2 px-3 pt-2 pb-1 text-meta uppercase tracking-[0.6px] font-bold text-vsc-link/80"
  >
    <span class="w-[3px] h-3 bg-vsc-link rounded-sm shrink-0" aria-hidden="true"></span>
    {label}
  </div>
{/snippet}

<!--
  ─── Tab content snippets ──────────────────────────────────────────────────
  Each tab's body lives in a snippet so the offcanvas template stays a thin
  router. Items inside use the same atoms as the wide-layout dropdowns
  (DropdownLabel, DropdownHint, ToolbarBtn variant=menu), so visuals are
  identical across both layouts.
-->

<!--
  Filters tab content — only shown at narrow widths via tabs[] gating above.
  Mirrors the toolbar Row 2 items (Search + relation filter dots + App
  filter) that get hidden when the panel is below md.
-->
{#snippet filtersContent()}
  {@render sectionLabel('Search')}
  <DropdownHint>Type to find a model, field, or relation target.</DropdownHint>
  <div class="px-3 pb-2">
    <SearchBox onPick={() => (menuOpen = false)} />
  </div>

  <DropdownSeparator />

  {@render sectionLabel('Relations')}
  <DropdownHint>Toggle which relation kinds the diagram shows.</DropdownHint>
  <div class="flex flex-wrap gap-2 px-3 pb-2">
    {#each RELATION_KINDS as kind (kind)}
      <FilterButton {kind} title="Show {RELATION_LABELS[kind]} relations" />
    {/each}
  </div>

  <DropdownSeparator />

  {@render sectionLabel('App')}
  <DropdownHint>Narrow the diagram to one Django app.</DropdownHint>
  <div class="px-3 pb-2">
    <AppFilter onPick={() => (menuOpen = false)} />
  </div>
{/snippet}

{#snippet viewContent()}
  {@render sectionLabel('Quick actions')}
  <ToolbarBtn
    variant="menu"
    title="Fit visible models to viewport (shortcut: F)"
    onclick={() => actions().fitToVisible()}
  >
    <IconFit size={14} /> Fit to screen
  </ToolbarBtn>
  <ToolbarBtn
    variant="menu"
    title="Hand tool — when ON, click+drag pans the view instead of moving boxes."
    active={toolbar.panToolActive}
    onclick={() => actions().togglePan()}
  >
    <IconPan size={14} /> Pan tool
  </ToolbarBtn>
  <ToolbarBtn
    variant="menu"
    title="Re-scan the workspace and rebuild the diagram from scratch"
    disabled={toolbar.isRefreshing}
    onclick={() => actions().refresh()}
  >
    {#if toolbar.isRefreshing}
      <Spinner size="sm" /> Refreshing…
    {:else}
      <IconRefresh size={14} /> Refresh
    {/if}
  </ToolbarBtn>
  <ToolbarBtn
    variant="menu"
    title="Recompute force-directed layout — resets all box positions"
    onclick={() => actions().relayout()}
  >
    <IconAutorenew size={14} /> Auto-arrange boxes
  </ToolbarBtn>

  <DropdownSeparator />

  {@render sectionLabel('Display')}
  <ToolbarBtn
    variant="menu"
    title="Show fields and types inside each box (compact ↔ detailed view)"
    active={toolbar.detailMode}
    onclick={() => actions().toggleDetail()}
  >
    <IconList size={14} /> Show field details
  </ToolbarBtn>
  <ToolbarBtn
    variant="menu"
    title="Compact mode shrinks each model box so more fit on screen without zooming out"
    active={toolbar.densityMode === 'compact'}
    onclick={() => actions().toggleDensity()}
  >
    <IconList size={14} /> Compact density
  </ToolbarBtn>

  <DropdownSeparator />

  {@render sectionLabel('Hidden models')}
  <DropdownHint>Right-click a model to hide it. Use this to bring them all back.</DropdownHint>
  <ToolbarBtn
    variant="menu"
    disabled={toolbar.hiddenCount === 0}
    title="Unhide every model that was hidden via right-click"
    onclick={() => actions().showAllHidden()}
  >
    <IconVisibility size={14} /> Unhide all ({toolbar.hiddenCount})
  </ToolbarBtn>
{/snippet}

{#snippet analyzeContent()}
  {@render sectionLabel('Impact & structure')}
  <DropdownHint>Visual analysis modes — click a button to turn each on/off.</DropdownHint>
  <ToolbarBtn
    variant="menu"
    title="Then click a model to see which other models would be deleted via CASCADE"
    active={toolbar.blastMode}
    onclick={() => actions().toggleBlast()}
  >
    <IconBolt size={14} /> Blast radius (cascade delete)
  </ToolbarBtn>
  <ToolbarBtn
    variant="menu"
    title="Highlights models that participate in circular references"
    active={toolbar.cyclesMode}
    onclick={() => actions().toggleCycles()}
  >
    <IconLoop size={14} /> Circular dependencies
  </ToolbarBtn>
  {#if toolbar.hasMigrations}
    <DropdownSeparator />
    {@render sectionLabel('Migration history')}
    <DropdownHint>
      Walk the migration DAG; compare any point vs the previous step or the current models.
    </DropdownHint>
    <ToolbarBtn
      variant="menu"
      title="Open the migration history graph — scrub steps or compare vs the current models"
      active={toolbar.timelineMode || toolbar.compareIdx >= 0}
      onclick={() => actions().toggleTimeline()}
    >
      <IconSchedule size={14} /> Migration history
    </ToolbarBtn>
  {/if}
{/snippet}

{#snippet exportContent()}
  {@render sectionLabel('Copy as text')}
  <DropdownHint>Paste into your docs, README, or dbdiagram.io.</DropdownHint>
  <ToolbarBtn variant="menu" title="Mermaid ER diagram" onclick={() => actions().exportMermaid()}>
    <IconContentCopy size={14} /> Copy as Mermaid
  </ToolbarBtn>
  <ToolbarBtn
    variant="menu"
    title="DBML — paste into dbdiagram.io"
    onclick={() => actions().exportDbml()}
  >
    <IconContentCopy size={14} /> Copy as DBML
  </ToolbarBtn>
  <ToolbarBtn variant="menu" title="PlantUML IE syntax" onclick={() => actions().exportPuml()}>
    <IconContentCopy size={14} /> Copy as PlantUML
  </ToolbarBtn>

  <DropdownSeparator />

  {@render sectionLabel('Copy as image')}
  <DropdownHint>SVG markup — scalable, paste anywhere.</DropdownHint>
  <ToolbarBtn
    variant="menu"
    title="Copy the diagram as SVG markup"
    onclick={() => actions().exportSvg()}
  >
    <IconContentCopy size={14} /> Copy as SVG
  </ToolbarBtn>

  <DropdownSeparator />

  {@render sectionLabel('Layout')}
  <DropdownHint>Share the current box positions with your team.</DropdownHint>
  <ToolbarBtn
    variant="menu"
    title="Copy current box positions as JSON"
    onclick={() => actions().saveLayout()}
  >
    <IconContentCopy size={14} /> Copy layout JSON
  </ToolbarBtn>
  <ToolbarBtn
    variant="menu"
    title="Load box positions from a saved JSON file"
    onclick={() => actions().loadLayout()}
  >
    <IconFolderOpen size={14} /> Load arrangement…
  </ToolbarBtn>
{/snippet}

<!--
  ─── Wide-layout dropdown contents (unchanged) ─────────────────────────────
  These snippets are the SAME items as the offcanvas tab content but laid
  out for popover-style display (one section per Dropdown). At wide layouts
  they render inside three independent Dropdown popovers.
-->
{#snippet viewItems()}
  <DropdownLabel>Rearrange</DropdownLabel>
  <DropdownHint>
    After moving boxes around, use these to reset or toggle how much detail each box shows.
  </DropdownHint>
  <ToolbarBtn
    variant="menu"
    title="Recompute force-directed layout"
    onclick={() => actions().relayout()}
  >
    <IconAutorenew size={14} /> Auto-arrange boxes
  </ToolbarBtn>
  <ToolbarBtn
    variant="menu"
    title="Show fields and types inside each box"
    active={toolbar.detailMode}
    onclick={() => actions().toggleDetail()}
  >
    <IconList size={14} /> Show field details
  </ToolbarBtn>
  <ToolbarBtn
    variant="menu"
    title="Compact mode shrinks each model box"
    active={toolbar.densityMode === 'compact'}
    onclick={() => actions().toggleDensity()}
  >
    <IconList size={14} /> Compact density
  </ToolbarBtn>
  <DropdownSeparator />
  <DropdownLabel>Hidden models</DropdownLabel>
  <DropdownHint>Right-click a model to hide it. Use this to bring them all back.</DropdownHint>
  <ToolbarBtn
    variant="menu"
    disabled={toolbar.hiddenCount === 0}
    title="Unhide every model that was hidden via right-click"
    onclick={() => actions().showAllHidden()}
  >
    <IconVisibility size={14} /> Unhide all ({toolbar.hiddenCount})
  </ToolbarBtn>
{/snippet}

{#snippet analyzeItems()}
  <DropdownLabel>Impact & structure</DropdownLabel>
  <DropdownHint>Visual analysis modes — click a button to turn each on/off.</DropdownHint>
  <ToolbarBtn
    variant="menu"
    title="Click a model to see what would CASCADE delete"
    active={toolbar.blastMode}
    onclick={() => actions().toggleBlast()}
  >
    <IconBolt size={14} /> Blast radius (cascade delete)
  </ToolbarBtn>
  <ToolbarBtn
    variant="menu"
    title="Highlights models that participate in circular references"
    active={toolbar.cyclesMode}
    onclick={() => actions().toggleCycles()}
  >
    <IconLoop size={14} /> Circular dependencies
  </ToolbarBtn>
  {#if toolbar.hasMigrations}
    <DropdownSeparator />
    <DropdownLabel>Migration history</DropdownLabel>
    <DropdownHint>
      Walk the migration DAG; compare vs the previous step or the current models.
    </DropdownHint>
    <ToolbarBtn
      variant="menu"
      title="Open the migration history graph"
      active={toolbar.timelineMode || toolbar.compareIdx >= 0}
      onclick={() => actions().toggleTimeline()}
    >
      <IconSchedule size={14} /> Migration history
    </ToolbarBtn>
  {/if}
{/snippet}

{#snippet exportItems()}
  <DropdownLabel>Copy diagram as text</DropdownLabel>
  <DropdownHint>Paste into your docs, README, or dbdiagram.io.</DropdownHint>
  <ToolbarBtn variant="menu" title="Mermaid ER diagram" onclick={() => actions().exportMermaid()}>
    <IconContentCopy size={14} /> Copy as Mermaid
  </ToolbarBtn>
  <ToolbarBtn
    variant="menu"
    title="DBML — paste into dbdiagram.io"
    onclick={() => actions().exportDbml()}
  >
    <IconContentCopy size={14} /> Copy as DBML
  </ToolbarBtn>
  <ToolbarBtn variant="menu" title="PlantUML IE syntax" onclick={() => actions().exportPuml()}>
    <IconContentCopy size={14} /> Copy as PlantUML
  </ToolbarBtn>
  <DropdownSeparator />
  <DropdownLabel>Copy diagram as image</DropdownLabel>
  <DropdownHint>SVG markup — scalable, paste anywhere.</DropdownHint>
  <ToolbarBtn
    variant="menu"
    title="Copy the diagram as SVG markup"
    onclick={() => actions().exportSvg()}
  >
    <IconContentCopy size={14} /> Copy as SVG
  </ToolbarBtn>
  <DropdownSeparator />
  <DropdownLabel>Share box positions</DropdownLabel>
  <DropdownHint>Paste into a file in your repo for teammates.</DropdownHint>
  <ToolbarBtn
    variant="menu"
    title="Copy current box positions as JSON"
    onclick={() => actions().saveLayout()}
  >
    <IconContentCopy size={14} /> Copy layout JSON
  </ToolbarBtn>
  <ToolbarBtn
    variant="menu"
    title="Load box positions from a saved JSON file"
    onclick={() => actions().loadLayout()}
  >
    <IconFolderOpen size={14} /> Load arrangement from file…
  </ToolbarBtn>
{/snippet}

<!--
  ═══════════════════════════════════════════════════════════════════════════
  Toolbar render
  ═══════════════════════════════════════════════════════════════════════════
-->
<div class="sticky top-0 z-chrome bg-vsc-card-bg border-b border-vsc-card-border p-0 shrink-0">
  <ToolbarRow>
    <span
      class="inline-flex items-center gap-2 text-body font-bold tracking-[-0.3px] text-vsc-editor-fg"
    >
      <span class="text-vsc-link"><IconSchema size={16} /></span>
      ER Diagram
    </span>
    {#if toolbar.metrics}
      <!--
        Stats: 4 KEY metrics always inline (header context the user explicitly
        asked for at narrow). The remaining 3 stats (apps / avg / largest)
        progressively unfold at lg+ where there's room. Each individual
        ToolbarSep is responsive so we don't get orphan separators.
      -->
      <ToolbarSep />
      <ToolbarStat label="models" value={toolbar.metrics.totalModels} />
      <ToolbarSep />
      <ToolbarStat label="FK" value={toolbar.metrics.fkCount} />
      <ToolbarSep />
      <ToolbarStat label="M2M" value={toolbar.metrics.m2mCount} />
      <ToolbarSep />
      <ToolbarStat label="O2O" value={toolbar.metrics.o2oCount} />
      <!-- lg+: secondary stats — only useful when there's real room for them. -->
      <span class="hidden lg:contents">
        <ToolbarSep />
        <ToolbarStat label="apps" value={toolbar.metrics.appCount} />
        <ToolbarSep />
        <ToolbarStat label="avg fields" value={`~${toolbar.metrics.avgFields}`} />
        <ToolbarSep />
        <ToolbarStat
          label="largest"
          value={`${toolbar.metrics.maxFieldsModel} (${toolbar.metrics.maxFieldsCount})`}
        />
      </span>
    {/if}
  </ToolbarRow>

  <!--
    Row 2 (Search + relation filter dots + App filter) hides below md — at
    those widths the same controls live inside the offcanvas Filters tab.
    'hidden md:contents' collapses the wrapper out of layout entirely below
    md while letting ToolbarRow flow naturally at md+.
  -->
  <div class="hidden md:contents">
    <ToolbarRow divider>
      <SearchBox />
      <ToolbarSep />
      {#each RELATION_KINDS as kind (kind)}
        <FilterButton {kind} title="Show {RELATION_LABELS[kind]} relations" />
      {/each}
      <ToolbarSep />
      <AppFilter />
    </ToolbarRow>
  </div>

  <!--
    Row 3 (action shelf) — Zoom always inline. The other buttons appear
    progressively so a slightly-wider viewport reveals Fit, then Pan + Refresh,
    then View/Analyze/Export dropdowns. Only View/Analyze/Export ever sit in
    the ☰ menu, which matches the user's '3 elements in the menu' constraint.
  -->
  <ToolbarRow divider tone="recessed">
    <ZoomControl />

    <span class="hidden sm:contents">
      <ToolbarBtn
        id="btn-fit"
        title="Fit visible models to viewport (shortcut: F)"
        onclick={() => actions().fitToVisible()}
      >
        <IconFit /> Fit to screen
      </ToolbarBtn>
    </span>
    <span class="hidden md:contents">
      <ToolbarBtn
        id="btn-pan"
        title="Hand tool — click+drag pans the view instead of moving boxes."
        active={toolbar.panToolActive}
        onclick={() => actions().togglePan()}
      >
        <IconPan /> Pan
      </ToolbarBtn>
      <ToolbarBtn
        id="btn-refresh"
        title="Re-scan the workspace and rebuild the diagram from scratch"
        disabled={toolbar.isRefreshing}
        onclick={() => actions().refresh()}
      >
        {#if toolbar.isRefreshing}
          <Spinner size="sm" /> Refreshing…
        {:else}
          <IconRefresh /> Refresh
        {/if}
      </ToolbarBtn>
    </span>

    <span class="flex-1"></span>

    <!--
      lg+: View / Analyze / Export inline. Below lg they collapse into a
      single ☰ menu — exactly 3 sections, mirroring what the user asked for.
    -->
    <span class="hidden lg:contents">
      <Dropdown name="view" label="View" icon={IconVisibility}>
        {@render viewItems()}
      </Dropdown>
      <Dropdown name="analyze" label="Analyze" icon={IconScience}>
        {@render analyzeItems()}
      </Dropdown>
      <Dropdown name="export" label="Export" icon={IconShare} wide>
        {@render exportItems()}
      </Dropdown>
    </span>

    <span class="flex lg:hidden">
      <IconButton
        size="md"
        variant="secondary"
        title="Open menu (View / Analyze / Export)"
        active={menuOpen}
        onclick={() => (menuOpen = true)}
      >
        <IconMenu size={16} />
      </IconButton>
    </span>
  </ToolbarRow>
</div>

<!--
  Offcanvas drawer for narrow layouts. Tabs let the user pick which menu
  they want (Filters first by default — fastest path to common operations
  in a narrow panel). Each tab renders the corresponding *Content snippet.
-->
<OffcanvasPanel open={menuOpen} onClose={() => (menuOpen = false)} title="Diagram menu">
  <Tabs {tabs} active={activeTab} onChange={id => (activeTab = id as TabId)} />
  <div class="flex flex-col gap-0.5 pt-1.5">
    {#if activeTab === 'filters'}
      {@render filtersContent()}
    {:else if activeTab === 'view'}
      {@render viewContent()}
    {:else if activeTab === 'analyze'}
      {@render analyzeContent()}
    {:else if activeTab === 'export'}
      {@render exportContent()}
    {/if}
  </div>
</OffcanvasPanel>
