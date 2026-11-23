import { test, expect, type Browser } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { leOSinalDaRede } from './apoio/sinais'

/**
 * A sessão só LÊ — e o dado de um módulo, só com o módulo (CLAUDE.md §4, F63:
 * "Configuração e dado sensível: a sessão só LÊ"; a varredura de conformidade
 * de 18/11: ATD-P01, ATD-P02, ATD-E01, AUT-01; migrations 20261124400001/2).
 *
 * Até aqui, pela chave pública (o token de qualquer membro da rede):
 *  - o PRONTUÁRIO (evolução, ficha de saúde, mapa e aplicações de injetáveis)
 *    se lia e se gravava sem o Prontuário — inclusive trocar a evolução do
 *    atendimento concluído sem versão (PR2b) e apagar o registro (§14);
 *  - o PROCEDIMENTO (preço, insumos) se mudava sem Procedimentos;
 *  - o PRODUTO se mudava sem o Estoque;
 *  - a corrente das AUTOMAÇÕES (domain_events, com o texto das mensagens
 *    recebidas) e as execuções se liam sem as Automações.
 *
 * O prontuário não se lê pela sessão de jeito nenhum, nem com o Prontuário,
 * nem a Admin (a sessão só lê SINAIS, §4; a tela assina o sinal). Quem tem o
 * Prontuário o vê pela TELA, que lê pelo servidor — é o controle. (Era por
 * ser módulo "só os meus"; o escopo saiu em 23/11, SM1, e a regra da sessão
 * ficou.)
 *
 * Provado COMO o membro (o token dele no PostgREST), numa rede `[e2e]`
 * própria. Cada caso tem o controle: o token LÊ o sinal da rede (ou a tela
 * mostra, no prontuário), então "não leu" não é uma sessão que não alcança
 * nada; e o que não se grava é recusado também à Admin — quem grava é o
 * servidor, depois da trava da action. Desde 19/11 a sessão só lê SINAIS (o
 * Heitor, "vai na 2"; CLAUDE.md §4): procedimento, produto e automação também
 * não se leem mais pela sessão, nem com o módulo (até ali o controle era a
 * sessão com o módulo LER a linha).
 */

const marca = Date.now().toString(36)
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const db = () => banco()

