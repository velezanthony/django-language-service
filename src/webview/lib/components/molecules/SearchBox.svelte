<script lang="ts">
  import { actions } from '$lib/state/toolbar.svelte';
  import { TextInput } from '$atoms';
  import { IconSearch } from '$icons';
  import { SearchHelpPopover, SearchResultsDropdown } from '$molecules';

  // Optional: fired after a suggestion is committed. The offcanvas (narrow
  // layout) passes a handler that closes the menu so the user immediately sees
  // the freshly filtered/navigated canvas instead of the panel covering it.
  let { onPick }: { onPick?: () => void } = $props();

  // Mirror of the input's value so the dropdown can compute matches off the
  // exact text the user has typed (the canvas filter is debounced separately
  // via search-filter — keeping them decoupled lets the autocomplete feel
  // instant while the heavier filter pass still throttles).
  let query = $state('');
  let focused = $state(false);
  let dropdown: SearchResultsDropdown | null = $state(null);
  // Direct reference to THIS instance's <input>. With two SearchBox instances
  // alive (wide toolbar + offcanvas), a shared id + getElementById always
  // resolved to the first one in the DOM — writing the picked value into the
  // wrong (hidden) input. A per-instance ref touches only our own node.
  let inputEl: HTMLInputElement | null = $state(null);

  const blurActive = (): void => {
    const el = document.activeElement;
    if (el && el instanceof HTMLElement) el.blur();
  };

  function onInput(e: Event) {
    const target = e.target as HTMLInputElement;
    query = target.value;
    actions().setSearchQuery(query);
  }

  function onKeydown(e: KeyboardEvent) {
    if (!dropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      dropdown.navigate(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      dropdown.navigate(-1);
      return;
    }
    // Enter and Tab both commit — Tab is the standard autocomplete convention
    // and is preventDefault'd so focus doesn't jump to the next field; Enter
    // is the natural "go" key. Both call commit() which navigates the canvas.
    if (e.key === 'Enter' || e.key === 'Tab') {
      const handled = dropdown.commit();
      if (handled) {
        e.preventDefault();
        blurActive();
      }
      return;
    }
    if (e.key === 'Escape') {
      query = '';
      actions().setSearchQuery('');
      blurActive();
    }
  }

  // Slight delay on blur so a click on a result has time to land before we
  // hide the dropdown (mousedown → blur → click would otherwise cancel the
  // click).
  let blurTimer: ReturnType<typeof setTimeout> | null = null;
  function onFocus() {
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = null;
    }
    focused = true;
  }
  function onBlur() {
    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      focused = false;
    }, 120);
  }

  // Payload-driven: each dropdown result tells US what to do — set the input
  // value (filters the canvas), and/or navigate to a specific model. Different
  // scopes produce different payloads; the SearchBox stays scope-agnostic.
  function onPickResult(payload: { newQuery?: string; navigateKey?: string }) {
    if (payload.newQuery !== undefined) {
      query = payload.newQuery;
      // The actual <input> inside TextInput is uncontrolled (we read it via
      // oninput), so we have to write the new value imperatively for the user
      // to see what the dropdown selection set as the active filter.
      if (inputEl) inputEl.value = payload.newQuery;
      actions().setSearchQuery(payload.newQuery);
    }
    if (payload.navigateKey) {
      actions().navigateToModel(payload.navigateKey);
    }
    blurActive();
    focused = false;
    onPick?.();
  }
</script>

<!--
  Uncontrolled input as far as the boot's search-filter is concerned, but the
  autocomplete dropdown reads `query` from this component's local state for
  instant feedback (no debounce).
-->
<div class="relative w-72" data-search-input onfocusin={onFocus} onfocusout={onBlur}>
  <TextInput
    bind:inputEl
    ariaLabel="Search models"
    onkeydown={onKeydown}
    widthClass="w-full"
    placeholder="Search models · field:name · rel:User"
    oninput={onInput}
  >
    {#snippet leftAdornment()}
      <IconSearch size={14} />
    {/snippet}
    {#snippet rightAdornment()}
      <SearchHelpPopover />
    {/snippet}
  </TextInput>
  <SearchResultsDropdown bind:this={dropdown} {query} open={focused} onPick={onPickResult} />
</div>
