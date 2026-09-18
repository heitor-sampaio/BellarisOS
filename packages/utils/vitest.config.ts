import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Formatação de data e moeda é pt-BR com fuso de Brasília fixo: rodar em
    // UTC garante que o helper não está apoiado no fuso do processo.
    env: { TZ: 'UTC' },
  },
})
