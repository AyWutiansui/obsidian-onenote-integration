import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    deps: {
      inline: [],
    },
  },
  resolve: {
    alias: {
      // Stub out modules that are external in the Obsidian/Electron runtime
      obsidian: './tests/__mocks__/obsidian.ts',
      electron: './tests/__mocks__/electron.ts',
    },
  },
});
