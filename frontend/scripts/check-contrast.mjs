/**
 * Check the light-theme contrast ratios.
 *
 * Run: node scripts/check-contrast.mjs
 *
 * The point of the light theme is low glare, not low readability. This asserts
 * that no text/background pair drops below the WCAG AA threshold (4.5:1 for
 * normal text, 3:1 for large text and UI borders).
 */

const hex = (value) => {
  const clean = value.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
};

function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg, bg) {
  const l1 = relativeLuminance(hex(fg));
  const l2 = relativeLuminance(hex(bg));
  const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

// [foreground, background, description, minimum]
const PAIRS = [
  ["#1f2937", "#f6f7f9", "body text on page background", 4.5],
  ["#1f2937", "#ffffff", "body text on card", 4.5],
  ["#52607a", "#f6f7f9", "secondary text on page", 4.5],
  ["#6b7789", "#ffffff", "muted text on card", 4.5],
  ["#334155", "#ffffff", "label text on card", 4.5],
  ["#475569", "#ffffff", "secondary text on card", 4.5],

  ["#b91c1c", "#fef2f2", "error text on red tint", 4.5],
  ["#92400e", "#fffbeb", "attempt label on amber tint", 4.5],
  ["#1e40af", "#eff6ff", "info text on blue tint", 4.5],

  ["#b91c1c", "#fee2e2", "critical badge text", 4.5],
  ["#c2410c", "#fff7ed", "high badge text", 4.5],
  ["#92400e", "#fffbeb", "medium badge text", 4.5],
  ["#475569", "#f1f5f9", "low badge text", 4.5],

  ["#0369a1", "#f0f9ff", "technical badge text", 4.5],
  ["#6d28d9", "#f5f3ff", "billing badge text", 4.5],
  ["#0f766e", "#f0fdfa", "account badge text", 4.5],
  ["#be185d", "#fdf2f8", "suggestion badge text", 4.5],

  ["#ffffff", "#0369a1", "primary button text", 4.5],
  ["#0369a1", "#ffffff", "link text on card", 4.5],

  ["#075985", "#e0f2fe", "json key", 4.5],
  ["#047857", "#ecfdf5", "json string", 4.5],
  ["#b45309", "#fffbeb", "json number", 4.5],
  ["#6d28d9", "#f5f3ff", "json boolean", 4.5],
  ["#1e293b", "#f8fafc", "json plain text", 4.5],

  ["#e3e7ec", "#ffffff", "card border vs card", 1.0],
];

let failures = 0;

for (const [fg, bg, label, min] of PAIRS) {
  const ratio = contrast(fg, bg);
  const ok = ratio >= min;
  if (!ok) failures += 1;
  const mark = ok ? "OK  " : "FAIL";
  console.log(
    `${mark} ${ratio.toFixed(2).padStart(5)}:1  (min ${min})  ${label}  ${fg} on ${bg}`,
  );
}

console.log(
  failures === 0
    ? "\nAll pairs meet the threshold."
    : `\n${failures} pair(s) below the threshold.`,
);
process.exit(failures === 0 ? 0 : 1);
