import { test, expect } from '@playwright/test'
import { banco, tenantId, PREFIXO, apagarConversas } from './apoio/banco'

/**
 * A pessoa é UMA, mesmo falando com duas caixas.
 *
 * `conversations` era as duas coisas — a thread e a pessoa — e isso funcionava
 * enquanto cada pessoa tinha uma conversa só. Com vários números, a mesma pessoa
 * falando com duas caixas virava duas fichas de contato: dois nomes, duas listas
 * de tags, duas atribuições de anúncio. E `leads.conversation_id` é singular, por
 * isso o card ficava preso numa delas enquanto o atendimento acontecia na outra.
 *
 * O buraco aparecia exatamente no handoff — lead entra pelo marketing, a SDR
 * qualifica e agenda, a unidade assume por outro número —, que é o momento em que
 * ler o histórico é o que mais importa.
 *
 * ⚠️ Esta é a fase da ESPINHA: nenhum leitor usa `contacts` ainda. O que estes
 * testes protegem é que a ligação nasce certa e **não apodrece** — coluna que é
 * correta hoje e errada amanhã é pior que coluna que não existe.
 */

const marca = Date.now().toString(36)

type Linha = { id: string }

async function entregar(
  request: import('@playwright/test').APIRequestContext,
  token: string, telefone: string, sufixo: string,
) {
  return request.post('/api/webhooks/uazapi', {
    data: {
      token,
      data: {
        chat: { name: `${PREFIXO} Uma pessoa`, phone: telefone },
        message: {
          sender_pn: telefone,
          chatid: `${telefone}@s.whatsapp.net`,
          text: `oi pela caixa ${sufixo}`,
          messageTimestamp: Math.floor(Date.now() / 1000),
          id: `E2ECT_${sufixo}_${marca}`,
          fromMe: false,
        },
      },
    },
  })
}

test('duas caixas, duas conversas, UM contato', async ({ request }) => {
  const db       = banco()
  const tenant   = await tenantId()
  const telefone = '5548' + String(Date.now()).slice(-9)

  const tokenA = `e2e-ct-A-${marca}`
  const tokenB = `e2e-ct-B-${marca}`
  const caixas: string[] = []
  let convIds: string[] = []
  let contatoIds: string[] = []

  try {
    for (const [rotulo, token] of [['A', tokenA], ['B', tokenB]] as const) {
      const { data, error } = await db.from('whatsapp_numbers')
        .insert({
          tenant_id: tenant, provider: 'uazapi',
          label: `${PREFIXO} contato ${rotulo} ${marca}`,
          is_active: true,
          config: { token, baseUrl: 'https://e2e.invalido' },
        })
        .select('id').single<Linha>()
      expect(error, `criar a caixa ${rotulo}`).toBeNull()
      caixas.push(data!.id)
    }

    expect((await entregar(request, tokenA, telefone, 'A')).ok()).toBe(true)
    expect((await entregar(request, tokenB, telefone, 'B')).ok()).toBe(true)

    await expect.poll(async () => {
      const { data } = await db.from('conversations')
        .select('id, contato_id')
        .eq('tenant_id', tenant)
        .eq('contact_phone', telefone)
      convIds    = (data ?? []).map(c => c.id as string)
      contatoIds = (data ?? []).map(c => c.contato_id as string)
      return convIds.length
    }, { message: 'duas caixas ainda são duas conversas' }).toBe(2)

    // Nenhuma nasceu sem pessoa: é isso que impede a coluna de apodrecer.
    expect(contatoIds.filter(Boolean).length,
      'toda conversa nova tem de nascer ligada a um contato').toBe(2)

    // E é a MESMA pessoa. Sem isto, quem assume o atendimento na caixa B não
    // enxerga nada do que foi apurado na A.
    expect(new Set(contatoIds).size,
      'o mesmo telefone em duas caixas é uma pessoa só').toBe(1)
  } finally {
    // Conversas primeiro: elas referenciam as caixas. `apagarConversas` tira o
    // contato junto quando não sobrou thread nele.
    await apagarConversas(convIds)
    if (caixas.length) await db.from('whatsapp_numbers').delete().in('id', caixas)
  }
})

