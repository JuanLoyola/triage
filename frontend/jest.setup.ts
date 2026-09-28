import "@testing-library/jest-dom";

/**
 * jsdom does not implement matchMedia, and the dashboard reads
 * `prefers-reduced-motion` to decide whether to animate. Without this the GSAP
 * guards blow up in every component test.
 */
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
