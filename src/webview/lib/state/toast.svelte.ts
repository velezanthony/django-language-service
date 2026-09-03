// Toast notification state — driven by `showToast(...)` from
// $lib/helpers/exports. The Toast organism in App.svelte renders the visible
// surface from this state and dismisses automatically after `duration` ms.

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export type ToastPayload = {
  title: string;
  description?: string;
  kind?: ToastKind;
  /** Auto-dismiss after this many ms. Defaults to 3500ms. */
  duration?: number;
};

class ToastState {
  visible = $state(false);
  payload = $state.raw<ToastPayload | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(payload: ToastPayload): void {
    this.payload = payload;
    this.visible = true;
    if (this.timer) clearTimeout(this.timer);
    const ms = payload.duration ?? 3500;
    this.timer = setTimeout(() => {
      this.visible = false;
    }, ms);
  }

  dismiss(): void {
    this.visible = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export const toastState = new ToastState();
