import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Os atritos da 25ª simulação (2026-11-18) da ficha, da importação, do app da
 * cliente e do estoque que se provam sem tela.
 *
 * A15 (princípio 7): os "Próximos agendamentos" da ficha não diziam a
 * unidade, na rede de duas ou mais (o precedente: os avisos, A28 da 6ª).
 * A22 (princípio 3): a importação sem a coluna "Cliente desde" não avisava que
 * as fichas contam como clientes novas a partir de hoje.
 * A26 (princípio 3): o extrato de pontos do app não dizia a recompensa trocada
 * (a ficha da equipe diz, pela descrição — A41 da 12ª).
 * A27 (princípio 3): o "Estoque mínimo" do cadastro do produto não dizia que
 * só vale para a unidade em que o produto ainda não entrou.
 */

const ler = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('A15: os próximos agendamentos da ficha dizem a unidade (rede de duas ou mais)', () => {
  it('a unidade do agendamento, só com mais de uma', async () => {
    const { unidadeNaFicha } = await import('@/lib/clientes/unidade-na-ficha')
    const duas = [{ id: 'u1', name: 'Moinhos' }, { id: 'u2', name: 'Centro' }]
    expect(unidadeNaFicha('u2', duas)).toBe('Centro')
    expect(unidadeNaFicha('u1', [{ id: 'u1', name: 'Moinhos' }])).toBeNull()
    expect(unidadeNaFicha(null, duas)).toBeNull()
    expect(unidadeNaFicha('u9', duas)).toBeNull()
  })
  it('a ficha leva a unidade do agendamento e a mostra na linha', () => {
    expect(ler('components/branch/client-profile.tsx')).toMatch(/unidadeNaFicha\(a\.branchId, branches\)/)
    for (const p of ['app/[slug]/clients/[id]/page.tsx', 'app/admin/clients/[id]/page.tsx']) {
      expect(ler(p), p).toMatch(/branchId:\s+\(a\.branch_id as string \| null\) \?\? null/)
    }
  })
})

describe('A22: a importação sem "Cliente desde" avisa que as fichas contam como novas', () => {
  it('o aviso', async () => {
    const { avisoSemClienteDesde } = await import('@/lib/importacao/o-que-entra')
    expect(avisoSemClienteDesde('clientes', ['name', 'phone', 'ultima_visita']))
      .toBe('Sem uma coluna em “Cliente desde”, as fichas novas contam como clientes novas a partir de hoje (em “Novos clientes” e no selo “Novo”).')
    expect(avisoSemClienteDesde('clientes', ['name', 'phone', 'cliente_desde'])).toBeNull()
    expect(avisoSemClienteDesde('contatos', ['name', 'phone'])).toBeNull()
  })
  it('a prévia o mostra', () => {
    const f = ler('components/branch/importador-de-contatos.tsx')
    expect(f).toContain('avisoSemClienteDesde(destino, mapa)')
    expect(f).toContain('data-sem-cliente-desde')
  })
})

describe('A26: o extrato do app diz a recompensa trocada', () => {
  it('a linha de baixo para a cliente: a troca e o uso no pagamento, nunca o motivo do ajuste da equipe', async () => {
    const { descricaoParaACliente } = await import('@/lib/fidelidade/formato')
    expect(descricaoParaACliente('VOUCHER', 'Recompensa: Limpeza de pele')).toBe('Recompensa: Limpeza de pele')
    expect(descricaoParaACliente('RESGATE', 'Desconto no pagamento: R$ 10,00')).toBe('Desconto no pagamento: R$ 10,00')
    expect(descricaoParaACliente('AJUSTE', 'Cliente reclamou do atendimento')).toBeNull()
    expect(descricaoParaACliente('VOUCHER', null)).toBeNull()
  })
  it('o extrato do app usa a linha', () => {
    expect(ler('app/[slug]/cliente/fidelidade/page.tsx')).toMatch(/descricaoParaACliente\(l\.kind, l\.description\)/)
  })
})

describe('A27: o mínimo do cadastro diz quando vale', () => {
  it('a dica ao lado do "Estoque mínimo" do produto', () => {
    const f = ler('components/branch/stock-product-modal.tsx')
    expect(f).toContain('data-minimo-padrao')
    expect(f).toMatch(/Vale para a unidade quando o produto entra nela\. Depois, cada unidade tem o seu, na aba “Estoque mínimo” do produto\./)
  })
})
