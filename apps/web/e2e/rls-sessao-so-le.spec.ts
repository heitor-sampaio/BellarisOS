import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { banco, tenantId, filiaisAtivas, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'

/**
 * A sessão só LÊ o que a tela precisa ler — quem grava é o servidor, depois da
 * trava da action (C1 do levantamento das regras, F63).
 *
 * A chave pública está no navegador: o que a política deixa a sessão gravar,
 * qualquer membro grava direto no PostgREST, sem passar pelo
 * `assertPermission`. Até a F63:
 *  - a matriz de cargos (`role_permissions`, `role_report_tabs`,
 *    `tenant_roles`) aceitava escrita de qualquer membro da REDE — uma
 *    recepcionista se dava Gerenciar em tudo (escalada de privilégio);
 *  - a cliente gravava o próprio pedido da LGPD com qualquer status e caminho
 *    de arquivo;
 *  - `commissions` era legível por toda a unidade (e ia pelo Realtime a quem
 *    só vê "as minhas");
 *  - `stock_movements` era ALL; `clients` deixava apagar a ficha;
 *  - as configurações da rede com política só `eh_da_rede()` (campanhas,
 *    categorias do estoque, disponibilidade e preço do procedimento por
 *    unidade) aceitavam escrita de qualquer membro da rede, sem o módulo.
 *
 * Cada caso tem o controle: a mesma sessão LÊ o que precisa ler, então "não
 * gravou" não é só uma sessão que não alcança nada.
 */

const marca = Date.now().toString(36)
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function comToken(accessToken: string): SupabaseClient {
  return createClient(URL_, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

let daRede: MembroDeTeste | null = null
let daUnidade: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
let tenant = ''
let unidade = { id: '', slug: '' }
const limpar: (() => PromiseLike<unknown>)[] = []

test.beforeAll(async () => {
  test.setTimeout(240_000)
  tenant = await tenantId()
  const [u] = await filiaisAtivas()
  unidade = { id: u!.id, slug: u!.slug }
  // A recepcionista da rede: só o CRM — nada de Cargos, Marketing, Estoque.
  daRede = await criarMembro(`ssl${marca}`, { rotulo: 'Recepção da rede', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }] })
  // A profissional de uma unidade: só vê a própria agenda.
  daUnidade = await criarMembro(`ssu${marca}`, {
    rotulo: 'Profissional', branchId: unidade.id, permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }],
  })
  cliente = await clienteComSessao(`ssc${marca}`, unidade)
})

test.afterAll(async () => {
  for (const f of limpar.reverse()) await f()
  await cliente?.limpar()
  await daUnidade?.limpar()
  await daRede?.limpar()
})

