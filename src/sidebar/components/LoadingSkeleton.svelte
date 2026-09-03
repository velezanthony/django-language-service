<script lang="ts">
  type Props = {
    /** How many shimmer rows to render. Defaults to a count that fills a
     *  typical Django app's section without ever feeling too dense. */
    rows?: number;
  };

  let { rows = 5 }: Props = $props();
</script>

<!--
  Shimmer rows of varying width, each with a small animation-delay so the
  highlight cascades naturally instead of pulsing in lockstep. Used while
  the extension scan is producing the first data payload — keeps the panel
  feeling alive instead of empty.

  The shimmer is built from a 3-stop linear gradient (base → highlight →
  base) sized 200% wide; the `shimmer` keyframe slides the gradient across
  via background-position. Falls back to a static bar under
  `prefers-reduced-motion`.
-->
<div class="flex flex-col gap-2 pt-1" aria-hidden="true">
  {#each Array(rows) as _, i (i)}
    <div
      class="h-[18px] rounded-md motion-safe:animate-[shimmer_1.6s_ease-in-out_infinite]"
      style="
        width: {Math.max(40, 100 - i * 10)}%;
        animation-delay: {i * 120}ms;
        background-image: linear-gradient(
          90deg,
          var(--color-vsc-card-border) 0%,
          color-mix(in srgb, var(--color-vsc-card-border) 55%, white 18%) 50%,
          var(--color-vsc-card-border) 100%
        );
        background-size: 200% 100%;
        background-color: color-mix(in srgb, var(--color-vsc-card-border) 80%, transparent);
      "
    ></div>
  {/each}
</div>
