import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['cli/**/*.test.ts', 'src/**/*.test.ts', 'electron/**/*.test.ts', 'shared/**/*.test.ts'],
  },
});