test.describe('a sessão só lê: a escrita é do servidor', () => {
  test('cargos: a recepcionista da rede não se dá acesso pela chave pública', async () => {
    const db = banco()
    const s = comToken(daRede!.accessToken)

    // O controle: ela LÊ a matriz do próprio cargo (o contexto precisa).
    const { data: lida, error: erroLeitura } = await s.from('role_permissions').select('module, level').eq('role_id', daRede!.roleId)
    expect(erroLeitura, 'a leitura da própria matriz').toBeNull()
    expect((lida ?? []).length, 'a sessão enxerga o próprio cargo').toBeGreaterThan(0)

    // 1. Gerenciar em Cargos e no Financeiro, no próprio cargo.
    await s.from('role_permissions').upsert([
      { tenant_id: tenant, role_id: daRede!.roleId, module: 'roles', level: 'MANAGE', scope: 'ALL' },
      { tenant_id: tenant, role_id: daRede!.roleId, module: 'financial', level: 'MANAGE', scope: 'ALL' },
    ], { onConflict: 'role_id,module' })
    const { data: depois } = await db.from('role_permissions').select('module, level').eq('role_id', daRede!.roleId).in('module', ['roles', 'financial'])
    expect((depois ?? []).filter(l => l.level !== 'NONE'), 'a matriz não ganhou Cargos nem Financeiro').toEqual([])

    // 2. Uma aba de Relatórios.
    await s.from('role_report_tabs').insert({ tenant_id: tenant, role_id: daRede!.roleId, tab: 'financeiro' })
    const { data: abas } = await db.from('role_report_tabs').select('tab').eq('role_id', daRede!.roleId)
    expect(abas ?? [], 'nenhuma aba de relatório nova').toEqual([])

    // 3. Um cargo novo, e renomear o dela.
    const chave = `E2E_SSL_NOVO_${marca}`.toUpperCase()
    await s.from('tenant_roles').insert({ tenant_id: tenant, key: chave, label: `${PREFIXO} cargo plantado ${marca}`, is_system: false })
    limpar.push(() => db.from('tenant_roles').delete().eq('tenant_id', tenant).eq('key', chave))
    const { data: plantado } = await db.from('tenant_roles').select('id').eq('tenant_id', tenant).eq('key', chave)
    expect(plantado ?? [], 'o cargo plantado não nasce').toEqual([])
    const { data: antes } = await db.from('tenant_roles').select('label').eq('id', daRede!.roleId).single()
    await s.from('tenant_roles').update({ label: `${PREFIXO} renomeado ${marca}` }).eq('id', daRede!.roleId)
    const { data: nome } = await db.from('tenant_roles').select('label').eq('id', daRede!.roleId).single()
    expect(nome?.label, 'o cargo não é renomeado').toBe(antes?.label)
  })

  test('configurações da rede: campanha, categoria e preço por unidade não se gravam pela sessão', async () => {
    const db = banco()
    const s = comToken(daRede!.accessToken)

    const titulo = `${PREFIXO} campanha plantada ${marca}`
    await s.from('notification_campaigns').insert({ tenant_id: tenant, name: titulo, type: 'MANUAL', title: titulo, body: 'e2e' })
    limpar.push(() => db.from('notification_campaigns').delete().eq('tenant_id', tenant).eq('name', titulo))
    const { data: campanha } = await db.from('notification_campaigns').select('id').eq('tenant_id', tenant).eq('name', titulo)
    expect(campanha ?? [], 'sem Marketing, a campanha não nasce').toEqual([])

    const categoria = `${PREFIXO} categoria plantada ${marca}`
    await s.from('product_categories').insert({ tenant_id: tenant, name: categoria })
    limpar.push(() => db.from('product_categories').delete().eq('tenant_id', tenant).eq('name', categoria))
    const { data: cat } = await db.from('product_categories').select('id').eq('tenant_id', tenant).eq('name', categoria)
    expect(cat ?? [], 'sem o Estoque, a categoria não nasce').toEqual([])

    const { data: proc } = await db.from('procedures').select('id').eq('tenant_id', tenant).eq('is_active', true).limit(1).single()
    const { data: precoAntes } = await db.from('procedure_branch_pricing').select('procedure_id').eq('procedure_id', proc!.id).eq('branch_id', unidade.id)
    if ((precoAntes ?? []).length === 0) {
      await s.from('procedure_branch_pricing').insert({ procedure_id: proc!.id, branch_id: unidade.id, price: 1 })
      limpar.push(() => db.from('procedure_branch_pricing').delete().eq('procedure_id', proc!.id).eq('branch_id', unidade.id).eq('price', 1))
      const { data: preco } = await db.from('procedure_branch_pricing').select('procedure_id').eq('procedure_id', proc!.id).eq('branch_id', unidade.id)
      expect(preco ?? [], 'sem Procedimentos, o preço da unidade não nasce').toEqual([])
    }
  })

  test('LGPD: a cliente não grava o próprio pedido pela chave pública', async () => {
    const db = banco()
    const s = comToken(cliente!.accessToken)
    // O controle: ela lê os pedidos dela (o portal mostra).
    const { error: erroLeitura } = await s.from('lgpd_requests').select('id').eq('client_id', cliente!.clientId)
    expect(erroLeitura, 'a leitura dos próprios pedidos').toBeNull()

    await s.from('lgpd_requests').insert({
      client_id: cliente!.clientId, tenant_id: tenant, type: 'export', status: 'completed',
      include_medical: true, medical_status: 'approved',
      export_json_path: `${tenant}/outra-cliente/export.json`,
    })
    limpar.push(() => db.from('lgpd_requests').delete().eq('client_id', cliente!.clientId))
    const { data } = await db.from('lgpd_requests').select('id').eq('client_id', cliente!.clientId)
    expect(data ?? [], 'o pedido só nasce pela action (status, prontuário e arquivo são do servidor)').toEqual([])
  })

  test('comissões: a profissional não lê a das colegas, e a tela escuta um sinal sem conteúdo', async () => {
    const db = banco()
    const { data: colega } = await db.from('users').select('id').eq('tenant_id', tenant).eq('is_active', true)
      .neq('id', daUnidade!.userId).not('name', 'like', `${PREFIXO}%`).limit(1).single()
    const { data: com, error } = await db.from('commissions').insert({
      branch_id: unidade.id, professional_id: colega!.id, amount: 123.45, type: 'PERCENTAGE', rule_value: 10, period_ref: '2026-11',
    }).select('id').single()
    expect(error, 'criar a comissão de teste').toBeNull()
    limpar.push(() => db.from('commissions').delete().eq('id', com!.id))

    const s = comToken(daUnidade!.accessToken)
    const { data: lida } = await s.from('commissions').select('id, amount').eq('id', com!.id)
    expect(lida ?? [], 'a comissão da colega não chega pela sessão').toEqual([])
    // As taxas da maquininha e a configuração da comissão também: quem não vê
    // a comissão de todos não vê a taxa (D7) — pela tela nem pela chave pública.
    const { count: taxas } = await db.from('payment_fees').select('metodo', { count: 'exact', head: true }).eq('tenant_id', tenant)
    if (!taxas) {
      expect((await db.from('payment_fees').insert({ tenant_id: tenant, metodo: 'DEBIT_CARD', parcelas: 1, taxa_pct: 1 })).error).toBeNull()
      limpar.push(() => db.from('payment_fees').delete().eq('tenant_id', tenant).eq('metodo', 'DEBIT_CARD').eq('parcelas', 1))
    }
    for (const t of ['commission_lines', 'commission_rules', 'commission_payouts', 'commission_configs', 'payment_fees']) {
      const { data: linhas } = await s.from(t).select('*').limit(1)
      expect(linhas ?? [], `${t} não se lê pela sessão`).toEqual([])
    }

    // O sinal: a tela recarrega pelo servidor, que aplica o "só as minhas".
    const { data: sinal, error: erroSinal } = await s.from('comissoes_sinais').select('tenant_id, mudou_em').eq('tenant_id', tenant)
    expect(erroSinal, 'o sinal existe e se lê pela sessão').toBeNull()
    expect((sinal ?? []).length, 'gravar a comissão marcou o sinal da rede').toBe(1)
  })

  test('estoque e fichas: a sessão não grava movimento nem apaga ficha', async () => {
    const db = banco()
    const s = comToken(daUnidade!.accessToken)

    const { data: produto } = await db.from('products').select('id').eq('tenant_id', tenant).eq('is_active', true).limit(1).single()
    await s.from('stock_movements').insert({
      branch_id: unidade.id, product_id: produto!.id, type: 'PURCHASE', quantity: 999, balance_after: 999,
      created_by: 'e2e-sessao', notes: `${PREFIXO} plantado ${marca}`,
    })
    // Se a sessão gravar (a regressão), o gatilho também grava o fato
    // `estoque.movimentado` — sai junto.
    limpar.push(async () => {
      const { data: plantados } = await db.from('stock_movements').select('id').eq('created_by', 'e2e-sessao').eq('notes', `${PREFIXO} plantado ${marca}`)
      for (const p of plantados ?? []) await db.from('domain_events').delete().eq('tenant_id', tenant).eq('chave', `estoque.movimentado:${p.id}`)
      await db.from('stock_movements').delete().eq('created_by', 'e2e-sessao').eq('notes', `${PREFIXO} plantado ${marca}`)
    })
    const { data: mov } = await db.from('stock_movements').select('id').eq('created_by', 'e2e-sessao').eq('notes', `${PREFIXO} plantado ${marca}`)
    expect(mov ?? [], 'o movimento de estoque só nasce pelas funções do servidor').toEqual([])

    const { data: ficha, error } = await db.from('clients').insert({
      tenant_id: tenant, branch_id: unidade.id, name: `${PREFIXO} ficha a apagar ${marca}`, phone: '5548' + String(Date.now()).slice(-9),
    }).select('id').single()
    expect(error, 'criar a ficha de teste').toBeNull()
    limpar.push(() => db.from('clients').delete().eq('id', ficha!.id))
    // O controle: a profissional da unidade LÊ a ficha.
    const { data: lida } = await s.from('clients').select('id').eq('id', ficha!.id)
    expect((lida ?? []).length, 'a sessão enxerga a ficha').toBe(1)
    await s.from('clients').delete().eq('id', ficha!.id)
    const { data: ainda } = await db.from('clients').select('id').eq('id', ficha!.id)
    expect((ainda ?? []).length, 'a ficha não se apaga pela sessão').toBe(1)
  })
})
