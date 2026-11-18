import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { rotuloDaBaseDoLancamento } from '@/lib/comissoes/extrato-texto'
import { OPCOES_DA_BASE_COM_PONTOS } from '@/lib/comissoes/config'
import { contaDoPacoteDeFora } from '@/lib/pacotes/de-fora'
import type { LancamentoDoExtrato } from '@/lib/comissoes/leitura'

/**
 * Itens 10 e 11 das correções da auditoria das regras (2026-11-18) — decisões
 * do Claude pelos princípios, não do Heitor:
 *
 * 10. Na comissão, os pontos seguem a escolha da rede (princípios 2 e 3). Com a
 *     rede em "Sobre o valor pago" (`base_com_pontos = VALOR_PAGO`), os pontos e
 *     o voucher usados saem da base também no pacote, no plano e nas vendas —
 *     antes só no avulso, e a escolha da rede não valia ali. A conta é do banco
 *     (`private.comissao_conta_detalhe`, migration 20261124000201); a tela diz.
 * 11. "R$ fixo por sessão" no pacote trazido de fora paga o fixo, mesmo sem o
 *     valor de referência (princípio 2: o valor que a rede escolheu). O
 *     percentual, sem valor, segue R$ 0 (princípio 4: não se chuta o valor).
 */

const WEB = join(__dirname, '..')
const MIGRATIONS = join(WEB, '..', '..', 'supabase', 'migrations')

const lancamento: LancamentoDoExtrato = {
  id: 'l1', professionalId: 'p1', branchId: 'b1', releasedAt: '2026-11-18T13:00:00Z', kind: 'LIBERACAO', motivo: null, amount: 76,
  status: 'OPEN', payoutId: null, appointmentId: null, scheduledAt: '2026-11-18T13:00:00Z', cliente: 'Rosana', procedimento: null,
  origem: 'PACOTE_VENDA', preco: 800, regraTipo: 'PERCENTAGE', regraValor: 10, pacote: '4 drenagens', descontaTaxa: false, descontaInsumos: false,
  previsto: null, baseComPontos: 'VALOR_PAGO', plano: null, base: 760, baseDesconto: 40, baseTaxa: 0, baseInsumos: 0, baseFator: 1, pagoEm: null,
  regraDe: 'ITEM',
}

describe('10: os pontos seguem a escolha da rede em toda comissão', () => {
  it('o extrato da venda do pacote com "Sobre o valor pago" diz que os pontos saíram da base', () => {
    expect(rotuloDaBaseDoLancamento(lancamento)).toBe('base sem os pontos e o voucher usados (sem taxa nem insumo descontados)')
  })
  it('a sessão do pacote, a venda do plano e a do produto também', () => {
    for (const origem of ['PACOTE', 'PLANO_VENDA', 'PLANO', 'PRODUTO', 'PRE_PAGO_VENDA'] as const) {
      expect(rotuloDaBaseDoLancamento({ ...lancamento, origem }), origem).toContain('sem os pontos e o voucher usados')
    }
  })
  it('com "Sobre o preço", os pontos ficam na base, como antes', () => {
    expect(rotuloDaBaseDoLancamento({ ...lancamento, baseComPontos: 'PRECO' }))
      .toBe('base cheia (sem taxa nem insumo descontados; os pontos e o voucher usados não saem dela)')
  })
  it('Configurações → Comissões diz que a escolha vale no atendimento, nas sessões e nas vendas', () => {
    expect(OPCOES_DA_BASE_COM_PONTOS.VALOR_PAGO.explicacao).toContain('nas sessões de pacote e de plano e nas vendas')
    expect(OPCOES_DA_BASE_COM_PONTOS.PRECO.explicacao).toContain('nas sessões de pacote e de plano e nas vendas')
    expect(OPCOES_DA_BASE_COM_PONTOS.PRECO.label).toBe('Sobre o preço')
    expect(OPCOES_DA_BASE_COM_PONTOS.VALOR_PAGO.label).toBe('Sobre o valor pago')
  })
  it('a conta do banco tira os pontos da base da venda na proporção da linha', () => {
    const arquivo = readdirSync(MIGRATIONS).find(f => f.startsWith('20261124000201'))
    expect(arquivo, 'a migration 20261124000201').toBeTruthy()
    const sql = readFileSync(join(MIGRATIONS, arquivo!), 'utf8')
    expect(sql).toContain('create or replace function private.comissao_conta_detalhe')
    // O ramo das vendas lê os pontos dos lançamentos pagos da venda…
    expect(sql).toMatch(/coalesce\(sum\(f\.loyalty_discount\), 0\)\s+into v_recebido, v_quitado, v_taxa, v_fid_venda/)
    // …e, com a rede em "Sobre o valor pago", tira a parte da linha.
    expect(sql).toMatch(/v_l\.base_com_pontos = 'VALOR_PAGO'/)
    expect(sql).toContain('v_desconto := round(v_fid_venda * least(1, v_l.preco / v_cheio_venda), 2)')
    expect(sql.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})

// ─── 11: o banco de mentira para linhasDoAtendimento ────────────────────────
type Resultado = { data: unknown; error: { message: string } | null }
let responder: (tabela: string) => Resultado = () => ({ data: [], error: null })
function construtor(tabela: string) {
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'neq', 'in', 'is', 'not', 'or', 'order', 'range', 'limit', 'maybeSingle', 'single']) b[op] = () => b
  b.then = (ok: (r: Resultado) => unknown, falhou?: (e: unknown) => unknown) => Promise.resolve(responder(tabela)).then(ok, falhou)
  return b
}
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor }) }))
beforeEach(() => { responder = () => ({ data: [], error: null }) })