test('QUALQUER insert de conversa ganha contato — a garantia é do gatilho', async () => {
  const db       = banco()
  const tenant   = await tenantId()
  const telefone = '5548' + String(Date.now() + 1).slice(-9)

  let convId: string | null = null
  let contatoId: string | null = null

  try {
    // Insert cru, sem passar por `resolveConversation` nem pelas actions do CRM.
    // É assim que se prova que a ligação não depende de quem chama: existem três
    // pontos que criam conversa hoje e vão existir mais, e o código de aplicação
    // NÃO liga o contato — quem liga é `trg_conversa_ganha_contato`.
    //
    // Enquanto isso era feito no TypeScript, esquecer um ponto novo deixava a
    // coluna certa hoje e errada amanhã, sem nada quebrar no caminho.
    const { data, error } = await db.from('conversations')
      .insert({
        tenant_id:           tenant,
        branch_id:           null,
        channel:             'whatsapp',
        status:              'open',
        contact_name:        `${PREFIXO} gatilho ${marca}`,
        contact_phone:       telefone,
        contact_external_id: telefone,
        contact_aliases:     [telefone],
      })
      .select('id, contato_id')
      .single<{ id: string; contato_id: string | null }>()

    expect(error, 'o insert cru tem de funcionar').toBeNull()
    convId    = data!.id
    contatoId = data!.contato_id

    expect(contatoId,
      'conversa inserida sem contato_id tem de sair do banco COM um',
    ).not.toBeNull()

    const { data: contato } = await db.from('contacts')
      .select('identifiers, name, phone').eq('id', contatoId!).single<{
        identifiers: string[]; name: string | null; phone: string | null
      }>()

    expect(contato?.identifiers, 'o identificador da thread vai para a pessoa')
      .toContain(telefone)
    expect(contato?.phone).toBe(telefone)

    // ── E o contato APRENDE o que a thread descobre depois ──────────────────
    //
    // `completarIdentidade` descobre o telefone de quem chegou por @lid e o nome
    // de quem nasceu com o próprio identificador no lugar do nome. Se isso
    // ficasse só na conversa, a próxima mensagem que chegasse pelo alias novo não
    // acharia a pessoa e nasceria um segundo contato — em silêncio.
    const aliasNovo = `${telefone}@lid-${marca}`
    const { error: erroUpdate } = await db.from('conversations')
      .update({ contact_aliases: [telefone, aliasNovo] })
      .eq('id', convId)
    expect(erroUpdate).toBeNull()

    await expect.poll(async () => {
      const { data: depois } = await db.from('contacts')
        .select('identifiers').eq('id', contatoId!).single<{ identifiers: string[] }>()
      return depois?.identifiers ?? []
    }, {
      message: 'o alias que a thread aprendeu tem de chegar na pessoa',
    }).toContain(aliasNovo)
  } finally {
    await apagarConversas(convId ? [convId] : [])
  }
})

test('a rede inteira respeita as invariantes da espinha', async () => {
  const db     = banco()
  const tenant = await tenantId()

  const { data: conversas, error } = await db.from('conversations')
    .select('id, contact_aliases, contato_id')
    .eq('tenant_id', tenant)
  expect(error).toBeNull()

  const { data: contatos } = await db.from('contacts')
    .select('id, identifiers')
    .eq('tenant_id', tenant)

  const porId = new Map(
    (contatos ?? []).map(k => [k.id as string, (k.identifiers as string[] | null) ?? []]),
  )

  // 1. Ninguém sem pessoa. Uma conversa órfã não quebra nada HOJE, e é
  //    exatamente por isso que o apodrecimento passaria sem ninguém notar.
  const orfas = (conversas ?? []).filter(c => !c.contato_id)
  expect(orfas.map(c => c.id),
    'conversa sem contato: a ligação apodreceu em algum caminho de criação',
  ).toEqual([])

  // 2. A invariante que sustenta o cruzamento: os aliases da conversa são
  //    subconjunto dos identificadores da pessoa. Se um alias novo ficar só na
  //    conversa, a próxima mensagem que chegar por ele não acha o contato e
  //    nasce um segundo — em silêncio.
  const quebradas = (conversas ?? []).filter(c => {
    const dela = porId.get(c.contato_id as string) ?? []
    return ((c.contact_aliases as string[] | null) ?? []).some(a => !dela.includes(a))
  })
  expect(quebradas.map(c => c.id),
    'alias na conversa que o contato não conhece',
  ).toEqual([])

  // 3. Dois contatos não podem dividir identificador — isso é a mesma pessoa
  //    cadastrada duas vezes, e nenhum índice do banco consegue proibir
  //    sobreposição de array. A trava é este teste.
  const lista = (contatos ?? []).map(k => ({
    id: k.id as string, ids: (k.identifiers as string[] | null) ?? [],
  }))
  const cruzados: string[] = []
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      if (lista[i]!.ids.some(x => lista[j]!.ids.includes(x))) {
        cruzados.push(`${lista[i]!.id} × ${lista[j]!.id}`)
      }
    }
  }
  expect(cruzados, 'duas pessoas com o mesmo identificador').toEqual([])

  // ⚠️ Aqui havia uma quarta asserção — "nenhuma pessoa sem thread" — e ela
  // estava ERRADA. Contato órfão não é defeito: em produção conversa não se
  // apaga, e uma pessoa cujo único thread deixou de existir não faz mal a
  // ninguém. O que faz mal é a mesma pessoa cadastrada duas vezes, e isso é a
  // asserção 3.
  //
  // Ela reprovou na suíte inteira e passava isolada, porque cinco specs apagavam
  // a conversa que criaram sem saber que o gatilho havia criado um contato. Era
  // higiene de teste disfarçada de invariante — o helper `apagarConversas`
  // resolve a higiene, e a asserção saiu por não ser verdade.
})
