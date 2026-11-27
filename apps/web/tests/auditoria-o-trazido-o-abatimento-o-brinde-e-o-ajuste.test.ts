import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * A Auditoria diz o FATO (plataforma:AD-08, AD-13, AD-18, AD-19, AD-20;
 * princípio 3; o texto das frases é decisão do Claude, 27/11):
 *
 * - D10: o pacote TRAZIDO saía "Vendeu o pacote Massagem (pacote de antes)" — o
 *   gatilho de `client_packages` não guarda o `de_fora`, e PA-24 diz que o
 *   trazido não é venda. A leitura diz se é trazido, lido agora.
 * - D11: o "Abater do pacote" na comanda saía "Editou a comanda (cancelamento…)";
 *   o fato é a sessão do pacote usada.
 * - D12: a entrega do brinde saía "Editou o lote (quantidade)".
 * - P4: o ajuste de pontos saía sem o motivo (o motivo é gravado; lê-se agora).
 * - A20: o horário da UNIDADE saía "horário de trabalho" (o nome do da pessoa).
 */
const sp = (s: string) => s.replace(/[  ]/g, ' ')
let id = 7000
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-27T13:00:00.000Z', branch_id: 'bI', client_id: null, tabela: 'appointments', operacao: 'editou',
  registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Lia', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { cC: 'Cícera Lima', cR: 'Rosilda Amorim' }, membros: {}, unidades: { bI: 'Imperatriz', bA: 'Açailândia' },
  pacotes: { spT: 'Massagem (pacote de antes)', spV: '5 drenagens' },
  pacotesDeFora: { cpT: true },
  sessoesDoPacote: { ps2: 'a sessão 2 do pacote 5 drenagens' },
  unidadesDosAgendamentos: { ag1: 'bA' },
  produtos: { pM: 'Máscara de argila' }, medidasDosProdutos: { pM: 'frasco' },
  clientesDosPontos: { lt1: 'Cícera Lima', lt2: 'Cícera Lima' },
  motivosDosPontos: { lt1: 'Cortesia do aniversário', lt2: 'Lançado em dobro' },
}

describe('D10: o pacote trazido é registrado, não vendido (PA-24)', () => {
  it('sem o de_fora na gravação, a leitura diz que é trazido', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'package_sessions', operacao: 'criou', registro_id: 'psT', client_id: 'cC' }),
      r({ tabela: 'client_packages', operacao: 'criou', registro_id: 'cpT', client_id: 'cC', depois: { package_id: 'spT', price: 0, status: 'ACTIVE' } }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Registrou o pacote de antes Massagem — Cícera Lima')
  })
  it('o nome não repete o "(pacote de antes)"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'package_sessions', operacao: 'criou', registro_id: 'psT', client_id: 'cC' }),
      r({ tabela: 'client_packages', operacao: 'criou', registro_id: 'cpX', client_id: 'cC', depois: { package_id: 'spT', price: 0, de_fora: true } }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Registrou o pacote de antes Massagem — Cícera Lima')
  })
  it('o vendido segue "Vendeu"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'package_sessions', operacao: 'criou', registro_id: 'psV', client_id: 'cC' }),
      r({ tabela: 'client_packages', operacao: 'criou', registro_id: 'cpV', client_id: 'cC', depois: { package_id: 'spV', price: 600 } }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Vendeu o pacote 5 drenagens (R$ 600,00) — Cícera Lima')
  })
  it('a leitura busca o de_fora dos pacotes criados', () => {
    const leitura = readFileSync(join(__dirname, '..', 'lib/auditoria/leitura.ts'), 'utf8')
    expect(leitura).toMatch(/from\('client_packages'\)\.select\('id, de_fora/)
    expect(leitura).toMatch(/pacotesDeFora/)
  })
})

/** A gravação do `atendimento_abater_do_pacote`, na ordem da leitura (o id decrescente). */
const abatimento = () => [
  r({ tabela: 'package_sessions', registro_id: 'ps2', client_id: 'cC', colunas: ['appointment_id', 'status', 'used_at'],
    antes: { status: 'AVAILABLE', appointment_id: null }, depois: { status: 'USED', appointment_id: 'ag1' } }),
  r({ tabela: 'client_packages', registro_id: 'cpV', client_id: 'cC', colunas: ['used_sessions'] }),
  r({ tabela: 'appointments', registro_id: 'ag1', branch_id: 'bA', client_id: 'cC', colunas: ['price'] }),
  r({ tabela: 'financial_transactions', registro_id: 'ft1', branch_id: 'bA', client_id: 'cC', colunas: ['amount', 'notes'],
    antes: { amount: 150 }, depois: { amount: 0 } }),
  r({ tabela: 'comandas', registro_id: 'co1', branch_id: 'bA', client_id: 'cC', colunas: ['cancelada_em', 'cancelada_motivo'] }),
]

describe('D11: o "Abater do pacote" é a sessão usada (AD-20)', () => {
  it('"Usou a sessão 2 do pacote 5 drenagens — Cícera Lima"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDoGrupo(abatimento(), nomes))).toBe('Usou a sessão 2 do pacote 5 drenagens — Cícera Lima')
  })
  it('na unidade do atendimento', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const [g] = gruposDaAuditoria(abatimento(), nomes, '/admin/auditoria', null)
    expect(g!.unidade).toBe('Açailândia')
  })
  it('a desistência que gasta a sessão segue "Cancelou o agendamento"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'package_sessions', registro_id: 'ps2', client_id: 'cC', colunas: ['status', 'used_at'],
        antes: { status: 'AVAILABLE' }, depois: { status: 'USED' } }),
      r({ tabela: 'appointments', registro_id: 'ag1', branch_id: 'bA', client_id: 'cC', colunas: ['cancellation_reason', 'cancelled_at', 'status'],
        antes: { status: 'IN_PROGRESS' }, depois: { status: 'CANCELLED' } }),
    ]
    expect(fraseDoGrupo(linhas, nomes)).toMatch(/^Cancelou o agendamento/)
  })
})

