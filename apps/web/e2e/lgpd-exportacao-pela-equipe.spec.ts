import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * A21 da 6ª simulação (2026-11-04): a LGPD só se pedia pelo PORTAL — a ficha,
 * na equipe, não exportava (a cliente sem o app ficava sem caminho). E o pacote
 * levava o plano de tratamento sem os itens nem o valor, e as comunicações sem
 * a hora.
 *
 * Agora quem tem Clientes em Gerenciar exporta pela ficha ("Mais ações" →
 * "Exportar dados (LGPD)"): o pedido fica registrado (pela equipe, quem
 * pediu), o pacote sai em segundo plano e a ficha dá o download. O prontuário
 * só entra com o Prontuário em Gerenciar. O plano vai com as sessões, os
 * procedimentos e os valores.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let soVe: MembroDeTeste | null = null
let cliente = ''
let nomeDoProc = ''

async function comSessao<T>(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const pedidos = async () => (await db().from('lgpd_requests')
  .select('id, status, requested_via, requested_by, requested_by_name, include_medical, medical_status, export_json_path')
  .eq('client_id', cliente).order('requested_at')).data ?? []

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`lge${marca}`)
  recepcao = await criarMembro(`lger${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepcao', permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'VIEW' }],
  })
  soVe = await criarMembro(`lgev${marca}`, { tenant: rede.tenantId, rotulo: 'So ve', permissoes: [{ modulo: 'clients', nivel: 'VIEW' }] })
  const plano = await rede.criarPlanoProposto(`LGPD ${marca}`, { semTermo: true })
  cliente = plano.clientId
  expect((await db().from('treatment_plans').update({ status: 'ACCEPTED' }).eq('id', plano.planId)).error).toBeNull()
  nomeDoProc = (await db().from('procedures').select('name').eq('id', rede.procedureId).single<{ name: string }>()).data!.name
  expect((await db().from('client_notifications').insert({
    client_id: cliente, title: `${PREFIXO} lembrete ${marca}`, type: 'general', created_at: '2026-11-03T13:45:00Z',
  })).error).toBeNull()
})

test.afterAll(async () => {
  await db().from('lgpd_requests').delete().eq('client_id', cliente)
  await db().from('treatment_plans').delete().eq('client_id', cliente)
  await soVe?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

test('quem tem Clientes em Gerenciar exporta pela ficha: o pedido é da equipe, registrado, e o download sai da ficha', async ({ browser }) => {
  await comSessao(browser, recepcao!, async p => {
    await p.goto(`/admin/clients/${cliente}`)
    await p.getByRole('button', { name: 'Mais ações' }).click()
    await p.getByRole('button', { name: 'Exportar dados (LGPD)' }).click()
    const dlg = p.getByRole('dialog', { name: 'Exportar dados (LGPD)' })
    await expect(dlg.getByLabel('Incluir o prontuário'), 'sem o Prontuário em Gerenciar, o prontuário não se oferece').toHaveCount(0)
    await dlg.getByRole('button', { name: 'Gerar o pacote' }).click()
    await expect(dlg.getByText(/Em preparo|Pronto/)).toBeVisible()
    await expect.poll(async () => (await pedidos())[0]?.status, { timeout: 60_000 }).toBe('completed')
    await dlg.getByRole('button', { name: 'Atualizar' }).click()
    await expect(dlg.getByRole('link', { name: 'Baixar PDF' })).toHaveAttribute('href', /lgpd-exports.*token=/)
    await expect(dlg.getByRole('link', { name: 'Baixar JSON' })).toHaveAttribute('href', /lgpd-exports.*token=/)
  })
  const [pedido] = await pedidos()
  expect(pedido).toMatchObject({ requested_via: 'equipe', requested_by: recepcao!.userId, include_medical: false, medical_status: 'not_requested' })
  expect(pedido!.requested_by_name).toBeTruthy()

  // O pacote: o plano com as sessões, os procedimentos e os valores; a comunicação com a hora.
  const { data: url } = await db().storage.from('lgpd-exports').createSignedUrl(pedido!.export_json_path as string, 60)
  const pacote = await (await fetch(url!.signedUrl)).json() as {
    planosDeTratamento: { total: number; sessoes: { numero: number; procedimentos: { procedimento: string; valor: number }[] }[] }[]
    comunicacoes: { data: string; titulo: string }[]
  }
  expect(pacote.planosDeTratamento[0]).toMatchObject({ total: 50, sessoes: [{ numero: 1, procedimentos: [{ procedimento: nomeDoProc, valor: 50 }] }] })
  expect(pacote.comunicacoes.find(c => c.titulo.includes(marca))?.data).toBe('2026-11-03T10:45:00-03:00') // A24 da 25ª: no fuso da rede, o mesmo instante
})

test('sem o Prontuário em Gerenciar não inclui o prontuário; quem só vê não exporta', async ({ browser }) => {
  const antes = (await pedidos()).length
  await comSessao(browser, recepcao!, async p => {
    await p.goto(`/admin/clients/${cliente}`)
    const r = await chamarAcao(p, 'actions/lgpd.ts', 'exportarDadosPelaEquipe', `/admin/clients/${cliente}`, [cliente, { incluirProntuario: true }])
    expect(r.texto).toContain('Prontuário em Gerenciar')
  })
  await comSessao(browser, soVe!, async p => {
    await p.goto(`/admin/clients/${cliente}`)
    await expect(p.getByRole('button', { name: 'Exportar dados (LGPD)' })).toHaveCount(0)
    const r = await chamarAcao(p, 'actions/lgpd.ts', 'exportarDadosPelaEquipe', `/admin/clients/${cliente}`, [cliente, { incluirProntuario: false }])
    expect(r.texto).not.toContain('"ok":true')
  })
  expect((await pedidos()).length, 'nenhum pedido novo').toBe(antes)
})

// A ficha do procedimento é gravada como { formId, name, rows, answers }, e o pacote a leva
// legível: pergunta e resposta, o mapa de injetáveis em palavras (o planejamento, os pontos,
// o produto e a quantidade), a foto como "Foto anexada" (o caminho, com ids, não vai), e a
// versão de antes com a ficha DELA. Nada de "[object Object]". Numa rede [e2e] própria.
test.describe('o pacote da LGPD leva a ficha do procedimento legível, pergunta a pergunta (princípio 3)', () => {
  let rede: OutraRede | null = null
  let equipe: MembroDeTeste | null = null
  let cliente = ''

  const ROWS = [
    { id: 'r1', fields: [{ id: 'area', type: 'text', label: 'Área tratada' }] },
    { id: 'r2', fields: [{ id: 'mapa', type: 'injectable_map', label: 'Mapa de aplicação', options: ['Toxina'] }] },
    { id: 'r3', fields: [{ id: 'foto', type: 'photo', label: 'Foto de antes' }] },
  ]
  const FICHA = {
    formId: null, name: 'Ficha da toxina', rows: ROWS,
    answers: {
      area: 'Testa',
      mapa: {
        view: 'rosto_f', planejamento: { id: '00000000-0000-0000-0000-000000000001', nome: 'Toxina testa' }, retratoEm: new Date().toISOString(),
        points: [
          { x: 0.4, y: 0.2, product: 'Toxina', dose: 2, unit: 'U', applied: null, regiao: 'Frontal' },
          { x: 0.5, y: 0.2, product: 'Toxina', dose: 2, unit: 'U', applied: null, regiao: 'Frontal' },
          { x: 0.6, y: 0.2, product: 'Toxina', dose: 2, unit: 'U', applied: null, regiao: 'Frontal' },
        ],
      },
      foto: 'unidade/cliente/foto.jpg',
    },
  }
  const FICHA_DE_ANTES = { ...FICHA, answers: { ...FICHA.answers, area: 'Glabela' } }

  test.beforeAll(async () => {
    test.setTimeout(150_000)
    rede = await criarOutraRede(`lgf${marca}`)
    equipe = await criarMembro(`lgfe${marca}`, {
      tenant: rede.tenantId, rotulo: 'Equipe LGPD',
      permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }],
    })
    cliente = await rede.criarCliente('Helena')
    const ontem = new Date(Date.now() - 86_400_000).toISOString()
    const ag = await db().from('appointments').insert({
      branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
      status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: ontem, completed_at: ontem,
    }).select('id').single<{ id: string }>()
    expect(ag.error).toBeNull()
    const pr = await db().from('medical_records').upsert({ client_id: cliente }, { onConflict: 'client_id' }).select('id').single<{ id: string }>()
    expect(pr.error).toBeNull()
    expect((await db().from('medical_record_entries').insert({
      medical_record_id: pr.data!.id, appointment_id: ag.data!.id, professional_id: rede.professionalId,
      notes: 'evolução de agora', form_data: { ficha: FICHA },
    })).error).toBeNull()
    // A correção de antes: a versão guarda a ficha como estava.
    expect((await db().from('prontuario_versoes').insert({
      tenant_id: rede.tenantId, client_id: cliente, appointment_id: ag.data!.id,
      evolucao: 'evolução de agora', intercorrencias: null, ficha: FICHA_DE_ANTES,
      editada_por_nome: 'Profissional e2e', substituida_em: new Date(Date.now() - 3600_000).toISOString(),
    })).error).toBeNull()
  })

  test.afterAll(async () => {
    await db().from('lgpd_requests').delete().eq('client_id', cliente)
    await equipe?.limpar(); await rede?.limpar()
  })

  test('o pacote leva a ficha do procedimento legível, com o mapa em palavras', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: equipe!.estado })
    try {
      const p = await ctx.newPage()
      const r = await chamarAcao(p, 'actions/lgpd.ts', 'exportarDadosPelaEquipe', `/admin/clients/${cliente}`, [cliente, { incluirProntuario: true }])
      expect(r.texto).toContain('"ok":true')
    } finally { await ctx.close() }
    let caminho = ''
    await expect.poll(async () => {
      const { data } = await db().from('lgpd_requests').select('status, export_json_path').eq('client_id', cliente).maybeSingle()
      caminho = (data?.export_json_path as string | null) ?? ''
      return data?.status
    }, { timeout: 60_000 }).toBe('completed')
    const { data: url } = await db().storage.from('lgpd-exports').createSignedUrl(caminho, 60)
    const pacote = await (await fetch(url!.signedUrl)).json() as {
      prontuario: { atendimentos: { fichaDoProcedimento: { ficha: string; respostas: { pergunta: string; resposta: string; pontos?: unknown[] }[] } | null; versoesAnteriores?: { fichaDoProcedimento: { respostas: { pergunta: string; resposta: string }[] } | null }[] }[] }
    }
    const texto = JSON.stringify(pacote)
    expect(texto, 'nada de [object Object]').not.toContain('[object Object]')
    expect(texto, 'nem o caminho da foto').not.toContain('unidade/cliente/foto.jpg')

    const at = pacote.prontuario.atendimentos[0]!
    expect(at.fichaDoProcedimento?.ficha).toBe('Ficha da toxina')
    const respostas = at.fichaDoProcedimento!.respostas
    expect(respostas.find(x => x.pergunta === 'Área tratada')?.resposta).toBe('Testa')
    expect(respostas.find(x => x.pergunta === 'Mapa de aplicação')?.resposta).toBe('Toxina testa: 3 pontos — Toxina 6 U (planejado)')
    expect(respostas.find(x => x.pergunta === 'Mapa de aplicação')?.pontos).toHaveLength(3)
    expect(respostas.find(x => x.pergunta === 'Foto de antes')?.resposta).toBe('Foto anexada')

    // A versão de antes leva a ficha DELA, legível.
    const antes = at.versoesAnteriores?.[0]?.fichaDoProcedimento?.respostas ?? []
    expect(antes.find(x => x.pergunta === 'Área tratada')?.resposta, 'a ficha da versão de antes vai junto').toBe('Glabela')
  })
})
