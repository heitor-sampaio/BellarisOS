import { test, expect } from '@playwright/test'
import { banco, apagarConversas } from './apoio/banco'

/**
 * O caso mais difícil da Fase 2: o fato nasce no WEBHOOK, sem ninguém logado.
 * Aqui se confere que conversa iniciada, veio de anúncio e mensagem recebida
 * saem com ator 'sistema' e origem 'webhook' — que é o que uma automação de
 * primeiro atendimento precisa para não responder à própria clínica.
 */
const telefone = '5548' + String(Date.now()).slice(-9)
let convId: string | null = null

test.afterAll(async () => {
  const db = banco()
  if (convId) {
    await apagarConversas([convId])
  }
})

test('mensagem de anúncio pelo webhook vira conversa + 3 eventos', async ({ request }) => {
  const db = banco()
  const { data: cfg } = await db.from('integration_configs')
    .select('config').eq('provider', 'uazapi').eq('is_active', true).maybeSingle()
  const token = (cfg?.config as Record<string, string> | null)?.token
  test.skip(!token, 'uazapi não configurada neste banco')

  const res = await request.post('/api/webhooks/uazapi', {
    data: {
      token,
      data: {
        chat: { name: '[e2e] Contato anuncio', phone: telefone },
        message: {
          sender_pn: telefone,
          chatid: `${telefone}@s.whatsapp.net`,
          text: 'Oi, vi o anuncio de voces',
          messageTimestamp: Math.floor(Date.now() / 1000),
          id: 'E2E_' + Date.now(),
          fromMe: false,
          contextInfo: {
            externalAdReply: {
              title: 'Botox com desconto',
              sourceType: 'ad',
              sourceId: '23861547839210047',
              sourceUrl: 'https://www.instagram.com/p/x',
              ctwaClid: 'E2E_CLID',
            },
          },
        },
      },
    },
  })
  expect(res.ok()).toBe(true)

  await expect.poll(async () => {
    const { data } = await db.from('conversations')
      .select('id').eq('contact_phone', telefone).maybeSingle()
    convId = (data?.id as string) ?? null
    return convId
  }, { message: 'a conversa deveria nascer' }).not.toBeNull()

  await expect.poll(async () => {
    const { data } = await db.from('domain_events')
      .select('nome').eq('entidade_id', convId!).order('ocorrido_em')
    return (data ?? []).map(e => e.nome).sort().join(',')
  }, { message: 'webhook deveria emitir os três' })
    .toBe('conversa.iniciada,conversa.mensagem_recebida,conversa.veio_de_anuncio')

  const { data: evs } = await db.from('domain_events')
    .select('nome, ator_tipo, origem, dados').eq('entidade_id', convId!)
  for (const e of evs ?? []) {
    // Ninguém da equipe agiu: quem falou foi a pessoa do outro lado.
    expect(e.ator_tipo, `${e.nome} deveria ser do sistema`).toBe('sistema')
    expect(e.origem,    `${e.nome} deveria vir do webhook`).toBe('webhook')
  }

  const recebida = (evs ?? []).find(e => e.nome === 'conversa.mensagem_recebida')!
  // O texto viaja junto: é por ele que a automação decide o que responder.
  expect((recebida.dados as Record<string, unknown>).texto).toBe('Oi, vi o anuncio de voces')

  const anuncio = (evs ?? []).find(e => e.nome === 'conversa.veio_de_anuncio')!
  expect((anuncio.dados as Record<string, unknown>).anuncioId).toBe('23861547839210047')
})
