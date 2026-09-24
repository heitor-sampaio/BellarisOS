import { describe, it, expect } from 'vitest'
import { UazapiProvider } from '@/lib/whatsapp/uazapi'

/**
 * O parser do anúncio click-to-WhatsApp, contra o payload REAL da uazapi.
 *
 * Este teste existe porque a primeira versão do parser não capturava nada — e
 * falhava em silêncio, do pior jeito: a mensagem era gravada normalmente, a
 * conversa nascia "Orgânico", e o anúncio que trouxe o cliente sumia. Nenhum
 * erro, nenhum log, só atribuição errada.
 *
 * O payload abaixo é a **forma exata** conferida no tráfego de uma instância
 * (setembro de 2026, 51 mensagens de anúncio em 200), com o conteúdo trocado
 * por texto de exemplo. As três coisas que estavam erradas viraram os três
 * primeiros casos.
 */

/** A forma real: `content.contextInfo.externalAdReply`, com as grafias da uazapi. */
function webhookDeAnuncio(ad: Record<string, unknown> = {}) {
  return {
    EventType: 'messages',
    data: {
      message: {
        id:        '554800000000:3A878BDB7F9A936CAFA8',
        messageid: '3A878BDB7F9A936CAFA8',
        chatid:    '215603164016792@lid',
        sender:    '215603164016792@lid',
        sender_pn: '5547999990000',
        senderName: 'Fulana',
        fromMe:    false,
        isGroup:   false,
        messageType: 'ExtendedTextMessage',
        messageTimestamp: 1790201524000,
        text: 'Gostaria de informações!',
        content: {
          text: 'Gostaria de informações!',
          contextInfo: {
            externalAdReply: {
              sourceType:   'ad',
              sourceID:     '120252458275510134',
              sourceURL:    'https://www.instagram.com/p/Dclwmo8jPPh/',
              sourceApp:    'instagram',
              ctwaClid:     'Afg8BOvMAXiDcaB4-RD8HXXEbyQ9RhSpc6cwwmUd3dm0',
              title:        'Fale conosco',
              body:         'Texto do criativo do anúncio',
              mediaType:    1,
              thumbnailURL: 'https://scontent.example/thumb.jpg',
              thumbnail:    '/9j/4AAQSkZJRgABAQAAAQABAAD',
              originalImageURL: 'https://scontent.example/full.jpg',
              greetingMessageBody: 'Olá! Diga como podemos ajudar você.',
              showAdAttribution: true,
              renderLargerThumbnail: true,
              wtwaAdFormat: false,
              ...ad,
            },
          },
        },
      },
      chat: { name: 'Fulana', phone: '5547999990000' },
    },
  }
}

const provider = new UazapiProvider({
  provider: 'uazapi', token: 't', baseUrl: 'https://exemplo.uazapi.com',
} as never)

