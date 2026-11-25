import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Na sessão de suporte o editor da automação só lê e só pausa, mas o ENSAIO
 * continua (`docs/regras/automacoes.md`: "O ensaio continua (não grava nem
 * manda nada)"). O "Ensaiar com o último fato" seguia o `podeEditar`, que é
 * falso no suporte, e sumia da tela.
 */
const fonte = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8')

describe('o suporte ensaia a automação', () => {
  it('a página dá o ensaio a quem gerencia, também na sessão de suporte', () => {
    const t = fonte('app/admin/automacoes/[id]/page.tsx')
    expect(t).toMatch(/podeEnsaiar=\{gerencia\}/)
  })
  it('o editor leva o ensaio ao painel de execuções, à parte do editar', () => {
    const t = fonte('components/admin/automacoes/editor.tsx')
    expect(t).toMatch(/<PainelDeExecucoes[\s\S]*?podeEnsaiar=\{podeEnsaiar\}/)
  })
  it('o botão do ensaio segue o podeEnsaiar', () => {
    const t = fonte('components/admin/automacoes/painel-de-execucoes.tsx')
    expect(t).toMatch(/\{podeEnsaiar && \(\s*<div[\s\S]*?Ensaiar com o último fato/)
  })
})
