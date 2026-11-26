import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const fonte = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8')

/**
 * A25: o detalhe da campanha dizia o canal com dois nomes — "Aviso no
 * celular" no aviso e "In-app" na linha "Canal" (princípio 3; automacoes CP-04:
 * "A campanha é aviso no celular (push), e a tela diz isso").
 */
describe('A25: o canal da campanha tem um nome só', () => {
  it('o detalhe diz "Aviso no celular" na linha do canal', () => {
    const t = fonte('app/admin/notificacoes/[id]/page.tsx')
    expect(t).not.toMatch(/In-app/)
    expect(t).toMatch(/<InfoRow label="Canal"\s+value="Aviso no celular" \/>/)
  })
})

/**
 * A26 (automacoes CP-02/CP-03): a campanha de todo ano sai numa data igual
 * para todas (o Dia das Mães); o aniversário de CADA cliente — a data de
 * nascimento da ficha — é o modelo das Automações. A tela de criar não dizia
 * de onde vem a data; a dica do "Todo ano em" diz. E a busca de
 * aniversariantes diz quantas fichas não têm a data de nascimento (nunca
 * entram).
 *
 * Os exemplos do nome e do título são do Dia das Mães (o Heitor, 25/11,
 * escolheu "Exemplos do Dia das Mães"): "ex: Aniversariantes de julho" e
 * "ex: Feliz aniversário…" sugeriam o aniversário, que não é campanha. Os
 * specs E2E que acham os campos pelo exemplo foram trocados junto.
 */
describe('A26: de onde vem a data', () => {
  it('a campanha diz que a data de todo ano é a mesma para todas', () => {
    const t = fonte('components/admin/notification-campaign-form.tsx')
    expect(t).toMatch(/data de nascimento da ficha/)
  })
  it('os exemplos do nome e do título são do Dia das Mães', () => {
    const t = fonte('components/admin/notification-campaign-form.tsx')
    expect(t).toContain('placeholder="ex: Dia das Mães"')
    expect(t).toContain('placeholder="ex: Feliz Dia das Mães, {{first_name}}!"')
    expect(t).not.toMatch(/Aniversariantes de julho|Feliz aniversário/)
  })
  it('a busca de aniversariantes conta as fichas sem a data de nascimento', () => {
    expect(fonte('actions/automacoes.ts')).toMatch(/\.is\('birth_date', null\)/)
    expect(fonte('components/admin/automacoes/painel-do-no.tsx')).toMatch(/semNascimento/)
  })
})

/**
 * D14 (Relatórios → Estoque): o cabeçalho conta os PRODUTOS sem saldo em
 * nenhuma unidade (D19 da 8ª, atendimento.md) e a tabela, os sem saldo em CADA
 * unidade — duas perguntas, uma fonte (metrics_relatorio). A tabela diz qual
 * é a dela, para a soma das linhas não parecer o número de cima.
 */
describe('D14: a tabela por unidade diz o que conta', () => {
  it('a Saúde do Estoque por Unidade tem a dica do "Zerados" de cada unidade', () => {
    const t = fonte('components/admin/reports-bi-view.tsx')
    expect(t).toMatch(/title="Saúde do Estoque por Unidade"[^>]*rotuloDoSobre=/)
  })
})
