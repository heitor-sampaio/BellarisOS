import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * D1 da 36ª simulação (ES-30 / NE-06: o sino avisa quem tem o Estoque em
 * Gerenciar "uma vez a cada vez que cruza" o mínimo). A Máscara, mínimo 5, foi
 * 6 → 4 (cruzou às 02:27) → 3 → 7 (reposição) → 4 (cruzou de novo às 02:45), e
 * o sino teve UM aviso, por volta das 03:02: o aviso saía só da rotina de hora
 * em hora, que olhava o ESTADO da linha (`minimo_avisado_em`) — os dois
 * cruzamentos da mesma hora viraram um.
 *
 * Agora o cruzamento se registra NA HORA do movimento, no banco (um gatilho em
 * `branch_product_stock`, que todo caminho que move estoque atravessa:
 * conclusão, desistência, venda, voucher, entrada, ajuste, perda,
 * transferência, os "desfazer"), na fila `estoque_cruzamentos_do_minimo`; e o
 * aviso de CADA cruzamento sai da fila (logo depois do movimento, pelo
 * `after()`; a rotina é a rede de segurança), reivindicado antes de avisar.
 */

const raiz = path.resolve(__dirname, '..')
const lerArquivo = (rel: string) => readFileSync(path.join(raiz, rel), 'utf8')

const notificarInteressados = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {})
vi.mock('@/lib/notifications/interessados', () => ({ notificarInteressados: (...a: unknown[]) => notificarInteressados(...a) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('sem banco no teste') } }))

type Cruzamento = {
  id: string; tenant_id: string; branch_id: string; product_id: string; cruzou_em: string
  current_stock: number; current_rendimento: number | null; min_stock: number
  branch_product_stock: {
    minimo_avisado_em: string | null
    products: { name: string; unit: string; consumption_unit: string | null; units_per_package: number | null; is_active: boolean; min_stock: number | null }
  }
}

const mascara = (id: string, cruzouEm: string, saldo: number, extra: Partial<Cruzamento> = {}): Cruzamento => ({
  id, tenant_id: 'rede-1', branch_id: 'unidade-1', product_id: 'mascara', cruzou_em: cruzouEm,
  current_stock: saldo, current_rendimento: null, min_stock: 5,
  branch_product_stock: { minimo_avisado_em: null, products: { name: 'Máscara', unit: 'un', consumption_unit: null, units_per_package: null, is_active: true, min_stock: null } },
  ...extra,
})

/** Um cliente de serviço de mentira: a fila, as reivindicações e a ordem das chamadas. */
function adminFalso(fila: Cruzamento[], opcoes: { perde?: string[] } = {}) {
  const log: string[] = []
  const consultas: { tabela: string; filtros: string[] }[] = []
  const reivindicados = new Set<string>(opcoes.perde ?? [])
  notificarInteressados.mockImplementation(async (_a: unknown, _q: unknown, n: unknown) => {
    log.push(`avisa:${(n as { body: string }).body}`)
  })
  const from = (tabela: string) => {
    const consulta = { tabela, filtros: [] as string[] }
    consultas.push(consulta)
    let atualiza: Record<string, unknown> | null = null
    let id: string | null = null
    const resolver = () => {
      if (tabela !== 'estoque_cruzamentos_do_minimo') return { data: [], error: null }
      if (!atualiza) return { data: fila, error: null }
      if (!id || !consulta.filtros.includes('is:avisado_em:null')) return { data: [], error: null }
      log.push(`reivindica:${id}`)
      if (reivindicados.has(id)) return { data: [], error: null }
      reivindicados.add(id)
      return { data: [{ id }], error: null }
    }
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select: () => b,
      update: (patch: Record<string, unknown>) => { atualiza = patch; return b },
      eq: (k: string, v: unknown) => { consulta.filtros.push(`eq:${k}:${String(v)}`); if (k === 'id') id = String(v); return b },
      is: (k: string, v: unknown) => { consulta.filtros.push(`is:${k}:${String(v)}`); return b },
      gt: () => b, order: () => b,
      range: () => Promise.resolve(resolver()),
      then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, falha),
    })
    return b
  }
  return { admin: { from } as never, log, consultas }
}

