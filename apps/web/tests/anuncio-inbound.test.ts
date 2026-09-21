import { describe, it, expect } from 'vitest'
import { UazapiProvider } from '@/lib/whatsapp/uazapi'
import { OfficialAPIProvider } from '@/lib/whatsapp/official'

/**
 * Atribuição de anúncio (click-to-WhatsApp) nos dois provedores.
 *
 * Existe porque os dois entregam a MESMA informação em formatos diferentes e
 * incompatíveis — `messages[].referral` na Cloud API, `contextInfo.
 * externalAdReply` na uazapi — e porque o aviso do anúncio chega **uma vez
 * só**, na primeira mensagem: um parser errado não dá segunda chance, e a
 * falha é silenciosa (a mensagem entra normalmente, só sem a origem).
 */

const uazapi = new UazapiProvider({ token: 't', baseUrl: 'https://x' } as never)

/** Webhook da uazapi com o anúncio no lugar onde ele de fato vem. */
function payloadUazapi(contextInfo: unknown) {
  return {
    data: {
      chat: { name: 'Marina', phone: '554899990000' },
      message: {
        sender_pn: '554899990000',
        chatid: '554899990000@s.whatsapp.net',
        text: 'Oi, vi o anúncio do botox',
        messageTimestamp: 1758400000,
        id: 'ABC123',
        fromMe: false,
        contextInfo,
      },
    },
  }
}

const AD = {
  title: 'Botox com 20% off',
  body: 'Agende sua avaliação',
  sourceType: 'ad',
  sourceId: '23861234567890047',
  sourceUrl: 'https://www.instagram.com/p/xyz',
  ctwaClid: 'ARAbc123',
  mediaType: 'IMAGE',
  thumbnailUrl: 'https://scontent.example/thumb.jpg',
}

describe('uazapi — anúncio em contextInfo.externalAdReply', () => {
  it('lê título, id, campanha-link e click id', () => {
    const msg = uazapi.parseInbound(payloadUazapi({ externalAdReply: AD }))
    expect(msg?.referral).toEqual({
      sourceType:   'ad',
      sourceId:     '23861234567890047',
      sourceUrl:    'https://www.instagram.com/p/xyz',
      ctwaClid:     'ARAbc123',
      headline:     'Botox com 20% off',
      body:         'Agende sua avaliação',
      mediaType:    'IMAGE',
      thumbnailUrl: 'https://scontent.example/thumb.jpg',
    })
  })

  it('mensagem comum não ganha referral', () => {
    const msg = uazapi.parseInbound(payloadUazapi(undefined))
    expect(msg?.referral).toBeUndefined()
  })

  it('externalAdReply vazio é ruído do protocolo, não anúncio', () => {
    const msg = uazapi.parseInbound(payloadUazapi({ externalAdReply: {} }))
    expect(msg?.referral).toBeUndefined()
  })

  it('sem id do anúncio, o título ainda diz de onde veio', () => {
    const msg = uazapi.parseInbound(payloadUazapi({
      externalAdReply: { title: 'Botox com 20% off', sourceType: 'ad' },
    }))
    expect(msg?.referral?.headline).toBe('Botox com 20% off')
    expect(msg?.referral?.sourceId).toBeUndefined()
  })

  it('encontra o anúncio também no contextInfo aninhado em extendedTextMessage', () => {
    const payload = {
      data: {
        chat: { phone: '554899990000' },
        message: {
          sender_pn: '554899990000',
          text: 'Oi',
          messageTimestamp: 1758400000,
          id: 'ABC124',
          fromMe: false,
          message: { extendedTextMessage: { contextInfo: { externalAdReply: AD } } },
        },
      },
    }
    expect(uazapi.parseInbound(payload)?.referral?.sourceId).toBe('23861234567890047')
  })
})

describe('Cloud API oficial — anúncio em messages[].referral', () => {
  const oficial = new OfficialAPIProvider({
    accessToken: 't', phoneNumberId: '1', wabaId: '2', appSecret: 's', verifyToken: 'v',
  } as never)

  it('mapeia os campos do referral para o mesmo formato da uazapi', () => {
    const payload = {
      entry: [{ changes: [{ value: {
        contacts: [{ wa_id: '554899990000', profile: { name: 'Marina' } }],
        messages: [{
          from: '554899990000',
          id: 'wamid.X',
          timestamp: '1758400000',
          type: 'text',
          text: { body: 'Oi, vi o anúncio' },
          referral: {
            source_url:  'https://www.instagram.com/p/xyz',
            source_type: 'ad',
            source_id:   '23861234567890047',
            headline:    'Botox com 20% off',
            body:        'Agende sua avaliação',
            media_type:  'image',
            ctwa_clid:   'ARAbc123',
          },
        }],
      } }] }],
    }
    const msg = oficial.parseInbound(payload)
    expect(msg?.referral?.sourceId).toBe('23861234567890047')
    expect(msg?.referral?.headline).toBe('Botox com 20% off')
    expect(msg?.referral?.ctwaClid).toBe('ARAbc123')
    // O mesmo id de anúncio que a uazapi entrega: é ele que liga à campanha.
    expect(msg?.referral?.sourceId).toBe(
      uazapi.parseInbound(payloadUazapi({ externalAdReply: AD }))?.referral?.sourceId,
    )
  })

  it('mensagem sem anúncio não inventa referral', () => {
    const payload = {
      entry: [{ changes: [{ value: {
        contacts: [{ wa_id: '554899990000' }],
        messages: [{ from: '554899990000', id: 'wamid.Y', timestamp: '1758400000', type: 'text', text: { body: 'Oi' } }],
      } }] }],
    }
    expect(oficial.parseInbound(payload)?.referral).toBeUndefined()
  })
})