const PROC = '11111111-1111-4111-8111-111111111111'
const PROF = '22222222-2222-4222-8222-222222222222'
function semValorDeReferencia(regra: { type: 'PERCENTAGE' | 'FIXED_AMOUNT'; value: number }) {
  responder = tabela => {
    if (tabela === 'commission_rules') {
      return { data: [{ professional_id: PROF, procedure_id: null, type: regra.type, value: regra.value }], error: null }
    }
    if (tabela === 'package_sessions') {
      return { data: { procedure_id: PROC, preco: null, client_packages: {
        price: null, total_sessions: 3, comissao_execucao: 'REGRA', comissao_execucao_valor: null, de_fora: true,
        service_packages: { price: 0, total_sessions: 3, procedure_id: PROC },
      } }, error: null }
    }
    return { data: [], error: null }
  }
}
const atendimento = { id: 'ap1', procedure_id: PROC, professional_id: PROF, price: 0, treatment_plan_id: null }

describe('11: "R$ fixo por sessão" no pacote de fora sem valor de referência', () => {
  it('a regra de R$ fixo vira a linha, com o fixo', async () => {
    semValorDeReferencia({ type: 'FIXED_AMOUNT', value: 25 })
    const { linhasDoAtendimento } = await import('@/lib/comissoes/leitura')
    expect(await linhasDoAtendimento('rede', atendimento)).toEqual([{
      procedure_id: PROC, origem: 'PACOTE', treatment_plan_id: null, regra_tipo: 'FIXED_AMOUNT', regra_valor: 25, preco: 0,
    }])
  })
  it('o percentual sem valor segue sem linha (R$ 0 — não se chuta o valor)', async () => {
    semValorDeReferencia({ type: 'PERCENTAGE', value: 10 })
    const { linhasDoAtendimento } = await import('@/lib/comissoes/leitura')
    expect(await linhasDoAtendimento('rede', atendimento)).toEqual([])
  })
  it('a janela de trazer diz que o fixo é pago e o percentual não', () => {
    expect(contaDoPacoteDeFora({ total: 3, usadas: 0, valor: null })!.valor).toBe(
      'Sem valor de referência, as sessões trazidas não entram na receita dos atendimentos, e a comissão de execução em percentual é R$ 0. A de R$ fixo por sessão é paga.',
    )
  })
})
