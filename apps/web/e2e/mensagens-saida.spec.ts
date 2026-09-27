import { test, expect, type Browser } from '@playwright/test'
import { banco, tenantId, PREFIXO, apagarConversas } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao } from './apoio/acao-direta'
import { subirUazapiFalsa, type UazapiFalsa } from './apoio/uazapi-falsa'

/**
 * A mensagem que SAI — pela pessoa no inbox e pelo motor de automações.
 *
 * Até 2026-09-27 nenhum teste exercitava o envio: a caixa de teste apontava
 * para `https://e2e.invalido`, então todo envio falhava na rede e o caminho de
 * sucesso nunca rodava. Aqui a caixa `[e2e]` aponta para uma uazapi falsa em
 * `127.0.0.1` (`apoio/uazapi-falsa.ts`): o app faz tudo de verdade e o teste
 * lê o que teria saído. Nada chega a ninguém.
 *
 * - envio pela caixa da conversa, com o id do provedor gravado;
 * - falha do provedor fica VISÍVEL na conversa, não vira "enviado";
 * - edição sai pela caixa que enviou e troca o id;
 * - conversa encerrada e janela de 24h fechada (oficial) recusam ANTES de
 *   gravar ou de chamar o provedor;
 * - uma automação disparada por uma mensagem recebida de verdade (webhook)
 *   manda a resposta, move o card, define o responsável, anota e marca ganho.
 *   As quatro ações de CRM nunca tinham rodado num teste — e duas estavam
 *   quebradas (ver o último caso).
 */

const marca = Date.now().toString(36)
const db = () => banco()

interface Fx {
  falsa: UazapiFalsa
  caixa: string; tokenCaixa: string
  oficial: string
  sdr: MembroDeTeste
  conversa: string; telefone: string
  conversaOficial: string
}
let f: Fx | null = null

const mensagensDa = async (conversa: string) =>
  (await db().from('messages').select('id, content, status, external_id, whatsapp_number_id, sent_by_id, direction')
    .eq('conversation_id', conversa).eq('direction', 'outbound').order('created_at')).data ?? []

async function comoSdr(browser: Browser) {
  const ctx = await browser.newContext({ storageState: f!.sdr.estado })
  const page = await ctx.newPage()
  return {
    enviar: (conversa: string, texto: string) =>
      chamarAcao(page, 'actions/inbox.ts', 'sendMessage', '/admin/inbox', [conversa, texto]),
    editar: (mensagem: string, texto: string) =>
      chamarAcao(page, 'actions/inbox.ts', 'editMessage', '/admin/inbox', [mensagem, texto]),
    fechar: () => ctx.close(),
  }
}