function comoMembro(m: MembroDeTeste): SupabaseClient {
  return createClient(URL_, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${m.accessToken}` } },
  })
}

let rede: OutraRede | null = null
const membros: MembroDeTeste[] = []
// Sem Prontuário, sem Procedimentos, sem Estoque, sem Automações — e com "A
// rede inteira", para a recusa das Automações ser do MÓDULO, não da abrangência.
let semNada: MembroDeTeste
let veProntuario: MembroDeTeste
let gerenciaProntuario: MembroDeTeste
let gerenciaProcedimentosEEstoque: MembroDeTeste
let automacoesNaUnidade: MembroDeTeste
let automacoesNaRede: MembroDeTeste
let admin: MembroDeTeste

const EVOLUCAO = `${PREFIXO} evolução ${marca}`
const ANAMNESE = `${PREFIXO} alergia ${marca}`
const TEXTO_DO_FATO = `${PREFIXO} mensagem recebida ${marca}`
let cliente = ''
let prontuario = ''
let entrada = ''
let foto = ''
let fichaDoAtendimento = ''
let termo = ''
let mapa = ''
let aplicacao = ''
let produto = ''
let fato = ''
let automacao = ''

test.describe.configure({ timeout: 180_000 })

test.beforeAll(async () => {
  test.setTimeout(600_000)
  rede = await criarOutraRede(`rlsp${marca}`)
  const tenant = rede.tenantId
  semNada = await criarMembro(`rlspn${marca}`, {
    tenant, rotulo: 'Sem os módulos', permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'crm', nivel: 'MANAGE' }],
  })
  // Da rede inteira, com Clientes: abre a ficha em /admin/clients (o controle pela tela).
  veProntuario = await criarMembro(`rlspv${marca}`, {
    tenant, rotulo: 'Vê o prontuário', permissoes: [{ modulo: 'medical_records', nivel: 'VIEW' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  gerenciaProntuario = await criarMembro(`rlspg${marca}`, {
    tenant, branchId: rede.branchId, rotulo: 'Gerencia o prontuário', permissoes: [{ modulo: 'medical_records', nivel: 'MANAGE' }],
  })
  gerenciaProcedimentosEEstoque = await criarMembro(`rlspe${marca}`, {
    tenant, branchId: rede.branchId, rotulo: 'Procedimentos e Estoque',
    permissoes: [{ modulo: 'procedures', nivel: 'MANAGE' }, { modulo: 'stock', nivel: 'MANAGE' }],
  })
  automacoesNaUnidade = await criarMembro(`rlspu${marca}`, {
    tenant, branchId: rede.branchId, rotulo: 'Automações na unidade', permissoes: [{ modulo: 'automations', nivel: 'VIEW' }],
  })
  automacoesNaRede = await criarMembro(`rlspr${marca}`, {
    tenant, rotulo: 'Automações na rede', permissoes: [{ modulo: 'automations', nivel: 'VIEW' }],
  })
  admin = await criarMembro(`rlspa${marca}`, { tenant, rotulo: 'Admin', donoDaRede: true, permissoes: [] })
  membros.push(semNada, veProntuario, gerenciaProntuario, gerenciaProcedimentosEEstoque, automacoesNaUnidade, automacoesNaRede, admin)

  // O prontuário de uma cliente: a ficha de saúde, a evolução de um
  // atendimento, um mapa e uma aplicação de injetáveis.
  cliente = await rede.criarCliente('Paciente do prontuário')
  const { data: pr, error: ePr } = await db().from('medical_records')
    .insert({ client_id: cliente, general_anamnesis: { allergies: ANAMNESE } }).select('id').single<{ id: string }>()
  expect(ePr, 'criar o prontuário').toBeNull()
  prontuario = pr!.id
  const { data: ag, error: eAg } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(eAg, 'criar o atendimento').toBeNull()
  const { data: en, error: eEn } = await db().from('medical_record_entries')
    .insert({ medical_record_id: prontuario, appointment_id: ag!.id, professional_id: rede.professionalId, notes: EVOLUCAO })
    .select('id').single<{ id: string }>()
  expect(eEn, 'criar a evolução').toBeNull()
  entrada = en!.id
  // A foto, a ficha do atendimento e o termo: as três tabelas clínicas que
  // ficaram com a política "operacional" da rede (só conferia a REDE) depois
  // da 20261124400002 — a entrega de 18/11 achou na prova.
  const { data: ft, error: eFt } = await db().from('record_photos')
    .insert({ entry_id: entrada, url: `e2e/${marca}.jpg`, type: 'before' }).select('id').single<{ id: string }>()
  expect(eFt, 'criar a foto').toBeNull()
  foto = ft!.id
  const { data: fa, error: eFa } = await db().from('anamnesis_data')
    .insert({ entry_id: entrada, form_data: { alergia: ANAMNESE } }).select('id').single<{ id: string }>()
  expect(eFa, 'criar a ficha do atendimento').toBeNull()
  fichaDoAtendimento = fa!.id
  const { data: tm, error: eTm } = await db().from('consent_terms')
    .insert({ medical_record_id: prontuario, title: `${PREFIXO} termo ${marca}`, content: 'e2e' }).select('id').single<{ id: string }>()
  expect(eTm, 'criar o termo').toBeNull()
  termo = tm!.id
  const { data: mp, error: eMp } = await db().from('injectable_maps')
    .insert({ tenant_id: tenant, client_id: cliente, branch_id: rede.branchId, name: `${PREFIXO} mapa ${marca}`, view: 'front', points: [] })
    .select('id').single<{ id: string }>()
  expect(eMp, 'criar o mapa de injetáveis').toBeNull()
  mapa = mp!.id
  const { data: ap, error: eAp } = await db().from('injectable_applications')
    .insert({ client_id: cliente, map_id: mapa, points: [], notes: `${PREFIXO} ${marca}` })
    .select('id').single<{ id: string }>()
  expect(eAp, 'criar a aplicação de injetáveis').toBeNull()
  aplicacao = ap!.id

  // Um produto DA UNIDADE (é o que o "ALL dentro da unidade" alcançava).
  const { data: prod, error: eProd } = await db().from('products')
    .insert({ tenant_id: tenant, branch_id: rede.branchId, name: `${PREFIXO} produto ${marca}`, unit: 'un', sale_price: 10 })
    .select('id').single<{ id: string }>()
  expect(eProd, 'criar o produto').toBeNull()
  produto = prod!.id

  // Um fato da corrente, com o texto de uma mensagem recebida, e uma
  // automação (rascunho: nada roda).
  const { data: f, error: eF } = await db().from('domain_events').insert({
    tenant_id: tenant, nome: 'conversa.mensagem_recebida', entidade: 'conversa', dados: { texto: TEXTO_DO_FATO },
    chave: `e2e:${marca}`, despachado_em: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(eF, 'criar o fato').toBeNull()
  fato = f!.id
  const { data: a, error: eA } = await db().from('automations')
    .insert({ tenant_id: tenant, nome: `${PREFIXO} automação ${marca}` }).select('id').single<{ id: string }>()
  expect(eA, 'criar a automação (rascunho)').toBeNull()
  automacao = a!.id
})

test.afterAll(async () => {
  if (fato) await db().from('domain_events').delete().eq('id', fato)
  for (const m of membros) await m?.limpar()
  await rede?.limpar()
})

async function linhas(m: MembroDeTeste, tabela: string, id: string): Promise<number> {
  const { data, error } = await comoMembro(m).from(tabela).select('id').eq('id', id)
  expect(error, `ler ${tabela} pela sessão`).toBeNull()
  return (data ?? []).length
}

async function fichaNaTela(browser: Browser, m: MembroDeTeste): Promise<string> {
  const ctx = await browser.newContext({ storageState: m.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/admin/clients/${cliente}`)
    await expect(p.getByText('Paciente do prontuário').first()).toBeVisible()
    return await p.content()
  } finally { await ctx.close() }
}

