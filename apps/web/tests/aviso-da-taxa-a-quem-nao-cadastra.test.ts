import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { avisoDoDreSemTaxa } from '@/lib/financeiro/vendas-sem-taxa'

/**
 * D6 da 34ª simulação (MQ-10: "A quem não cadastra a taxa (quem não é a Admin
 * da rede), o aviso de taxa faltando diz quem cadastra, pelo nome das Admins da
 * rede ativas"; a taxa é configuração da rede toda, o Heitor, 2026-11-18:
 * "Configuração da rede toda só pela conta admin"): o aviso do DRE (Relatórios
 * → Financeiro) e o do Financeiro mandavam "Cadastre a taxa em Configurações →
 * Comissões e taxas" a quem tem o PDV e o Financeiro e não muda a taxa. O PDV já
 * dizia os nomes (A5 da 16ª, `textoDeQuemCadastraATaxa`); os dois avisos agora
 * também.
 */
const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')
const sp = (s: string | null) => (s ?? '').replace(/\s+/g, ' ')
const debito = [{ metodo: 'DEBIT_CARD', vezes: 1, bandeira: null, vendas: 2, valor: 1000 }]

describe('o aviso da venda sem taxa a quem não cadastra a taxa', () => {
  it('o DRE diz quem cadastra, sem o caminho das Configurações', () => {
    const texto = sp(avisoDoDreSemTaxa(debito, ['Otávio Jasmim']))
    expect(texto).toContain('Débito: 2 vendas, R$ 1.000,00.')
    expect(texto).toMatch(/Quem cadastra: Otávio Jasmim\.$/)
    expect(texto).not.toContain('Configurações')
    expect(sp(avisoDoDreSemTaxa(debito, []))).toMatch(/Quem cadastra é a Admin da rede\.$/)
  })

  it('a quem cadastra, o caminho continua', () => {
    expect(sp(avisoDoDreSemTaxa(debito, null))).toMatch(/Cadastre a taxa em Configurações → Comissões e taxas\.$/)
  })

  it('o aviso do Financeiro usa o texto de quem cadastra', () => {
    const f = fonte('components/shared/caixa-no-financeiro.tsx')
    expect(f).toMatch(/textoDeQuemCadastraATaxa\(/)
    expect(f).not.toMatch(/Cadastre a taxa em Configurações → Comissões e taxas\.<\/span>/)
  })

  it('as telas que mostram o aviso leem quem cadastra no servidor', () => {
    for (const arquivo of ['app/admin/financeiro/page.tsx', 'app/[slug]/financeiro/page.tsx', 'components/admin/reports-bi-section.tsx'])
      expect(fonte(arquivo), arquivo).toMatch(/quemCadastraATaxa\((ctx|ctxDoCargo)\)/)
    expect(fonte('lib/financeiro/quem-cadastra-a-taxa-no-servidor.ts')).toMatch(/mexeNaConfigDaRede\(ctx\)/)
  })
})
