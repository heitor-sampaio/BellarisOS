import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * A Auditoria não inventa pontos (plataforma:AD-16, princípio 3). A comanda da
 * E03: Drenagem R$ 160 com o voucher de 15% (R$ 24) — sem ponto nenhum na
 * comanda. A frase dizia "R$ 9,00 em pontos": lia o `discount_value` do voucher
 * (15, o PERCENTUAL) como reais e tirava do `loyalty_discount` (R$ 24).
 *
 * A regra: os pontos só entram na frase quando a gravação debitou pontos; e o
 * voucher só se desconta em reais quando o valor dele É em reais (o de valor
 * fixo). O de percentual (e o de procedimento ou produto) não diz quanto
 * abateu: com pontos junto, a frase diz quantos pontos, não um valor chutado.
 */

const sp = (s: string) => s.replace(/[  ]/g, ' ')
let id = 9000
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-25T13:08:32.671Z', branch_id: 'bA', client_id: 'cI', tabela: 'financial_transactions', operacao: 'criou',
  registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Ivete', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = { clientes: { cI: 'Inês' }, membros: {}, unidades: { bA: 'Centro' }, clientesDosPontos: { lt1: 'Inês', lt2: 'Inês' } }

const voucher = (depois: Record<string, unknown>) => r({
  tabela: 'loyalty_vouchers', operacao: 'editou', colunas: ['status', 'used_at', 'used_transaction_id'],
  antes: { status: 'ATIVO' }, depois: { status: 'USADO', ...depois },
})
const recebido = (amount: number, loyalty: number) => r({ registro_id: 'ft1', depois: {
  type: 'INCOME', amount, is_paid: true, paid_at: '2026-11-25T13:08:32Z', category: 'Serviços', payment_method: 'PIX', sale_discount: 0, loyalty_discount: loyalty,
} })
const pontos = (n: number, reg: string) => r({ tabela: 'loyalty_transactions', registro_id: reg, depois: { points: n } })

describe('o voucher de percentual não vira "R$ X em pontos"', () => {
  it('a E03: voucher de 15% (gravado sem o tipo), sem pontos na comanda — a frase não cita pontos', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [voucher({ name: 'Desconto de 15%', discount_value: 15 }), recebido(136, 24), pontos(136, 'lt1')]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Recebeu R$ 136,00 (Pix), com o voucher Desconto de 15% — Inês')
  })

  it('o de percentual com o tipo gravado e pontos junto: diz quantos pontos, sem chutar o valor', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [pontos(-100, 'lt2'), voucher({ name: 'Desconto de 15%', discount_value: 15, type: 'DESCONTO_PERCENTUAL' }), recebido(131, 29), pontos(131, 'lt1')]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Recebeu R$ 131,00 (Pix), com o voucher Desconto de 15% e 100 pontos — Inês')
  })

  it('o de valor fixo com pontos: os pontos em reais (a diferença)', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [pontos(-100, 'lt2'), voucher({ name: 'Voucher R$ 30', discount_value: 30, type: 'DESCONTO_VALOR' }), recebido(125, 35), pontos(125, 'lt1')]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Recebeu R$ 125,00 (Pix), com o Voucher R$ 30 e R$ 5,00 em pontos — Inês')
  })

  it('o de valor fixo sem pontos: só o voucher', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [voucher({ name: 'Voucher R$ 30', discount_value: 30, type: 'DESCONTO_VALOR' }), recebido(130, 30), pontos(130, 'lt1')]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Recebeu R$ 130,00 (Pix), com o Voucher R$ 30 — Inês')
  })

  it('o gatilho do voucher passa a guardar o tipo no rótulo (a migration da faixa P)', () => {
    const pasta = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations')
    const arquivo = readdirSync(pasta).find(f => /^202612065\d{5}_auditoria_o_tipo_do_voucher\.sql$/.test(f))
    expect(arquivo, 'a migration da faixa P').toBeTruthy()
    const sql = readFileSync(path.join(pasta, arquivo!), 'utf8')
    for (const op of ['ins', 'upd', 'del']) {
      expect(sql).toMatch(new RegExp(`auditoria_${op}[\\s\\S]*?on public\\.loyalty_vouchers[\\s\\S]*?'name,discount_value,type', 'status'`))
    }
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
})