test.describe.serial('mensagens de saída', () => {
  test.beforeAll(async () => {
    const b = db()
    const tenant = await tenantId()
    const falsa = await subirUazapiFalsa()
    const tokenCaixa = `e2e-saida-${marca}`
    const telefone = '5548' + String(Date.now()).slice(-9)

    const ins = async (tabela: string, linha: Record<string, unknown>) => {
      const { data, error } = await b.from(tabela).insert(linha).select('id').single<{ id: string }>()
      expect(error, `criar ${tabela}`).toBeNull()
      return data!.id
    }
    const caixa = await ins('whatsapp_numbers', {
      tenant_id: tenant, provider: 'uazapi', label: `${PREFIXO} Saída ${marca}`, is_active: true,
      config: { token: tokenCaixa, baseUrl: falsa.url },
    })
    const phoneNumberId = `e2e${Date.now()}`
    const oficial = await ins('whatsapp_numbers', {
      tenant_id: tenant, provider: 'official', label: `${PREFIXO} Oficial saída ${marca}`, is_active: true,
      phone_number_id: phoneNumberId,
      config: { provider: 'official', phoneNumberId, accessToken: 'x', verifyToken: 'x', appSecret: 'x' },
    })
    const agora = new Date().toISOString()
    const conversa = await ins('conversations', {
      tenant_id: tenant, status: 'open', channel: 'whatsapp', provider: 'uazapi',
      whatsapp_number_id: caixa, contact_name: `${PREFIXO} Destino ${marca}`,
      contact_phone: telefone, contact_external_id: telefone, contact_aliases: [telefone],
      last_message_at: agora, last_inbound_at: agora, last_message: 'oi',
    })
    const telOficial = '5548' + String(Date.now() + 7).slice(-9)
    const conversaOficial = await ins('conversations', {
      tenant_id: tenant, status: 'open', channel: 'whatsapp', provider: 'official',
      whatsapp_number_id: oficial, contact_name: `${PREFIXO} Oficial ${marca}`,
      contact_phone: telOficial, contact_external_id: telOficial, contact_aliases: [telOficial],
      // Dois dias atrás: a janela de 24h fechou.
      last_message_at: agora, last_inbound_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    })
    const sdr = await criarMembro(`saida${marca}`, { rotulo: 'SDR saída', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }] })
    f = { falsa, caixa, tokenCaixa, oficial, sdr, conversa, telefone, conversaOficial }
  })

  test.afterAll(async () => {
    if (!f) return
    const b = db()
    await apagarConversas([f.conversa, f.conversaOficial])
    await b.from('whatsapp_numbers').delete().in('id', [f.caixa, f.oficial])
    await f.sdr.limpar()
    await f.falsa.fechar()
  })

  test('envia pela caixa da conversa e grava o id que o provedor devolveu', async ({ browser }) => {
    const sdr = await comoSdr(browser)
    try {
      await sdr.enviar(f!.conversa, `${PREFIXO} olá ${marca}`)
    } finally {
      await sdr.fechar()
    }
    const saiu = f!.falsa.para('/send/text')
    expect(saiu).toHaveLength(1)
    expect(saiu[0]!.token, 'com o token da caixa').toBe(f!.tokenCaixa)
    expect(saiu[0]!.corpo).toMatchObject({ number: f!.telefone, text: `${PREFIXO} olá ${marca}` })

    const [msg] = await mensagensDa(f!.conversa)
    expect(msg).toMatchObject({
      content: `${PREFIXO} olá ${marca}`, status: 'sent', external_id: 'falsa-1',
      whatsapp_number_id: f!.caixa, sent_by_id: f!.sdr.userId,
    })
  })

  test('falha do provedor fica visível na conversa, não vira "enviado"', async ({ browser }) => {
    f!.falsa.modo = 'erro'
    const sdr = await comoSdr(browser)
    try {
      await sdr.enviar(f!.conversa, `${PREFIXO} vai falhar ${marca}`)
    } finally {
      await sdr.fechar()
      f!.falsa.modo = 'ok'
    }
    const msgs = await mensagensDa(f!.conversa)
    expect(msgs.at(-1)).toMatchObject({ content: `${PREFIXO} vai falhar ${marca}`, status: 'failed', external_id: null })
  })

  test('editar sai pela caixa que enviou e troca o id da mensagem', async ({ browser }) => {
    const [primeira] = await mensagensDa(f!.conversa)
    const antes = f!.falsa.para('/message/edit').length
    const sdr = await comoSdr(browser)
    try {
      await sdr.editar(primeira!.id as string, `${PREFIXO} olá, corrigido ${marca}`)
    } finally {
      await sdr.fechar()
    }
    const edicoes = f!.falsa.para('/message/edit')
    expect(edicoes).toHaveLength(antes + 1)
    expect(edicoes.at(-1)!.corpo).toMatchObject({ id: 'falsa-1', text: `${PREFIXO} olá, corrigido ${marca}` })
    expect(edicoes.at(-1)!.token).toBe(f!.tokenCaixa)

    const { data } = await db().from('messages').select('content, external_id').eq('id', primeira!.id).single()
    expect(data!.content).toBe(`${PREFIXO} olá, corrigido ${marca}`)
    expect(data!.external_id, 'o WhatsApp troca o id ao editar').not.toBe('falsa-1')
  })

  test('conversa encerrada e janela fechada recusam antes de gravar e de chamar o provedor', async ({ browser }) => {
    await db().from('conversations').update({ status: 'closed' }).eq('id', f!.conversa)
    const chamadasAntes = f!.falsa.chamadas.length
    const emUazapi = (await mensagensDa(f!.conversa)).length
    const noOficial = (await mensagensDa(f!.conversaOficial)).length

    const sdr = await comoSdr(browser)
    try {
      await sdr.enviar(f!.conversa, `${PREFIXO} encerrada ${marca}`)
      await sdr.enviar(f!.conversaOficial, `${PREFIXO} fora da janela ${marca}`)
    } finally {
      await sdr.fechar()
      await db().from('conversations').update({ status: 'open' }).eq('id', f!.conversa)
    }
    expect(f!.falsa.chamadas.length, 'nada saiu').toBe(chamadasAntes)
    expect((await mensagensDa(f!.conversa)).length, 'nada gravado na encerrada').toBe(emUazapi)
    expect((await mensagensDa(f!.conversaOficial)).length, 'nada gravado fora da janela').toBe(noOficial)
  })
})

