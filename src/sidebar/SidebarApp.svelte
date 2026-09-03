<script lang="ts">
  import ViewsSection from './sections/ViewsSection.svelte';
  import LayoutsSection from './sections/LayoutsSection.svelte';
  import OrphansSection from './sections/OrphansSection.svelte';
  import ModelsSection from './sections/ModelsSection.svelte';

  // The extension sets body[data-section] to one of 'views' | 'layouts' |
  // 'orphans' | 'models' when generating webview.html — that's how this one
  // shared bundle knows which section to render in each WebviewView.
  const section = (
    typeof document !== 'undefined' ? document.body.getAttribute('data-section') : null
  ) as 'views' | 'layouts' | 'orphans' | 'models' | null;
</script>

{#if section === 'views'}
  <ViewsSection />
{:else if section === 'layouts'}
  <LayoutsSection />
{:else if section === 'orphans'}
  <OrphansSection />
{:else if section === 'models'}
  <ModelsSection />
{:else}
  <div class="p-3 text-label text-vsc-desc/70">
    Sidebar section attribute missing on &lt;body&gt;.
  </div>
{/if}
