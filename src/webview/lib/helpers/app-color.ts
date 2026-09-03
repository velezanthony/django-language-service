// Deterministic colour per Django app label. Same label always gets the same
// hue across reloads, so users can build muscle memory for "the green app is
// blog, the orange one is fleet" without us shipping a fixed palette that
// would only cover N apps.
//
// HSL with fixed saturation + lightness keeps every generated colour at a
// consistent visual weight (not too washed out, not too neon) so the stripes
// don't visually outshout the relation lines.

const SATURATION = 55;
const LIGHTNESS = 62;

const hashCode = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0; // clamp to 32-bit
  }
  return Math.abs(h);
};

export const appColor = (label: string | undefined | null): string => {
  if (!label) return 'transparent';
  const hue = hashCode(label) % 360;
  return `hsl(${hue}, ${SATURATION}%, ${LIGHTNESS}%)`;
};