test.describe.serial('automação que fala e mexe no card', () => {
  const MARCA_TEXTO = `quero-agendar-${marca}`
  let falsa: UazapiFalsa | null = null
  let caixa: string | null = null
  let funil: string | null = null
  let etapas: { inicial: string; seguinte: string; ganho: string } | null = null
  let lead: string | null = null
  let automacao: string | null = null
  let responsavel: MembroDeTeste | null = null
  const token = `e2e-auto-${marca}`
  const telefone = '5548' + String(Date.now() + 3).slice(-9)

  test.beforeAll(async () => {
    const b = db()
    const tenant = await tenantId()
    falsa = await subirUazapiFalsa()
    const ins = async (tabela: string, linha: Record<string, unknown>) => {
      const { data, error } = await b.from(tabela).insert(linha).select('id').single<{ id: string }>()
      expect(error, `criar ${tabela}`).toBeNull()
      return data!.id
    }
    caixa = await ins('whatsapp_numbers', {
      tenant_id: tenant, provider: 'uazapi', label: `${PREFIXO} Auto ${marca}`, is_active: true,
      config: { token, baseUrl: falsa.url },
    })
    funil = await ins('crm_funnels', { tenant_id: tenant, name: `${PREFIXO} Funil auto ${marca}`, position: 91 })
    etapas = {
      inicial:  await ins('crm_stages', { tenant_id: tenant, funnel_id: funil, name: `${PREFIXO} Novo`, position: 0, outcome: 'OPEN' }),
      seguinte: await ins('crm_stages', { tenant_id: tenant, funnel_id: funil, name: `${PREFIXO} Em contato`, position: 1, outcome: 'OPEN' }),
      ganho:    await ins('crm_stages', { tenant_id: tenant, funnel_id: funil, name: `${PREFIXO} Fechou`, position: 2, outcome: 'WON' }),
    }
    // A oportunidade nasce ANTES da conversa, pelo telefone — como o cadastro
    // manual. O gatilho do banco dá a ela uma pessoa; quando a mensagem chegar,
    // a conversa cai na mesma pessoa. A conversa NÃO fica ligada ao card
    // (`lead_id` nulo): o motor tem de achar a oportunidade pela pessoa.
    lead = await ins('leads', { tenant_id: tenant, name: `${PREFIXO} Lead auto ${marca}`, phone: telefone, crm_stage_id: etapas.inicial })
    responsavel = await criarMembro(`resp${marca}`, { rotulo: 'Responsável auto', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }] })

    const no = (id: string, tipo: string, x: number, nome: string, config: Record<string, unknown>) =>
      ({ id, tipo, nome, pos: { x, y: 0 }, config })
    automacao = await ins('automations', {
      tenant_id: tenant, nome: `${PREFIXO} Resposta e card ${marca}`, status: 'ATIVA',
      gatilhos: ['conversa.mensagem_recebida'],
      // Sem silêncio noturno: o teste roda a qualquer hora.
      limites: { silencioDe: '', silencioAte: '', tetoPorClienteDia: 10 },
      grafo: {
        nos: [
          no('g1', 'gatilho.evento', 0, 'Mensagem recebida', { evento: 'conversa.mensagem_recebida' }),
          // A condição pelo texto é o que isola o teste: uma mensagem real que
          // chegue no mesmo minuto dispara a automação e para aqui.
          no('c1', 'condicao.se', 200, 'É o teste', { grupo: { juncao: 'e', regras: [
            { campo: 'evento.dados.texto', operador: 'igual', valor: MARCA_TEXTO },
          ] } }),
          no('a1', 'acao.mensagem', 400, 'Responder', { canal: 'whatsapp', texto: 'Oi, {{evento.dados.contatoNome}}! Já te respondo.' }),
          no('a2', 'acao.mover_etapa', 600, 'Mover', { etapaId: etapas.seguinte }),
          no('a3', 'acao.atribuir', 800, 'Atribuir', { usuarioId: responsavel.userId }),
          no('a4', 'acao.anotar', 1000, 'Anotar', { texto: `Respondeu: {{evento.dados.texto}}` }),
          no('a5', 'acao.desfecho', 1200, 'Ganhou', { desfecho: 'ganho' }),
        ],
        ligacoes: [
          { id: 'l1', de: 'g1', para: 'c1' },
          { id: 'l2', de: 'c1', para: 'a1', saida: 'sim' },
          { id: 'l3', de: 'a1', para: 'a2' },
          { id: 'l4', de: 'a2', para: 'a3' },
          { id: 'l5', de: 'a3', para: 'a4' },
          { id: 'l6', de: 'a4', para: 'a5' },
        ],
      },
    })
  })

  test.afterAll(async () => {
    const b = db()
    if (automacao) {
      const { data: runs } = await b.from('automation_runs').select('id').eq('automation_id', automacao)
      for (const r of runs ?? []) await b.from('automation_run_steps').delete().eq('run_id', r.id as string)
      await b.from('automation_runs').delete().eq('automation_id', automacao)
      await b.from('automations').delete().eq('id', automacao)
    }
    const { data: convs } = await b.from('conversations').select('id').eq('whatsapp_number_id', caixa ?? '')
    const { data: l } = await b.from('leads').select('contato_id').eq('id', lead ?? '').maybeSingle()
    if (lead) {
      await b.from('lead_events').delete().eq('lead_id', lead)
      await b.from('domain_events').delete().eq('entidade_id', lead)
      await b.from('leads').delete().eq('id', lead)
    }
    await apagarConversas((convs ?? []).map(c => c.id as string))
    if (l?.contato_id) await b.from('contacts').delete().eq('id', l.contato_id)
    if (caixa) await b.from('whatsapp_numbers').delete().eq('id', caixa)
    if (funil) {
      await b.from('crm_stages').delete().eq('funnel_id', funil)
      await b.from('crm_funnels').delete().eq('id', funil)
    }
    await responsavel?.limpar()
    await falsa?.fechar()
  })

  test('mensagem recebida → responde, move, atribui, anota e marca ganho', async ({ request }) => {
    const r = await request.post('/api/webhooks/uazapi', { data: {
      token,
      data: {
        chat: { name: `${PREFIXO} Cliente auto ${marca}`, phone: telefone },
        message: {
          sender_pn: telefone, chatid: `${telefone}@s.whatsapp.net`, text: MARCA_TEXTO,
          messageTimestamp: Math.floor(Date.now() / 1000), id: `E2EAUTO_${marca}`, fromMe: false,
        },
      },
    } })
    expect(r.ok()).toBe(true)

    await expect.poll(async () => {
      const { data } = await db().from('automation_runs').select('status, erro').eq('automation_id', automacao!).maybeSingle()
      return data?.status ?? null
    }, { message: 'a automação deveria ter rodado até o fim', timeout: 30_000 }).toBe('ok')

    const { data: run } = await db().from('automation_runs').select('id').eq('automation_id', automacao!).single()
    const { data: passos } = await db().from('automation_run_steps')
      .select('tipo, status, resumo').eq('run_id', run!.id as string).order('ordem')
    const resumo = (tipo: string) => passos!.find(p => p.tipo === tipo)?.resumo as Record<string, unknown>

    expect(resumo('acao.mensagem'), 'respondeu').toMatchObject({ enviada: true })
    expect(resumo('acao.mover_etapa'), 'moveu o card').toMatchObject({ movido: true })
    expect(resumo('acao.atribuir'), 'definiu o responsável').toMatchObject({ atribuido: true })
    expect(resumo('acao.anotar'), 'anotou na linha do tempo').toMatchObject({ anotado: true })
    expect(resumo('acao.desfecho'), 'marcou como ganho').toMatchObject({ movido: true, desfecho: 'ganho' })

    // O que saiu para o "cliente": pela caixa da conversa, com a variável trocada.
    const saiu = falsa!.para('/send/text')
    expect(saiu).toHaveLength(1)
    // O nome é o do CARD: a pessoa nasceu pela oportunidade, e o nome dela vence
    // o do perfil do WhatsApp (propagação de nome, §9.2.1).
    expect(saiu[0]!.corpo).toMatchObject({ number: telefone, text: `Oi, ${PREFIXO} Lead auto ${marca}! Já te respondo.` })

    // O card, no banco.
    const { data: card } = await db().from('leads').select('crm_stage_id, owner_id').eq('id', lead!).single()
    expect(card).toMatchObject({ crm_stage_id: etapas!.ganho, owner_id: responsavel!.userId })
    const { data: linha } = await db().from('lead_events').select('type, changes').eq('lead_id', lead!)
    expect((linha ?? []).filter(e => e.type === 'STAGE_CHANGED')).toHaveLength(2)
    expect(JSON.stringify(linha)).toContain(`Respondeu: ${MARCA_TEXTO}`)
  })
})
