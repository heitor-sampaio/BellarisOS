import { defineConfig } from 'vitest/config'
import path from 'node:path'

/** Testes de unidade do suporte (só `tests/**`). Mesmo desenho do apps/web. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: { TZ: 'UTC' },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      // 'server-only' só existe no bundler do Next (ver apps/web/vitest.config.ts).
      'server-only': path.resolve(__dirname, 'tests/vazio.ts'),
    },
  },
})