test.describe('prontuário: ninguém lê nem grava pela sessão; quem tem o Prontuário vê pela tela', () => {
  test('a sessão não lê a evolução, a ficha de saúde nem os injetáveis — sem o Prontuário, com ele, nem a Admin', async () => {
    for (const [tabela, id] of [
      ['medical_records', prontuario], ['medical_record_entries', entrada],
      ['record_photos', foto], ['anamnesis_data', fichaDoAtendimento], ['consent_terms', termo],
      ['injectable_maps', mapa], ['injectable_applications', aplicacao],
    ] as const) {
      for (const m of [semNada, veProntuario, gerenciaProntuario, admin]) {
        expect(await linhas(m, tabela, id), `${tabela}: nada pela sessão (é o servidor que lê, depois da trava)`).toBe(0)
      }
      // O registro existe: quem não o vê é a sessão.
      const { data: noBanco } = await db().from(tabela).select('id').eq('id', id)
      expect(noBanco ?? [], `${tabela}: o registro existe`).toHaveLength(1)
    }
    // E o Realtime da tela do atendimento escuta o SINAL, sem conteúdo.
    const { data: sinal, error } = await comoMembro(veProntuario).from('prontuario_sinais').select('*').eq('tenant_id', rede!.tenantId)
    expect(error, 'o sinal do prontuário se lê pela sessão').toBeNull()
    expect(sinal ?? [], 'gravar a evolução marcou o sinal da rede').toHaveLength(1)
    expect(Object.keys(sinal![0]!).sort(), 'o sinal não diz o atendimento nem a cliente').toEqual(['mudou_em', 'tenant_id'])
  })

  test('o controle: quem tem o Prontuário vê a ficha de saúde pela TELA; sem ele, a tela não mostra', async ({ browser }) => {
    expect(await fichaNaTela(browser, veProntuario), 'com o Prontuário em Ver, a tela mostra').toContain(ANAMNESE)
    expect(await fichaNaTela(browser, semNada), 'sem o Prontuário, a tela não mostra').not.toContain(ANAMNESE)
  })

  test('ninguém troca nem apaga a evolução pela sessão — nem com o Prontuário em Gerenciar, nem a Admin', async () => {
    for (const m of [semNada, gerenciaProntuario, admin]) {
      const api = comoMembro(m)
      const { data: trocou } = await api.from('medical_record_entries').update({ notes: 'invadido' }).eq('id', entrada).select('id')
      expect(trocou ?? [], 'a evolução não se troca pela sessão (é prontuario_corrigir_registro)').toEqual([])
      const { data: apagou } = await api.from('medical_record_entries').delete().eq('id', entrada).select('id')
      expect(apagou ?? [], 'a evolução não se apaga (§14)').toEqual([])
      const { data: ficha } = await api.from('medical_records').update({ general_anamnesis: { invadido: true } }).eq('id', prontuario).select('id')
      expect(ficha ?? [], 'a ficha de saúde não se troca pela sessão').toEqual([])
      const { data: mapaTrocado } = await api.from('injectable_maps').update({ name: 'invadido' }).eq('id', mapa).select('id')
      expect(mapaTrocado ?? [], 'o mapa de injetáveis não se troca pela sessão').toEqual([])
      const { error: plantou } = await api.from('injectable_applications').insert({ client_id: cliente, points: [], notes: `${PREFIXO} plantada ${marca}` })
      expect(plantou, 'a aplicação só nasce por injetavel_registrar_aplicacao').not.toBeNull()
      const { data: fotoTrocada } = await api.from('record_photos').update({ source: 'invadido' }).eq('id', foto).select('id')
      expect(fotoTrocada ?? [], 'a foto não se troca pela sessão').toEqual([])
      const { data: fichaTrocada } = await api.from('anamnesis_data').update({ form_data: { invadido: true } }).eq('id', fichaDoAtendimento).select('id')
      expect(fichaTrocada ?? [], 'a ficha do atendimento não se troca pela sessão').toEqual([])
      const { data: termoApagado } = await api.from('consent_terms').delete().eq('id', termo).select('id')
      expect(termoApagado ?? [], 'o termo não se apaga pela sessão (§14)').toEqual([])
      const { error: termoPlantado } = await api.from('consent_terms').insert({ medical_record_id: prontuario, title: `${PREFIXO} plantado ${marca}`, content: 'x' })
      expect(termoPlantado, 'o termo não nasce pela sessão').not.toBeNull()
    }
    const { data: fichaDoAtendimentoAinda } = await db().from('anamnesis_data').select('form_data').eq('id', fichaDoAtendimento).single<{ form_data: unknown }>()
    expect(JSON.stringify(fichaDoAtendimentoAinda?.form_data)).toContain(ANAMNESE)
    const { data: termosAinda } = await db().from('consent_terms').select('id').eq('medical_record_id', prontuario)
    expect((termosAinda ?? []).map(t => t.id), 'só o termo do teste, inteiro').toEqual([termo])
    const { data: ainda } = await db().from('medical_record_entries').select('notes').eq('id', entrada).single<{ notes: string }>()
    expect(ainda?.notes).toBe(EVOLUCAO)
    const { data: fichaAinda } = await db().from('medical_records').select('general_anamnesis').eq('id', prontuario).single<{ general_anamnesis: unknown }>()
    expect(JSON.stringify(fichaAinda?.general_anamnesis)).toContain(ANAMNESE)
    const { data: plantadas } = await db().from('injectable_applications').select('id').eq('client_id', cliente)
    expect((plantadas ?? []).length, 'só a aplicação do teste').toBe(1)
  })
})

