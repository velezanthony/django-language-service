// Show the "Space + drag to pan" hint briefly on first paint so users discover
// the interaction. The hint element is part of the static HTML and its fade
// in/out is driven by toggling `data-visible="true"`, which Tailwind's
// data-attribute modifier reacts to with `data-[visible=true]:opacity-100`.

const HINT_VISIBLE_MS = 3500;

export const showPanHintOnce = (): void => {
  const hint = document.getElementById('pan-hint');
  if (!hint) return;
  requestAnimationFrame(() => hint.setAttribute('data-visible', 'true'));
  setTimeout(() => hint.removeAttribute('data-visible'), HINT_VISIBLE_MS);
};
