<script lang="ts">
  import type { Snippet } from 'svelte';

  type Tone = 'plain' | 'recessed';

  type Props = {
    /** Apply a top border — used for rows after the first. */
    divider?: boolean;
    /**
     * Background variant for the row:
     *   - 'plain' (default): inherits the toolbar bg
     *   - 'recessed': slightly darker tint, pulls the row visually 'below' the
     *     toolbar surface. Used for the action shelf at the bottom.
     */
    tone?: Tone;
    children: Snippet;
  };

  let { divider = false, tone = 'plain', children }: Props = $props();

  const TONE_CLS: Record<Tone, string> = {
    plain: '',
    recessed: 'bg-vsc-bg/35',
  };
</script>

<div
  class="flex items-center gap-3 px-4 py-2.5 flex-wrap {divider
    ? 'border-t border-white/[0.04]'
    : ''} {TONE_CLS[tone]}"
>
  {@render children()}
</div>
