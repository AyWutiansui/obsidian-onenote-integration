/**
 * Vitest setup file — runs before each test file.
 *
 * We do NOT use vi.mock() here because the obsidian/electron modules are
 * resolved via aliases in vitest.config.ts to our hand-written mock files.
 * This file is reserved for any additional global test helpers or polyfills.
 */

// Ensure DOMParser is available for XML parsing tests (jsdom environment)
if (typeof DOMParser === 'undefined') {
  // In node environment tests, DOMParser won't be available.
  // Tests that need it should use // @vitest-environment jsdom
}