describe('D12: a entrega do brinde é o fato, não "Editou o lote" (AD-19, AD-20)', () => {
  const entrega = () => [
    r({ tabela: 'loyalty_vouchers', registro_id: 'v1', client_id: 'cR', colunas: ['status', 'used_at', 'used_stock_movement_id'],
      antes: { name: 'Máscara de argila', type: 'PRODUTO', status: 'ATIVO' }, depois: { name: 'Máscara de argila', type: 'PRODUTO', status: 'USADO' } }),
    r({ tabela: 'stock_movements', operacao: 'criou', registro_id: 'sm1', depois: { product_id: 'pM', type: 'MANUAL_ADJUSTMENT', quantity: -1, balance_after: 4 } }),
    r({ tabela: 'product_batches', registro_id: 'lt9', colunas: ['quantity'] }),
  ]
  it('"Entregou o brinde Máscara de argila (baixou 1 frasco de Máscara de argila do estoque) — Rosilda Amorim"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDoGrupo(entrega(), nomes)))
      .toBe('Entregou o brinde Máscara de argila (baixou 1 frasco de Máscara de argila do estoque) — Rosilda Amorim')
  })
  it('a linha é da unidade da entrega e leva à ficha', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const [g] = gruposDaAuditoria(entrega().map(l => l.tabela === 'loyalty_vouchers' ? { ...l, branch_id: 'bA' } : l), nomes, '/admin/auditoria', null)
    expect(g!.unidade).toBe('Imperatriz')
    expect(g!.href).toMatch(/cC|cR/)
  })
  it('o brinde sem produto (só o voucher): "Entregou o brinde …"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDoGrupo([entrega()[0]!], nomes))).toBe('Entregou o brinde Máscara de argila — Rosilda Amorim')
  })
  it('o voucher usado no pagamento segue no recebimento', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'loyalty_vouchers', registro_id: 'v2', client_id: 'cR', colunas: ['status', 'used_at'],
        antes: { name: 'Voucher R$ 30', type: 'DESCONTO_VALOR', status: 'ATIVO', discount_value: 30 },
        depois: { name: 'Voucher R$ 30', type: 'DESCONTO_VALOR', status: 'USADO', discount_value: 30 } }),
      r({ tabela: 'financial_transactions', operacao: 'criou', registro_id: 'ft9', client_id: 'cR',
        depois: { type: 'INCOME', amount: 120, payment_method: 'PIX', paid_at: '2026-11-27T13:00:00Z', category: 'Atendimento', loyalty_discount: 30 } }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes))).toMatch(/^Recebeu R\$ 120,00 \(Pix\), com o Voucher R\$ 30/)
  })
})

describe('P4: o ajuste de pontos diz o motivo (AD-08)', () => {
  it('credita e debita com o motivo, lido agora', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(r({ tabela: 'loyalty_transactions', operacao: 'criou', registro_id: 'lt1', depois: { points: 500 } }), nomes))
      .toBe('Creditou 500 pontos a Cícera Lima (motivo: Cortesia do aniversário)')
    expect(fraseDaAuditoria(r({ tabela: 'loyalty_transactions', operacao: 'criou', registro_id: 'lt2', depois: { points: -200 } }), nomes))
      .toBe('Debitou 200 pontos de Cícera Lima (motivo: Lançado em dobro)')
  })
  it('a leitura lê o motivo do ajuste', () => {
    const leitura = readFileSync(join(__dirname, '..', 'lib/auditoria/leitura.ts'), 'utf8')
    expect(leitura).toMatch(/from\('loyalty_transactions'\)\.select\('id, loyalty_account_id, kind, description'\)/)
    expect(leitura).toMatch(/motivosDosPontos/)
  })
})

describe('A20: o horário da unidade pelo nome certo', () => {
  it('"Editou a unidade X (horário de funcionamento)"', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const u = r({ tabela: 'branches', registro_id: 'bI', colunas: ['horario'], antes: { name: 'Andiroba Imperatriz' }, depois: { name: 'Andiroba Imperatriz' } })
    expect(fraseDaAuditoria(u, nomes)).toBe('Editou a unidade Andiroba Imperatriz (horário de funcionamento)')
  })
})

describe('D12: o histórico do estoque diz a cliente do brinde', () => {
  it('a última versão de entregar_voucher_produto põe a cliente no motivo do movimento', () => {
    const pasta = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
    const ultima = readdirSync(pasta).filter(f => f.endsWith('.sql')).sort()
      .filter(f => readFileSync(join(pasta, f), 'utf8').includes('entregar_voucher_produto')).pop()!
    const sql = readFileSync(join(pasta, ultima), 'utf8')
    expect(sql).toMatch(/Entrega de recompensa: ' \|\| v_v\.name \|\| coalesce\(' — ' \|\| \(select c\.name from public\.clients c where c\.id = v_v\.client_id\), ''\)/)
    expect(sql).toMatch(/notify pgrst, 'reload schema';\s*$/)
  })
})
