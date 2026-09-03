/**
 * Global test setup. Runs for every vitest file (node + jsdom), so every
 * shim below must guard on the API actually existing in the environment.
 */

// jsdom implements neither the Web Animations API nor scrollIntoView; Svelte 5
// transitions (transition:slide on TreeNode) call element.animate() and would
// crash component mount tests otherwise. Minimal inert stubs are enough — we
// assert DOM state, never animation frames.
if (typeof Element !== 'undefined') {
  if (!Element.prototype.animate) {
    Element.prototype.animate = function animate(): Animation {
      const anim = {
        onfinish: null as (() => void) | null,
        oncancel: null as (() => void) | null,
        currentTime: 0,
        playbackRate: 1,
        pending: false,
        finished: Promise.resolve(),
        cancel(): void {
          /* noop */
        },
        finish(): void {
          this.onfinish?.();
        },
        play(): void {
          /* noop */
        },
        pause(): void {
          /* noop */
        },
        reverse(): void {
          /* noop */
        },
      };
      // Svelte assigns onfinish and expects it to eventually fire.
      queueMicrotask(() => anim.onfinish?.());
      return anim as unknown as Animation;
    };
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView(): void {
      /* noop */
    };
  }
}

// jsdom has no matchMedia; the diagram Toolbar uses it for its responsive
// tab list. A never-matching stub keeps the wide-toolbar branch rendered.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {
        /* noop */
      },
      removeEventListener: () => {
        /* noop */
      },
      addListener: () => {
        /* noop */
      },
      removeListener: () => {
        /* noop */
      },
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
