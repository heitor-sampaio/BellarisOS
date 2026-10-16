import { test, expect, type Page } from '@playwright/test'
import { banco, PREFIXO, apagarConversas } from './apoio/banco'
import { apagarDocumentosEmitidos } from './apoio/limpeza'
import { subirOpenaiFalsa, type OpenaiFalsa } from './apoio/openai-falsa'
import { redeDoCopilot, contraAFalsa, comSessao, falarComOCopilot, esperarResposta, type RedeDoCopilot } from './apoio/copilot'

/**
 * O Copilot a par do que o sistema ganhou depois dele (pedido do Heitor,
 * 2026-10-16):
 *  - as TELAS que a pessoa abre vão nas instruções, tiradas do menu e das abas
 *    (as novas — Documentos, Tags, Importações, Ações em lote — aparecem sem
 *    ninguém lembrar de escrevê-las no prompt);
 *  - as tags da rede (2026-10-13): um vocabulário, sem caixa — a lista por tag
 *    acha "vip" pedindo "Vip", e marcar/desmarcar tag é pelo cartão;
 *  - o responsável da oportunidade (2026-10-09): criar com responsável e
 *    valor, e trocar o responsável, pelo núcleo da tela;
 *  - a tela de Documentos (2026-10-14): a situação de cada termo e contrato;
 *  - o que a Meta cobra (2026-10-15): o mês de cada número oficial.
 */
test.skip(!contraAFalsa(), 'só contra o build: o servidor precisa da OpenAI falsa')
test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let falsa: OpenaiFalsa
let rede: RedeDoCopilot
let clienteVip: string
let clienteSemTag: string
let caixa: string
const documentos: string[] = []

async function chamar(p: Page, nome: string, args: Record<string, unknown>) {
  falsa.zerar()
  falsa.roteiro.push({ chamar: [{ nome, args }] }, { texto: 'Pronto.' })
  await falarComOCopilot(p, `teste ${nome}`)
  await esperarResposta(p)
  const saida = falsa.saidasDeFerramenta().filter(s => s.nome === nome).at(-1)
  return { saida: saida?.saida as Record<string, unknown> | undefined, oferecidas: falsa.ferramentasOferecidas(0) }
}

async function pedir(p: Page, nome: string, args: Record<string, unknown>) {
  falsa.zerar()
  falsa.roteiro.push({ chamar: [{ nome, args }] }, { texto: 'Confira o cartão.' })
  const painel = await falarComOCopilot(p, `teste ${nome}`)
  await esperarResposta(p)
  return painel.locator('.copilot-cartao[data-cartao="acao"]').last()
}
const ultimaSaida = () => falsa.saidasDeFerramenta().at(-1)?.saida as { erro?: string } | undefined
const instrucoes = () => (falsa.respostas()[0]?.corpo.instructions ?? '') as string
const nomeDe = async (userId: string) => (await db().from('users').select('name').eq('id', userId).single()).data!.name as string