test.describe('procedimentos e produtos: a sessão não lê nem grava; o servidor grava', () => {
  test('o preço do procedimento não muda pela sessão — sem Procedimentos, com Procedimentos em Gerenciar, nem a Admin', async () => {
    const { data: antes } = await db().from('procedures').select('price').eq('id', rede!.procedureId).single<{ price: number | string }>()
    for (const m of [semNada, gerenciaProcedimentosEEstoque, admin]) {
      const api = comoMembro(m)
      // O controle: o token vale (lê o sinal da rede); o procedimento, não.
      expect(await leOSinalDaRede(m.accessToken, rede!.tenantId), 'a sessão lê o sinal da rede').toBe(1)
      expect(await linhas(m, 'procedures', rede!.procedureId), 'o procedimento não sai pela sessão').toBe(0)
      const { data: mudou } = await api.from('procedures').update({ price: 999 }).eq('id', rede!.procedureId).select('id')
      expect(mudou ?? [], 'o preço só muda pela action (com o histórico de preço)').toEqual([])
      const { error: insumo } = await api.from('procedure_products').insert({ procedure_id: rede!.procedureId, product_id: produto, quantity: 1, unit_cost: 0 })
      expect(insumo, 'o insumo do procedimento só nasce pela action').not.toBeNull()
      const { error: novo } = await api.from('procedures').insert({ tenant_id: rede!.tenantId, name: `${PREFIXO} plantado ${marca}`, category: 'e2e', duration_min: 30, price: 1 })
      expect(novo, 'o procedimento só nasce pela action').not.toBeNull()
    }
    const { data: depois } = await db().from('procedures').select('price').eq('id', rede!.procedureId).single<{ price: number | string }>()
    expect(Number(depois?.price)).toBe(Number(antes?.price))
    const { data: insumos } = await db().from('procedure_products').select('id').eq('procedure_id', rede!.procedureId)
    expect(insumos ?? []).toEqual([])
  })

  test('o produto não muda pela sessão — sem o Estoque, com o Estoque em Gerenciar, nem a Admin', async () => {
    for (const m of [semNada, gerenciaProcedimentosEEstoque, admin]) {
      const api = comoMembro(m)
      const { data: mudou } = await api.from('products').update({ sale_price: 999, name: 'invadido' }).eq('id', produto).select('id')
      expect(mudou ?? [], 'o produto só muda pela action').toEqual([])
      const { data: apagou } = await api.from('products').delete().eq('id', produto).select('id')
      expect(apagou ?? [], 'o produto não se apaga pela sessão').toEqual([])
    }
    // O controle: o token vale (lê o sinal da rede); o produto, não.
    expect(await leOSinalDaRede(gerenciaProcedimentosEEstoque.accessToken, rede!.tenantId), 'a sessão lê o sinal da rede').toBe(1)
    expect(await linhas(gerenciaProcedimentosEEstoque, 'products', produto), 'o produto não sai pela sessão').toBe(0)
    const { data: ainda } = await db().from('products').select('name, sale_price').eq('id', produto).single<{ name: string; sale_price: number | string }>()
    expect(ainda?.name).toBe(`${PREFIXO} produto ${marca}`)
    expect(Number(ainda?.sale_price)).toBe(10)
  })
})

