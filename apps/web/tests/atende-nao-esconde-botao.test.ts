import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * CLAUDE.md §11: "O 'Atende' não dá permissão nenhuma" — e não esconde nem
 * mostra botão nenhum (decisão do Claude, 25/11, D11 da 29ª). A tela do
 * atendimento escondia o "Enviar o link" da ficha nunca respondida (e o
 * bloco do profissional, com o "trocar profissional") de quem atende, pelo
 * `ctx.providesServices`. O que decide é a permissão: a Agenda em Gerenciar
 * manda o link (`gerarLinkDoPreAtendimento`), o `canReassign` troca a
 * profissional.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('o "Atende" não esconde botão na tela do atendimento', () => {
  it('a página não passa o "Atende" à tela', () => {
    expect(fonte('app/_shared/sessao-de-atendimento.tsx')).not.toContain('isProfessional={ctx.providesServices}')
  })

  it('a tela não decide nada pelo "Atende"', () => {
    expect(fonte('components/branch/appointment-session.tsx')).not.toMatch(/isProfessional/)
  })

  it('o "Enviar o link" é da Agenda em Gerenciar, e só', () => {
    const s = fonte('components/branch/appointment-session.tsx')
    expect(s).toMatch(/\{podeGerenciarAgenda && \(\s*<button type="button" data-enviar-o-link-da-ficha/)
    expect(s).toContain('podeMandar={podeGerenciarAgenda}')
  })
})
