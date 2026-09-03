<script lang="ts">
  import { IconButton, Surface } from '$atoms';
  import { IconAlertCircle, IconAlertTriangle, IconCheck, IconClose, IconInfo } from '$icons';
  import { toastState, type ToastKind } from '$lib/state/toast.svelte';

  type IconCircleStyle = { bg: string; fg: string };

  const ICON_STYLE: Record<ToastKind, IconCircleStyle> = {
    success: { bg: 'bg-fk-soft', fg: 'text-fk' },
    error: { bg: 'bg-danger-soft', fg: 'text-danger' },
    warning: { bg: 'bg-o2o-soft', fg: 'text-o2o' },
    info: { bg: 'bg-accent-soft', fg: 'text-vsc-link' },
  };

  const kind = $derived<ToastKind>(toastState.payload?.kind ?? 'success');
  const style = $derived(ICON_STYLE[kind]);
</script>

<div
  class="fixed bottom-6 right-6 z-toast w-[360px] max-w-[calc(100vw-3rem)]
         transition-[opacity,transform] duration-fast ease-out-expo
         {toastState.visible
    ? 'opacity-100 translate-y-0 pointer-events-auto'
    : 'opacity-0 translate-y-2 pointer-events-none'}"
  role="status"
  aria-live="polite"
>
  {#if toastState.payload}
    <Surface kind="popover" class="relative px-4 py-3 flex items-start gap-3 shadow-elevation-3">
      <div class="shrink-0 mt-0.5">
        <span
          class="inline-flex items-center justify-center w-7 h-7 rounded-full {style.bg} {style.fg}"
        >
          {#if kind === 'success'}
            <IconCheck size={16} />
          {:else if kind === 'error'}
            <IconAlertCircle size={16} />
          {:else if kind === 'warning'}
            <IconAlertTriangle size={16} />
          {:else}
            <IconInfo size={16} />
          {/if}
        </span>
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-body font-semibold text-vsc-editor-fg leading-snug">
          {toastState.payload.title}
        </div>
        {#if toastState.payload.description}
          <div class="text-label text-vsc-desc mt-0.5 leading-snug">
            {toastState.payload.description}
          </div>
        {/if}
      </div>
      <div class="shrink-0 -mt-1 -mr-1">
        <IconButton size="sm" variant="ghost" title="Dismiss" onclick={() => toastState.dismiss()}>
          <IconClose size={14} />
        </IconButton>
      </div>
    </Surface>
  {/if}
</div>
