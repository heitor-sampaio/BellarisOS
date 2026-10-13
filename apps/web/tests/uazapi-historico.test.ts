import { describe, it, expect } from 'vitest'
import { UazapiProvider } from '@/lib/whatsapp/uazapi'

/**
 * A mensagem do HISTÓRICO da uazapi (`/message/find`) no formato da entrada
 * de conversa (2026-10-13). Diferente do webhook ao vivo:
 *  - a enviada pela clínica (`fromMe`) entra — como saída —, em vez de ser
 *    descartada como eco;
 *  - a identidade é sempre a do CLIENTE, tirada da conversa: na enviada, o
 *    `sender_pn` é o número da clínica.
 */
const p = new UazapiProvider({ provider: 'uazapi', token: 't', baseUrl: 'https://x.invalido' })
const chat = { wa_chatid: '5548999990000@s.whatsapp.net', phone: '5548999990000', wa_contactName: 'Maria Souza' }

describe('lerDoHistorico', () => {
  it('a do cliente entra como entrada, com o nome da conversa', () => {
    const r = p.lerDoHistorico({
      messageid: 'ABC1', chatid: chat.wa_chatid, sender_pn: '5548999990000@s.whatsapp.net',
      fromMe: false, messageType: 'conversation', text: 'Oi, tem horário amanhã?', messageTimestamp: 1760000000000,
    }, chat)
    expect(r?.daClinica).toBe(false)
    expect(r?.msg).toMatchObject({
      externalId: 'ABC1', content: 'Oi, tem horário amanhã?', phone: '5548999990000',
      displayName: 'Maria Souza', timestamp: new Date(1760000000000).toISOString(), type: 'text',
    })
  })

  it('a da clínica entra como saída, com a identidade do CLIENTE (não a do remetente)', () => {
    const r = p.lerDoHistorico({
      messageid: 'ABC2', chatid: chat.wa_chatid, sender_pn: '5548911112222@s.whatsapp.net', senderName: 'Clínica',
      fromMe: true, text: 'Temos às 15h!', messageTimestamp: 1760000060,
    }, chat)
    expect(r?.daClinica).toBe(true)
    expect(r?.msg.phone).toBe('5548999990000')
    expect(r?.msg.displayName).toBe('Maria Souza')
    expect(r?.msg.timestamp).toBe(new Date(1760000060 * 1000).toISOString())
  })

  it('mídia sem texto vira o rótulo do tipo', () => {
    const r = p.lerDoHistorico({ messageid: 'ABC3', chatid: chat.wa_chatid, fromMe: false, mediaType: 'image', messageTimestamp: 1760000000 }, chat)
    expect(r?.msg).toMatchObject({ content: '[image]', type: 'image' })
  })

  it('grupo, status, canal e mensagem que não abriu ficam de fora', () => {
    expect(p.lerDoHistorico({ messageid: 'G', chatid: '1203630@g.us', isGroup: true, text: 'oi' }, { wa_chatid: '1203630@g.us', wa_isGroup: true })).toBeNull()
    expect(p.lerDoHistorico({ messageid: 'S', chatid: 'status@broadcast', text: 'oi' }, { wa_chatid: 'status@broadcast' })).toBeNull()
    expect(p.lerDoHistorico({ messageid: 'N', chatid: '123@newsletter', text: 'oi' }, { wa_chatid: '123@newsletter' })).toBeNull()
    expect(p.lerDoHistorico({ messageid: 'E', chatid: chat.wa_chatid, messageType: 'error' }, chat)).toBeNull()
  })
})
