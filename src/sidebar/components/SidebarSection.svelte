<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    /** Section title — accepted for aria-label only. NOT rendered visually:
     *  VS Code's native section header already shows the name above the
     *  webview, so painting a second one inside the body would duplicate
     *  the chrome and steal vertical space. */
    title: string;
    /** One-line description, surfaced through the ⓘ tooltip in the header
     *  strip — not rendered inline. Tells the user what this section is for
     *  without spending vertical space on it. */
    description: string;
    /** Optional pill-style count chip rendered at the top right. */
    countLabel?: string;
    children: Snippet;
  };

  let { title, description, countLabel, children }: Props = $props();
</script>

<section
  class="flex flex-col gap-2 px-2 py-2 font-vsc text-body text-vsc-fg bg-vsc-bg min-h-full h-full"
  aria-label={title}
>
  <!--
    Compact header strip — just description + optional count. The native VS
    Code section header above us already carries the section name + icon.
    Fades in on mount so the very first paint shows something animating,
    even if scan data arrives before the loading skeleton has a chance to
    pulse visibly.
  -->
  <header
    class="flex items-center gap-2 px-1 min-h-[18px] motion-safe:animate-[fadeIn_220ms_ease-out]"
  >
    <!-- Description moved into an info tooltip: it was 2–4 always-on lines that
         stole vertical space in a narrow sidebar. Hover/focus the ⓘ for the
         context. We render a styled card instead of the native `title=` —
         the OS tooltip is slow, ugly and unthemeable. Only shown when there's
         actually a description to surface. -->
    {#if description}
      <span class="relative shrink-0 inline-flex group">
        <button
          type="button"
          class="inline-flex items-center justify-center w-4 h-4 rounded-full text-vsc-desc/45 hover:text-vsc-link focus-visible:text-vsc-link transition-colors cursor-help outline-none"
          aria-label={description}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
          >
            <circle cx="12" cy="12" r="9.5" /><line x1="12" y1="11" x2="12" y2="16" /><line
              x1="12"
              y1="7.5"
              x2="12.01"
              y2="7.5"
            />
          </svg>
        </button>
        <span
          role="tooltip"
          class="pointer-events-none absolute left-0 top-full mt-1.5 z-50 w-[240px] max-w-[calc(100vw-20px)] rounded-md border border-vsc-card-border bg-vsc-card-bg px-2.5 py-2 text-meta leading-snug text-vsc-fg shadow-lg opacity-0 translate-y-[-2px] transition-[opacity,transform] duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0"
        >
          {description}
        </span>
      </span>
    {/if}
    {#if countLabel}
      <span
        class="ml-auto shrink-0 inline-flex items-center px-1.5 py-px rounded-md bg-accent-soft text-vsc-link text-meta font-semibold tabular-nums"
      >
        {countLabel}
      </span>
    {/if}
  </header>
  <div class="flex-1 min-h-0">
    {@render children()}
  </div>
</section>

<style>
  /* keyframe used by the header fade-in. Tailwind v4 doesn't ship a built-in
     fadeIn so we define it once here; the utility class is composed via
     arbitrary value above. */
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-2px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
