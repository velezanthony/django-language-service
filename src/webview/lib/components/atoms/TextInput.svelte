<script lang="ts" module>
  // Module-level counter generates a unique id when the caller provides a
  // `label` but no `id` — needed so the <label for=...> association works.
  // Counter resets per page load, which is fine for our scope.
  let _autoId = 0;
  const nextAutoId = (): string => `text-input-${++_autoId}`;
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';

  type Size = 'sm' | 'md' | 'lg';

  type Props = {
    id?: string;
    value?: string;
    placeholder?: string;
    ariaLabel?: string;
    /** Width in tailwind class form (e.g. 'w-72'). Defaults to fluid. */
    widthClass?: string;
    size?: Size;
    autocomplete?: AutoFill;
    spellcheck?: boolean;
    /** Slot rendered absolute-positioned inside the input on the left. */
    leftAdornment?: Snippet;
    /** Slot rendered absolute-positioned inside the input on the right. */
    rightAdornment?: Snippet;
    oninput?: (e: Event) => void;
    /** Forwarded to the real <input>. Keyboard handling belongs on the
     *  focusable element, not on a wrapper div. */
    onkeydown?: (e: KeyboardEvent) => void;
    /** Visible label rendered above the input. When set without `id`, a
     *  unique id is auto-generated to wire the `for` association. */
    label?: string;
    /** Right-aligned hint shown on the same row as the label
     *  (e.g. "Optional"). Ignored when `label` is unset. */
    corner?: string;
    /** Helper text rendered under the input. Hidden when `error` is set. */
    hint?: string;
    /** Error message rendered under the input. Switches input borders and
     *  focus ring to the danger palette. */
    error?: string;
    /** Bindable reference to the underlying <input> element. Lets a parent
     *  read or focus the real node directly (e.g. to set an uncontrolled
     *  value) instead of a fragile, collision-prone getElementById lookup. */
    inputEl?: HTMLInputElement | null;
  };

  let {
    id,
    value = '',
    placeholder = '',
    ariaLabel,
    widthClass = 'w-full',
    size = 'md',
    autocomplete = 'off',
    spellcheck = false,
    leftAdornment,
    rightAdornment,
    oninput,
    onkeydown,
    label,
    corner,
    hint,
    error,
    inputEl = $bindable(null),
  }: Props = $props();

  // Resolve a stable id once per component instance. Only generates when a
  // visible label is present — bare inputs (no label) skip the auto-id to
  // keep the DOM clean.
  const resolvedId = $derived(id ?? (label ? nextAutoId() : undefined));

  // Padding depends on whether adornments are present. sm/lg variants are
  // sized for compact vs. comfortable inputs.
  const SIZE_BASE: Record<Size, string> = {
    sm: 'py-1.5 text-[11px]',
    md: 'py-2 text-[13px]',
    lg: 'py-2.5 text-sm',
  };
  const PAD_LEFT = $derived(leftAdornment ? 'pl-9' : 'pl-3');
  const PAD_RIGHT = $derived(rightAdornment ? 'pr-9' : 'pr-3');

  // Error styling overrides the neutral border + accent focus ring. We keep
  // hover-border subtly visible so the input still feels interactive.
  const STATE_BORDER = $derived(
    error
      ? 'border-danger/80 hover:border-danger focus:border-danger focus-visible:ring-danger/40'
      : 'border-vsc-card-border/70 hover:border-vsc-card-border focus:border-vsc-link/70 focus-visible:ring-vsc-link/40',
  );
</script>

<div class="flex flex-col gap-1 {widthClass}">
  {#if label}
    <div class="flex items-baseline justify-between gap-2">
      <label for={resolvedId} class="text-label font-medium text-vsc-editor-fg">
        {label}
      </label>
      {#if corner}
        <span class="text-meta text-vsc-desc/70 italic">{corner}</span>
      {/if}
    </div>
  {/if}
  <div class="relative inline-flex items-center group w-full">
    {#if leftAdornment}
      <div
        class="absolute left-3 top-1/2 -translate-y-1/2 text-vsc-desc/70 pointer-events-none
               group-focus-within:text-vsc-link transition-colors duration-fast"
      >
        {@render leftAdornment()}
      </div>
    {/if}
    <input
      bind:this={inputEl}
      type="text"
      id={resolvedId}
      {value}
      {placeholder}
      {autocomplete}
      {spellcheck}
      {onkeydown}
      aria-label={ariaLabel}
      aria-invalid={error ? true : undefined}
      aria-describedby={error
        ? `${resolvedId ?? 'input'}-error`
        : hint
          ? `${resolvedId ?? 'input'}-hint`
          : undefined}
      {oninput}
      class="bg-vsc-bg text-vsc-editor-fg placeholder:text-vsc-desc/55
             border rounded-md font-vsc
             transition-colors duration-fast
             focus-visible:outline-none focus-visible:ring-2
             w-full
             {SIZE_BASE[size]} {PAD_LEFT} {PAD_RIGHT} {STATE_BORDER}"
    />
    {#if rightAdornment}
      <div class="absolute right-2 inset-y-0 flex items-center">
        {@render rightAdornment()}
      </div>
    {/if}
  </div>
  {#if error}
    <div id="{resolvedId ?? 'input'}-error" class="text-meta text-danger leading-snug">
      {error}
    </div>
  {:else if hint}
    <div id="{resolvedId ?? 'input'}-hint" class="text-meta text-vsc-desc/70 leading-snug">
      {hint}
    </div>
  {/if}
</div>