test.beforeAll(async () => {
  test.setTimeout(240_000)
  falsa = await subirOpenaiFalsa()
  rede = await redeDoCopilot(`nov${marca}`)
  const t = rede.outra.tenantId
  // "vip" minúsculo no cliente; o vocabulário da rede nova tem "VIP".
  clienteVip = await rede.outra.criarCliente('Novidade Vip')
  expect((await db().from('clients').update({ tags: ['vip'] }).eq('id', clienteVip)).error).toBeNull()
  clienteSemTag = await rede.outra.criarCliente('Novidade Sem Tag')

  // Um termo emitido e pronto para enviar (a situação "A enviar").
  const { data: m, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: t, p_modelo: null, p_nome: `${PREFIXO} Modelo copnov ${marca}`, p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: 'AGENDAMENTO', p_exigencia: 'BLOQUEIA', p_texto: '# Termo\n\nEu, **{{cliente.nome}}**, autorizo.\n\n[[assinatura]]',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(error).toBeNull()
  const modelo = (m as { id: string }).id
  const { data: versao } = await db().from('document_template_versions').select('id').eq('template_id', modelo).single<{ id: string }>()
  const doc = await db().from('issued_documents').insert({
    tenant_id: t, branch_id: rede.outra.branchId, client_id: clienteSemTag, template_id: modelo, template_version_id: versao!.id,
    kind: 'TERMO', source: 'EDITOR', title: `${PREFIXO} Termo copnov ${marca}`, moment: 'AGENDAMENTO', enforcement: 'BLOQUEIA',
    status: 'PENDENTE', content: '{}', content_sha256: 'a'.repeat(64),
  }).select('id').single<{ id: string }>()
  expect(doc.error, 'emitir o termo').toBeNull()
  documentos.push(doc.data!.id)
  await db().from('issued_document_events').insert({ issued_document_id: doc.data!.id, tenant_id: t, kind: 'EMITIDO' })

  // Um número oficial com um template de marketing entregue e cobrado no mês.
  const fone = `e2ecopnov${Date.now()}`
  const n = await db().from('whatsapp_numbers').insert({
    tenant_id: t, provider: 'official', label: `${PREFIXO} Oficial copnov ${marca}`, is_active: true, is_default: true,
    phone_number_id: fone, waba_id: `waba-copnov-${marca}`,
    config: { provider: 'official', phoneNumberId: fone, wabaId: `waba-copnov-${marca}`, accessToken: 'x', verifyToken: 'x', appSecret: 'x' },
  }).select('id').single<{ id: string }>()
  expect(n.error, 'criar o número oficial').toBeNull()
  caixa = n.data!.id
  const conv = await db().from('conversations').insert({
    tenant_id: t, status: 'open', channel: 'whatsapp', provider: 'official', whatsapp_number_id: caixa,
    contact_name: `${PREFIXO} Conv copnov ${marca}`, contact_phone: '5548900000001', contact_external_id: '5548900000001',
  }).select('id').single<{ id: string }>()
  expect(conv.error, 'criar a conversa').toBeNull()
  const msg = await db().from('messages').insert({
    conversation_id: conv.data!.id, tenant_id: t, direction: 'outbound', content: 'Promoção', channel: 'manual',
    status: 'delivered', whatsapp_number_id: caixa, cobranca_categoria: 'marketing', cobrada: true,
  })
  expect(msg.error, 'gravar a mensagem cobrada').toBeNull()
})

test.afterAll(async () => {
  const t = rede?.outra.tenantId
  if (t) {
    if (documentos.length) await apagarDocumentosEmitidos(documentos)
    const { data: convs } = await db().from('conversations').select('id').eq('tenant_id', t)
    await apagarConversas((convs ?? []).map(c => c.id as string))
    await db().from('whatsapp_numbers').delete().eq('tenant_id', t)
    const leads = ((await db().from('leads').select('id').eq('tenant_id', t)).data ?? []).map(l => l.id as string)
    if (leads.length) {
      await db().from('lead_events').delete().in('lead_id', leads)
      await db().from('lead_procedures').delete().in('lead_id', leads)
      await db().from('leads').delete().in('id', leads)
    }
  }
  await rede?.limpar()
  await falsa?.fechar()
})

test('as instruções levam as telas que a pessoa abre — as novas também, no portal certo', async ({ browser }) => {
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/documentos')
    falsa.zerar()
    falsa.roteiro.push({ texto: 'Oi.' })
    await falarComOCopilot(p, 'oi')
    await esperarResposta(p)
    const texto = instrucoes()
    for (const tela of ['[Documentos](/admin/documentos)', '[Configurações → Tags](/admin/settings?tab=tags)',
      '[Configurações → Importações](/admin/settings?tab=importacoes)', '[Configurações → Ações em lote](/admin/settings?tab=lotes)']) {
      expect(texto, tela).toContain(tela)
    }
    // A tela aberta também é dita.
    expect(texto).toMatch(/tela de Documentos/)
  })

  // Quem só tem a agenda não recebe a tela que não abre.
  const soAgenda = await rede.membro('ag', [{ modulo: 'agenda', nivel: 'VIEW' }])
  await comSessao(browser, soAgenda.estado, async p => {
    await p.goto('/admin/agenda')
    falsa.zerar()
    falsa.roteiro.push({ texto: 'Oi.' })
    await falarComOCopilot(p, 'oi')
    await esperarResposta(p)
    const texto = instrucoes()
    expect(texto).toContain('[Agenda](/admin/agenda)')
    expect(texto).not.toContain('Configurações →')
    expect(texto).not.toContain('/admin/financeiro')
  })
})

