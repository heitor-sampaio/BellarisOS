import { describe, it, expect } from 'vitest'
import { composicaoDaBase, textoDaBase } from '../lib/comissoes/base-efetiva'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'

// D3 da 10ª simulação: o extrato diz a base que a conta usou, e o caminho do preço até ela.
const nb = (s: string) => s.replace(/ /g, ' ')
describe('a base efetiva da comissão na tela', () => {
  it('sem a taxa: a base e o que saiu', () => {
    const l = { preco: 420, base: 413.7, baseDesconto: 0, baseTaxa: 6.3, baseInsumos: 0, baseFator: 1 }
    expect(nb(textoDaBase('base sem a taxa da maquininha', l))).toBe('base sem a taxa da maquininha: R$ 413,70 (R$ 420,00 − R$ 6,30 da taxa)')
  })
  it('o plano cancelado: a proporção do que ficou', () => {
    const l = { preco: 1700, base: 700, baseDesconto: 0, baseTaxa: 0, baseInsumos: 0, baseFator: 700 / 1700 }
    expect(nb(composicaoDaBase(l))).toBe('R$ 1.700,00, na proporção do que ficou (41,2%)')
  })
  it('base cheia: só o valor, sem caminho', () => {
    const l = { preco: 150, base: 150, baseDesconto: 0, baseTaxa: 0, baseInsumos: 0, baseFator: 1 }
    expect(nb(textoDaBase('base cheia', l))).toBe('base cheia: R$ 150,00')
  })
  it('desconto, taxa e insumos juntos', () => {
    const l = { preco: 260, base: 200, baseDesconto: 20, baseTaxa: 4.8, baseInsumos: 35.2, baseFator: 1 }
    expect(nb(composicaoDaBase(l))).toBe('R$ 260,00 − R$ 20,00 de desconto − R$ 4,80 da taxa − R$ 35,20 de insumos')
  })
})

describe('o cancelamento do pacote ou do plano acerta a comissão uma vez, com o dinheiro do fim (comissoes.md)', () => {
  const WEB = nodePath.join(__dirname, "..")
  const MIGRATIONS = nodePath.join(WEB, "..", "..", "supabase", "migrations")
  const migrations = () => nodeFs.readdirSync(MIGRATIONS).filter(f => f.endsWith(".sql")).sort()
  /** A migration mais nova que mexe no que o trecho diz. */
  const ultimaCom = (trecho: string) => {
    const achou = migrations().filter(f => nodeFs.readFileSync(nodePath.join(MIGRATIONS, f), "utf8").includes(trecho))
    return achou.length ? { nome: achou.at(-1)!, sql: nodeFs.readFileSync(nodePath.join(MIGRATIONS, achou.at(-1)!), "utf8") } : null
  }

  // ─── a liberação do cancelamento com o dinheiro do fim ────────────────
  describe('a migration que adia a comissão do cancelamento', () => {
    it('o pacote e o plano não acertam antes de o dinheiro mexer, e o gatilho espera o fim', () => {
      const m = ultimaCom('bellaris.comissao_adiada')
      expect(m, 'nenhuma migration adia a comissão do cancelamento').not.toBeNull()
      expect(m!.nome >= '20261130100001').toBe(true)
      // O passo 4 ("o dinheiro ainda não mexeu") sai das duas funções.
      expect(m!.sql).toContain('o dinheiro ainda não mexeu')
      expect(m!.sql).toContain('public.pacote_cancelar_devolvendo')
      expect(m!.sql).toContain('public.plano_cancelar_devolvendo')
      // O gatilho do pagamento não acerta a venda que está sendo cancelada.
      expect(m!.sql).toContain('private.comissoes_do_pagamento')
      expect(m!.sql).toMatch(/current_setting\('bellaris\.comissao_adiada', true\)/)
      // Convenções: o helper com create or replace, o reload no fim.
      expect(m!.sql).toContain('create or replace function pg_temp.trocar_no_corpo')
      expect(m!.sql).not.toMatch(/create function pg_temp\./)
      expect(m!.sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
    })
    it('é a migration mais nova das três funções', () => {
      const m = ultimaCom('bellaris.comissao_adiada')!.nome
      // O Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito." — acima de 12 vezes avisa.
      // A 20261206800001 troca só o trecho das vezes no corpo VIVO (trocar_no_corpo): o que esta pôs fica.
      const das12 = '20261206800001_cartao_acima_de_12_vezes.sql'
      expect([m, das12]).toContain(ultimaCom('pacote_cancelar_devolvendo')!.nome)
      expect([m, das12]).toContain(ultimaCom('plano_cancelar_devolvendo')!.nome)
      const sql12 = nodeFs.readFileSync(nodePath.join(MIGRATIONS, das12), 'utf8')
      expect(sql12).not.toMatch(/create (or replace )?function public\.(pacote|plano)_cancelar_devolvendo/)
      expect(ultimaCom('comissoes_do_pagamento')!.nome).toBe(m)
    })
  })

})
