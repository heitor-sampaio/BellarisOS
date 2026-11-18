import { describe, it, expect, vi } from 'vitest'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

vi.setConfig({ testTimeout: 30_000 })

/**
 * D16, A18, A20 (a, b) e A21 da 25ª simulação, a Auditoria (princípio 3: o
 * que a tela diz é o que aconteceu).
 *
 * D16: editar o CPF da cliente saía "Editou a ficha de X (CNPJ)" — o nome da
 * coluna `document` era o da REDE; o documento estrangeiro saía cru.
 * A18: as colunas da fidelidade e do acesso da cliente saíam cruas
 * ("first access bonus", "portal ligado em").
 * A20a: "Recebeu R$ 180,00 (Pix)" calava o desconto e os pontos usados.
 * A20b: o pacote de antes do sistema (registrado, não vendido) saía "Vendeu".
 * A21: a falta saía "Editou o agendamento (situação)".
 */
const sp = (s: string) => s.replace(/[  ]/g, ' ')
let id = 9500
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-18T17:00:00.000Z', branch_id: 'bP', client_id: null, tabela: 'clients', operacao: 'editou',
  registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Helena Violeta', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { cL: 'Laura Mendes' }, membros: {}, unidades: { bP: 'Pajuçara' },
  pacotes: { sp1: 'Limpeza 5 sessões' },
}

describe('D16: o documento da cliente pelo nome certo', () => {
  it('"(CPF)", não "(CNPJ)"', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(r({ client_id: 'cL', colunas: ['document'] }), nomes)).toBe('Editou a ficha de Laura Mendes (CPF)')
  })
  it('o documento estrangeiro também', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(r({ client_id: 'cL', colunas: ['documento_tipo', 'documento_numero'] }), nomes))
      .toBe('Editou a ficha de Laura Mendes (tipo de documento e documento)')
  })
  it('a rede segue "CNPJ"', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(r({ tabela: 'tenants', colunas: ['document'], depois: { name: 'Bella' } }), nomes)).toMatch(/\(CNPJ\)$/)
  })
})

describe('A18: as colunas da fidelidade e do acesso têm nome', () => {
  it('nenhuma sai crua', async () => {
    const { CAMPO_DA_AUDITORIA } = await import('@/lib/auditoria/frase')
    for (const c of ['first_access_bonus', 'birthday_bonus', 'expiry_months', 'expiry_notice_days', 'client_redeem', 'revoked_by_user_id', 'motivo_revogacao', 'portal_ligado_em']) {
      expect(CAMPO_DA_AUDITORIA[c], c).toBeTruthy()
    }
  })
})

describe('A20a: o recebimento diz o desconto e os pontos', () => {
  it('"Recebeu R$ 180,00 (Pix), com desconto de R$ 20,00 e R$ 30,00 em pontos"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'financial_transactions', operacao: 'criou', registro_id: 'ft1', client_id: 'cL',
        depois: { type: 'INCOME', amount: 180, payment_method: 'PIX', paid_at: '2026-11-18T17:00:00Z', category: 'Atendimento', sale_discount: 20, loyalty_discount: 30 } }),
      r({ tabela: 'comanda_itens', operacao: 'criou', registro_id: 'ci1' }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Recebeu R$ 180,00 (Pix), com desconto de R$ 20,00 e R$ 30,00 em pontos — Laura Mendes')
  })
  it('sem desconto nem pontos, a frase de sempre', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'financial_transactions', operacao: 'criou', registro_id: 'ft1', client_id: 'cL',
        depois: { type: 'INCOME', amount: 180, payment_method: 'PIX', paid_at: '2026-11-18T17:00:00Z', category: 'Atendimento', sale_discount: 0, loyalty_discount: null } }),
      r({ tabela: 'comanda_itens', operacao: 'criou', registro_id: 'ci1' }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Recebeu R$ 180,00 (Pix) — Laura Mendes')
  })
})

describe('A20b: o pacote de antes do sistema é registrado, não vendido', () => {
  it('"Registrou o pacote de antes Limpeza 5 sessões"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'client_packages', operacao: 'criou', registro_id: 'cp1', client_id: 'cL', depois: { package_id: 'sp1', price: 0, de_fora: true } }),
      r({ tabela: 'package_sessions', operacao: 'criou', registro_id: 'ps1', client_id: 'cL' }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Registrou o pacote de antes Limpeza 5 sessões — Laura Mendes')
  })
})

describe('A21: a falta é o fato', () => {
  it('"Marcou a falta de Laura Mendes"', async () => {
    const { fraseDaAuditoria, fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const falta = r({ tabela: 'appointments', client_id: 'cL', registro_id: 'ap1', colunas: ['status'], antes: { status: 'CONFIRMED' }, depois: { status: 'NO_SHOW' } })
    expect(fraseDaAuditoria(falta, nomes)).toBe('Marcou a falta de Laura Mendes')
    // Gravada com outros registros (o evento, a oportunidade), a falta segue sendo o fato.
    expect(fraseDoGrupo([falta, r({ tabela: 'leads', registro_id: 'l1', colunas: ['notes'] })], nomes)).toBe('Marcou a falta de Laura Mendes')
  })
})
