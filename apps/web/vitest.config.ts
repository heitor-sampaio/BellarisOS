import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Testes de unidade do app web.
 *
 * Só `tests/**` entra: `e2e/**` é do Playwright, e sem o recorte o Vitest
 * tentaria rodar os testes de navegador como se fossem unitários.
 *
 * `TZ=UTC` é deliberado: o container de produção roda em `America/Sao_Paulo`,
 * mas os helpers de `lib/datetime.ts` não podem depender do fuso do processo —
 * quando dependeram, a agenda abriu no dia errado. Rodar em UTC é o cenário
 * que quebrava; as asserções comparam instantes absolutos (ISO), que não mudam
 * com o fuso de quem roda.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: { TZ: 'UTC' },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      // 'server-only' só existe dentro do bundler do Next: é um pacote que
      // QUEBRA de propósito se alguém importar do cliente. No Vitest ele não
      // resolve, e sem este atalho todo módulo de servidor ficaria fora de
      // teste -- que é o oposto do que se quer para quem fala com o banco.
      'server-only': path.resolve(__dirname, 'tests/vazio.ts'),
    },
  },
})
