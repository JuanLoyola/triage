/**
 * Drifting blue gradient background.
 *
 * Deliberately CSS rather than GSAP. This animates forever, and doing it in CSS
 * lets the compositor handle it off the main thread; a GSAP tween here would keep
 * a requestAnimationFrame loop alive for the whole page lifetime. GSAP is used
 * for the discrete transitions instead.
 *
 * Kept faint on purpose. The brief was low-glare light mode, so the opacities are
 * low and the colors are desaturated: enough to give the page some life, not
 * enough to compete with the text or strain the eyes.
 */
export function GradientBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Three large, soft radial washes that drift on long, offset cycles. */}
      <div className="absolute -left-[20%] -top-[25%] h-[70vmax] w-[70vmax] animate-drift-a rounded-full bg-[radial-gradient(circle,rgba(56,139,199,0.20),transparent_65%)] blur-3xl" />
      <div className="absolute -right-[15%] top-[5%] h-[60vmax] w-[60vmax] animate-drift-b rounded-full bg-[radial-gradient(circle,rgba(99,140,214,0.16),transparent_65%)] blur-3xl" />
      <div className="absolute bottom-[-30%] left-[20%] h-[65vmax] w-[65vmax] animate-drift-c rounded-full bg-[radial-gradient(circle,rgba(125,178,222,0.15),transparent_65%)] blur-3xl" />

      {/* A faint grid keeps the blur from reading as a flat wash. */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:56px_56px]" />
    </div>
  );
}