describe('lerAnuncio — contra o payload real', () => {
  it('acha o anúncio em content.contextInfo', () => {
    // O caminho real. A primeira versão procurava em `m.contextInfo`,
    // `m.message.extendedTextMessage.contextInfo` e na raiz — nenhum existe.
    const msg = provider.parseInbound(webhookDeAnuncio())
    expect(msg?.referral, 'o anúncio tem de ser encontrado').toBeTruthy()
  })

  it('lê sourceID com ID MAIÚSCULO — é o que liga à campanha', () => {
    // 51 de 51 mensagens reais trazem `sourceID`; com `sourceId` minúsculo,
    // zero. Sem este campo não há atribuição nenhuma.
    const msg = provider.parseInbound(webhookDeAnuncio())
    expect(msg!.referral!.sourceId).toBe('120252458275510134')
  })

  it('lê sourceURL e thumbnailURL, que seguem a mesma grafia', () => {
    const r = provider.parseInbound(webhookDeAnuncio())!.referral!
    expect(r.sourceUrl).toBe('https://www.instagram.com/p/Dclwmo8jPPh/')
    expect(r.thumbnailUrl).toBe('https://scontent.example/thumb.jpg')
  })

  it('traduz o mediaType NUMÉRICO', () => {
    // Vem 1, não "IMAGE". Guardar "1" deixaria a tela mostrando um número
    // onde deveria dizer o tipo da mídia.
    expect(provider.parseInbound(webhookDeAnuncio())!.referral!.mediaType).toBe('IMAGE')
    expect(provider.parseInbound(webhookDeAnuncio({ mediaType: 2 }))!.referral!.mediaType).toBe('VIDEO')
    // Código desconhecido não vira `undefined`: melhor guardar o número cru
    // que perder a informação.
    expect(provider.parseInbound(webhookDeAnuncio({ mediaType: 9 }))!.referral!.mediaType).toBe('9')
  })

  it('aproveita sourceApp, a plataforma dita pelo provedor', () => {
    const r = provider.parseInbound(webhookDeAnuncio())!.referral!
    expect(r.sourceApp).toBe('instagram')
    expect(provider.parseInbound(webhookDeAnuncio({ sourceApp: 'facebook' }))!.referral!.sourceApp)
      .toBe('facebook')
  })

  it('ctwaClid vem quando há — e falta em algumas de verdade', () => {
    // 48 das 51 reais tinham; 3 não. O anúncio ainda é anúncio sem ele, só
    // não dá para mandar conversão para a Meta.
    expect(provider.parseInbound(webhookDeAnuncio())!.referral!.ctwaClid).toContain('Afg8BO')

    const semClid = webhookDeAnuncio()
    delete (semClid.data.message.content.contextInfo.externalAdReply as Record<string, unknown>).ctwaClid
    const r = provider.parseInbound(semClid)!.referral!
    expect(r.ctwaClid).toBeUndefined()
    expect(r.sourceId, 'sem ctwaClid o anúncio continua identificado').toBe('120252458275510134')
  })

  it('title é o botão e body é o criativo — nenhum dos dois é a campanha', () => {
    // O nome da campanha NÃO vem no webhook: sai do sourceId pela Graph API.
    const r = provider.parseInbound(webhookDeAnuncio())!.referral!
    expect(r.headline).toBe('Fale conosco')
    expect(r.body).toBe('Texto do criativo do anúncio')
  })

  it('aceita também a grafia minúscula, de outras versões', () => {
    const outra = webhookDeAnuncio()
    const ad = outra.data.message.content.contextInfo.externalAdReply as Record<string, unknown>
    delete ad.sourceID; delete ad.sourceURL
    ad.sourceId = 'ABC'; ad.sourceUrl = 'https://fb.me/x'

    const r = provider.parseInbound(outra)!.referral!
    expect(r.sourceId).toBe('ABC')
    expect(r.sourceUrl).toBe('https://fb.me/x')
  })

  it('guarda a imagem em base64, nao a URL que expira', () => {
    // A `thumbnailURL` da Meta expira em quatro dias (o `oe=` e um timestamp,
    // medido no trafego). Guardar so ela daria um selo com imagem na semana em
    // que a mensagem chegou e sem imagem depois, sem nada explicar.
    const r = provider.parseInbound(webhookDeAnuncio())!.referral!
    expect(r.thumbnailData).toBe('/9j/4AAQSkZJRgABAQAAAQABAAD')
    expect(r.thumbnailUrl, 'a URL continua guardada, so nao e a fonte').toBeTruthy()
  })

  it('miniatura absurdamente grande nao entra no jsonb da mensagem', () => {
    // O campo vem do protocolo e nao ha contrato de tamanho; o medido e ~2,2 KB.
    const gigante = webhookDeAnuncio({ thumbnail: 'A'.repeat(70 * 1024) })
    expect(provider.parseInbound(gigante)!.referral!.thumbnailData).toBeUndefined()
  })

  it('mensagem sem anúncio não inventa referral', () => {
    const organica = webhookDeAnuncio()
    delete (organica.data.message.content as Record<string, unknown>).contextInfo
    expect(provider.parseInbound(organica)?.referral).toBeUndefined()
  })

  it('externalAdReply vazio é ruído do protocolo, não anúncio', () => {
    const vazio = webhookDeAnuncio()
    ;(vazio.data.message.content.contextInfo as Record<string, unknown>).externalAdReply = {}
    expect(provider.parseInbound(vazio)?.referral).toBeUndefined()
  })
})