test.describe('automações: a sessão não lê, nem com as Automações; as telas escutam um sinal', () => {
  test('ninguém lê a corrente nem as automações pela sessão — nem com as Automações na rede, nem a Admin', async () => {
    for (const [tabela, id] of [['domain_events', fato], ['automations', automacao]] as const) {
      expect(await linhas(semNada, tabela, id), `${tabela}: sem as Automações, nada`).toBe(0)
      expect(await linhas(automacoesNaUnidade, tabela, id), `${tabela}: as Automações moram no portal da rede`).toBe(0)
      expect(await linhas(automacoesNaRede, tabela, id), `${tabela}: nem com as Automações na rede`).toBe(0)
      expect(await linhas(admin, tabela, id), `${tabela}: nem a Admin da rede`).toBe(0)
    }
    // O controle: o token vale — quem tem as Automações lê o sinal delas (o teste de baixo).
    for (const m of [automacoesNaRede, admin]) {
      expect(await leOSinalDaRede(m.accessToken, rede!.tenantId), 'o sinal da rede').toBe(1)
    }
  })

  test('o sinal das automações se lê, sem conteúdo, e marcou o fato novo', async () => {
    const { data, error } = await comoMembro(automacoesNaRede).from('automacoes_sinais').select('*').eq('tenant_id', rede!.tenantId)
    expect(error, 'o sinal existe e se lê pela sessão').toBeNull()
    expect(data ?? [], 'gravar o fato marcou o sinal da rede').toHaveLength(1)
    expect(Object.keys(data![0]!).sort(), 'o sinal não carrega conteúdo').toEqual(['mudou_em', 'tenant_id'])
  })
})