describe('o aviso do estoque mínimo sai a CADA cruzamento (D1 da 36ª)', () => {
  beforeEach(() => { notificarInteressados.mockReset() })

  it('dois cruzamentos da mesma linha na mesma hora são dois avisos, cada um com o seu saldo', async () => {
    const { avisarEstoqueMinimo } = await import('@/lib/estoque/aviso-do-minimo')
    const { admin, log } = adminFalso([
      mascara('c1', '2026-11-27T05:27:00Z', 3),
      mascara('c2', '2026-11-27T05:45:00Z', 4),
    ])
    const r = await avisarEstoqueMinimo(admin, { tenantId: 'rede-1' })
    expect(r.avisados).toBe(2)
    expect(notificarInteressados).toHaveBeenCalledTimes(2)
    expect(log.filter(l => l.startsWith('avisa:'))).toEqual([
      'avisa:Máscara: 3 un em estoque, mínimo 5 un.',
      'avisa:Máscara: 4 un em estoque, mínimo 5 un.',
    ])
    // A quem tem o Estoque em Gerenciar na unidade do cruzamento.
    expect(notificarInteressados.mock.calls[0]![1]).toEqual({ modulo: 'stock', branchId: 'unidade-1' })
  })

  it('lê a FILA de cruzamentos não avisados (e recorta a rede), não o estado da linha', async () => {
    const { avisarEstoqueMinimo } = await import('@/lib/estoque/aviso-do-minimo')
    const { admin, consultas } = adminFalso([])
    await avisarEstoqueMinimo(admin, { tenantId: 'rede-1' })
    const leitura = consultas[0]!
    expect(leitura.tabela).toBe('estoque_cruzamentos_do_minimo')
    expect(leitura.filtros).toContain('is:avisado_em:null')
    expect(leitura.filtros).toContain('eq:tenant_id:rede-1')
    // Nada mais grava "minimo_avisado_em": a fila é a regra.
    expect(consultas.some(c => c.tabela === 'branch_product_stock')).toBe(false)
  })

  it('reivindica cada cruzamento ANTES de avisar: a passada que perde não avisa (CLAUDE.md §14)', async () => {
    const { avisarEstoqueMinimo } = await import('@/lib/estoque/aviso-do-minimo')
    const { admin, log } = adminFalso([
      mascara('c1', '2026-11-27T05:27:00Z', 3),
      mascara('c2', '2026-11-27T05:45:00Z', 4),
    ], { perde: ['c1'] })
    const r = await avisarEstoqueMinimo(admin, {})
    expect(r.avisados).toBe(1)
    expect(log).toEqual(['reivindica:c1', 'reivindica:c2', 'avisa:Máscara: 4 un em estoque, mínimo 5 un.'])
  })

  it('o cruzamento que a rotina de antes já avisou (minimo_avisado_em depois dele) não avisa de novo', async () => {
    const { avisarEstoqueMinimo } = await import('@/lib/estoque/aviso-do-minimo')
    const jaAvisado = mascara('c1', '2026-11-27T05:27:00Z', 3)
    jaAvisado.branch_product_stock.minimo_avisado_em = '2026-11-27T06:00:00Z'
    const antigo = mascara('c2', '2026-11-27T07:10:00Z', 4)
    antigo.branch_product_stock.minimo_avisado_em = '2026-11-27T06:00:00Z'
    const { admin, log } = adminFalso([jaAvisado, antigo])
    const r = await avisarEstoqueMinimo(admin, {})
    expect(r.avisados).toBe(1)
    expect(log).toEqual(['reivindica:c1', 'reivindica:c2', 'avisa:Máscara: 4 un em estoque, mínimo 5 un.'])
  })

  it('o produto desativado sai da fila sem avisar', async () => {
    const { avisarEstoqueMinimo } = await import('@/lib/estoque/aviso-do-minimo')
    const inativo = mascara('c1', '2026-11-27T05:27:00Z', 3)
    inativo.branch_product_stock.products.is_active = false
    const { admin, log } = adminFalso([inativo])
    const r = await avisarEstoqueMinimo(admin, {})
    expect(r.avisados).toBe(0)
    expect(log).toEqual(['reivindica:c1'])
  })

  it('o produto com unidade de consumo diz o saldo pela régua da tela, com o mínimo do cadastro', async () => {
    const { avisarEstoqueMinimo } = await import('@/lib/estoque/aviso-do-minimo')
    const lamina = mascara('c1', '2026-11-27T05:27:00Z', 4, { current_rendimento: 190, min_stock: 4 })
    lamina.branch_product_stock.products = { name: 'Lâmina', unit: 'caixa', consumption_unit: 'un', units_per_package: 50, is_active: true, min_stock: 4 }
    const { admin, log } = adminFalso([lamina])
    await avisarEstoqueMinimo(admin, {})
    expect(log).toContain('avisa:Lâmina: 190 un em estoque, mínimo 200 un (do cadastro).')
    expect(notificarInteressados.mock.calls[0]![2]).toMatchObject({ type: 'stock_below_minimum', title: 'Estoque abaixo do mínimo' })
  })
})