test('clientes por tag: sem caixa, e a tag que não existe mostra o vocabulário da rede', async ({ browser }) => {
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/clients')
    const { saida } = await chamar(p, 'clientes', { filtro: 'tag', tag: 'Vip' })
    const ids = ((saida?.clientes ?? []) as { id: string }[]).map(c => c.id)
    expect(ids, JSON.stringify(saida)).toEqual([clienteVip])

    const { saida: errada } = await chamar(p, 'clientes', { filtro: 'tag', tag: 'Platinum' })
    expect(errada?.erro).toMatch(/Platinum/)
    expect(errada?.erro).toContain('VIP')
  })
})

test('marcar e desmarcar tag pelo cartão — o nome do vocabulário, nada antes do Confirmar', async ({ browser }) => {
  const tags = async () => ((await db().from('clients').select('tags').eq('id', clienteSemTag).single()).data!.tags as string[] | null) ?? []
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/clients')
    const cartao = await pedir(p, 'marcar_tags', { cliente: clienteSemTag, adicionar: ['vip', 'indicação'] })
    await expect(cartao.getByText('Marcar tags')).toBeVisible()
    await expect(cartao.getByText('VIP, Indicação')).toBeVisible()
    expect(await tags()).toEqual([])
    await cartao.getByRole('button', { name: 'Confirmar' }).click()
    await expect(cartao.getByRole('status')).toContainText('Feito')
    expect(await tags()).toEqual(['VIP', 'Indicação'])

    const tirar = await pedir(p, 'marcar_tags', { cliente: clienteSemTag, remover: ['vip'] })
    await tirar.getByRole('button', { name: 'Confirmar' }).click()
    await expect(tirar.getByRole('status')).toContainText('Feito')
    expect(await tags()).toEqual(['Indicação'])

    // Tag nova é criada em Configurações → Tags, não pelo Copilot.
    await pedir(p, 'marcar_tags', { cliente: clienteSemTag, adicionar: ['Platinum'] })
    expect(ultimaSaida()?.erro).toMatch(/Configurações → Tags/)
  })
})