describe('o cruzamento se registra no banco, junto do movimento', () => {
  const nome = readdirSync(path.join(raiz, '../../supabase/migrations')).find(f => /^20261215300\d{3}_.*minimo.*\.sql$/.test(f))
  const sql = () => {
    expect(nome, 'a migration da faixa N (20261215300001…) sobre o mínimo').toBeTruthy()
    return lerArquivo(`../../supabase/migrations/${nome}`)
  }

  it('a fila nasce com a rede e a linha do saldo (cascata), sem política para a sessão, com as restritivas do suporte', () => {
    const s = sql()
    expect(s).toMatch(/create table if not exists public\.estoque_cruzamentos_do_minimo/)
    expect(s).toMatch(/tenant_id\s+uuid not null references public\.tenants\(id\) on delete cascade/)
    expect(s).toMatch(/foreign key \(product_id, branch_id\) references public\.branch_product_stock \(product_id, branch_id\) on delete cascade/)
    expect(s).toMatch(/alter table public\.estoque_cruzamentos_do_minimo enable row level security/)
    for (const p of s.match(/create policy [^\n]+/g) ?? []) expect(p).toMatch(/as restrictive/)
    for (const p of ['suporte_sem_escrita_ins', 'suporte_sem_escrita_upd', 'suporte_sem_escrita_del']) {
      expect(s).toContain(`create policy ${p} on public.estoque_cruzamentos_do_minimo as restrictive`)
    }
    // Chave estrangeira nova nasce com índice (infra.md, F45); a fila pendente também.
    expect(s).toMatch(/create index if not exists \w+ on public\.estoque_cruzamentos_do_minimo \(product_id, branch_id\)/)
    expect(s).toMatch(/create index if not exists \w+ on public\.estoque_cruzamentos_do_minimo \(tenant_id\)/)
    expect(s).toMatch(/on public\.estoque_cruzamentos_do_minimo \(cruzou_em\) where avisado_em is null/)
  })

  it('o gatilho olha o saldo, o rendimento e o mínimo, em todo caminho (insert e update da linha)', () => {
    const s = sql()
    expect(s).toMatch(/after insert or update of current_stock, current_rendimento, min_stock on public\.branch_product_stock\s+for each row execute function private\.estoque_registrar_cruzamento_do_minimo\(\)/)
  })

  it('a régua é a da TELA (situacaoDoEstoque): o saldo da tela contra o mínimo na mesma unidade, 4 casas, "No mínimo" conta', () => {
    const s = sql()
    const regua = s.match(/create or replace function private\.estoque_avisa_no_minimo[\s\S]*?\$\$;/)
    expect(regua, 'private.estoque_avisa_no_minimo').not.toBeNull()
    expect(regua![0]).toContain('s.min_stock > 0')
    expect(regua![0]).toContain('round(public.saldo_de_consumo(s, p), 4) <= 0')
    expect(regua![0]).toContain('round(public.saldo_de_consumo(s, p), 4) <= round(s.min_stock * public.fator_de_consumo(p), 4)')
  })

  it('cruzar é ENTRAR no mínimo: quem já estava nele só atualiza o saldo do cruzamento ainda não avisado; o marcador da linha que nasce não conta', () => {
    const s = sql()
    const gatilho = s.match(/create or replace function private\.estoque_registrar_cruzamento_do_minimo[\s\S]*?\$\$;/)
    expect(gatilho).not.toBeNull()
    const g = gatilho![0]
    expect(g).toContain('old.updated_at = now()')
    expect(g).toMatch(/insert into public\.estoque_cruzamentos_do_minimo/)
    expect(g).toMatch(/update public\.estoque_cruzamentos_do_minimo[\s\S]*avisado_em is null/)
    expect(g).toContain('p.is_active')
  })

  it('o que já estava no mínimo e não foi avisado entra na fila; as funções ficam fora da sessão; o PostgREST recarrega', () => {
    const s = sql()
    expect(s).toMatch(/insert into public\.estoque_cruzamentos_do_minimo[\s\S]*?minimo_avisado_em is null/)
    expect(s).toMatch(/revoke execute on function private\.estoque_avisa_no_minimo\([^)]*\) from public, anon, authenticated/)
    expect(s).toMatch(/revoke execute on function private\.estoque_registrar_cruzamento_do_minimo\(\) from public, anon, authenticated/)
    expect(s.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})

describe('o aviso sai logo depois do movimento (after), e a rotina é a rede de segurança', () => {
  const corpo = (arquivo: string, funcao: string) => {
    const s = lerArquivo(arquivo)
    const i = s.search(new RegExp(`(export )?async function ${funcao}\\b`))
    expect(i, `${funcao} em ${arquivo}`).toBeGreaterThanOrEqual(0)
    const resto = s.slice(i + 10)
    const fim = resto.search(/\n(export )?(async )?function |\nexport (const|type|interface) /)
    return resto.slice(0, fim < 0 ? undefined : fim)
  }

  it.each([
    ['actions/stock.ts', 'createProductInterno'],
    ['actions/stock.ts', 'adminUpdateMinStockInterno'],
    ['actions/stock.ts', 'adminTransferStockInterno'],
    ['actions/stock.ts', 'registrarPerdaInterno'],
    ['actions/stock.ts', 'desfazerEntradaDeEstoque'],
    ['actions/stock.ts', 'desfazerAjusteDeEstoque'],
    ['actions/stock.ts', 'desfazerPerdaDeEstoque'],
    ['lib/estoque/movimentos.ts', 'entradaDeEstoqueCore'],
    ['lib/estoque/movimentos.ts', 'ajusteDeEstoqueCore'],
    // O caminho do cenário (a conclusão baixa o insumo), a desistência, o brinde do voucher e a venda do produto.
    ['actions/appointments.ts', 'finishSessionInterno'],
    ['actions/appointments.ts', 'cancelAppointmentSessionInterno'],
    ['actions/fidelidade.ts', 'entregarVoucherProduto'],
    ['actions/produtos.ts', 'venderProdutoUmaVez'],
  ])('%s → %s chama avisarOMinimoDepois', (arquivo, funcao) => {
    expect(corpo(arquivo, funcao)).toContain('avisarOMinimoDepois(')
  })

  it('avisarOMinimoDepois agenda o envio da fila da rede pelo after(), e roda direto fora de um request', () => {
    const s = lerArquivo('lib/estoque/aviso-do-minimo.ts')
    expect(s).toMatch(/export function avisarOMinimoDepois\(tenantId: string \| null\)/)
    expect(s).toMatch(/try \{ after\(enviar\) \} catch \{ void enviar\(\) \}/)
  })

  it('a rotina de hora em hora continua chamando o envio (rede de segurança)', () => {
    expect(lerArquivo('app/api/cron/estoque-minimo/route.ts')).toContain('avisarEstoqueMinimo(admin, { tenantId })')
  })
})