test('oportunidade com responsável e valor; trocar o responsável grava DE → PARA "via Copilot"', async ({ browser }) => {
  const vendedora = await rede.membro('ven', [{ modulo: 'crm', nivel: 'MANAGE' }])
  const nomeVendedora = await nomeDe(vendedora.userId)
  const nomeDono = await nomeDe(rede.dono.userId)
  const lead = `${PREFIXO} Lead copnov${marca}`
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/oportunidades')
    const criar = await pedir(p, 'criar_oportunidade', { nome: lead, telefone: '48999990001', valor: 1500, responsavel: nomeVendedora })
    await expect(criar.getByText(nomeVendedora)).toBeVisible()
    await expect(criar.getByText('R$ 1.500,00')).toBeVisible()
    await criar.getByRole('button', { name: 'Confirmar' }).click()
    await expect(criar.getByRole('status')).toContainText('Feito')
    const { data: criado } = await db().from('leads').select('id, owner_id, value').eq('tenant_id', rede.outra.tenantId).eq('name', lead).single()
    expect(criado).toMatchObject({ owner_id: vendedora.userId, value: 1500 })

    const { saida } = await chamar(p, 'oportunidades', { busca: 'copnov' })
    expect(saida?.oportunidades).toEqual([expect.objectContaining({ id: criado!.id, responsavel: nomeVendedora, jaECliente: false })])

    const trocar = await pedir(p, 'trocar_responsavel', { oportunidade: criado!.id, responsavel: nomeDono })
    await expect(trocar.getByText(`${nomeVendedora} → ${nomeDono}`)).toBeVisible()
    expect((await db().from('leads').select('owner_id').eq('id', criado!.id).single()).data!.owner_id).toBe(vendedora.userId)
    await trocar.getByRole('button', { name: 'Confirmar' }).click()
    await expect(trocar.getByRole('status')).toContainText('Feito')
    expect((await db().from('leads').select('owner_id').eq('id', criado!.id).single()).data!.owner_id).toBe(rede.dono.userId)
    // Dois: o da criação (de quem criou para a vendedora, como a tela faz) e o da troca.
    const { data: evs } = await db().from('lead_events').select('actor_name, changes').eq('lead_id', criado!.id).eq('type', 'OWNER_CHANGED').order('created_at')
    expect(evs!.map(e => e.changes)).toEqual([
      [{ campo: 'Responsável', de: nomeDono, para: nomeVendedora }],
      [{ campo: 'Responsável', de: nomeVendedora, para: nomeDono }],
    ])
    for (const e of evs!) expect(e.actor_name).toMatch(/\(via Copilot\)$/)
  })

  // O "só os meus" do CRM vê, mas não troca nem escolhe outra pessoa (a regra da tela).
  const soOsMeus = await rede.membro('own', [{ modulo: 'crm', nivel: 'MANAGE', escopo: 'OWN' }])
  await comSessao(browser, soOsMeus.estado, async p => {
    await p.goto('/admin/oportunidades')
    const { oferecidas } = await chamar(p, 'oportunidades', {})
    expect(oferecidas).toContain('criar_oportunidade')
    expect(oferecidas).not.toContain('trocar_responsavel')
    await pedir(p, 'criar_oportunidade', { nome: `${lead} 2`, telefone: '48999990002', responsavel: nomeDono })
    expect(ultimaSaida()?.erro).toMatch(/responsável/i)
  })
})

test('documentos: a situação de cada termo — e sem o módulo, nem a ferramenta', async ({ browser }) => {
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/documentos')
    const { saida } = await chamar(p, 'documentos', { situacao: 'a_enviar' })
    expect(saida?.documentos).toEqual([expect.objectContaining({ titulo: `${PREFIXO} Termo copnov ${marca}`, situacao: 'A enviar' })])
    expect(JSON.stringify(saida)).toContain('Novidade Sem Tag')
  })
  const semDocumentos = await rede.membro('doc', [{ modulo: 'clients', nivel: 'VIEW' }])
  await comSessao(browser, semDocumentos.estado, async p => {
    await p.goto('/admin/clients')
    const { oferecidas } = await chamar(p, 'buscar', { termo: 'copnov' })
    expect(oferecidas).not.toContain('documentos')
  })
})

test('o que a Meta cobrou no mês, por número — só para quem vê as integrações', async ({ browser }) => {
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/dashboard')
    const { saida } = await chamar(p, 'cobranca_do_whatsapp', {})
    expect(saida?.numeros).toEqual([expect.objectContaining({
      numero: `${PREFIXO} Oficial copnov ${marca}`, estimativa: expect.stringMatching(/^R\$\s0,32$/), pagamentoRecusado: false,
    })])
    expect(JSON.stringify(saida)).toMatch(/marketing/i)
  })
  const semConfig = await rede.membro('cfg', [{ modulo: 'crm', nivel: 'MANAGE' }])
  await comSessao(browser, semConfig.estado, async p => {
    await p.goto('/admin/dashboard')
    const { oferecidas } = await chamar(p, 'buscar', { termo: 'copnov' })
    expect(oferecidas).not.toContain('cobranca_do_whatsapp')
  })
})
