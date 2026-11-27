import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * D5 da 38ª simulação: na caixa que NÃO é a API oficial (o WhatsApp Web), o
 * inbox avisava "não há janela de 24h, e o texto livre seria recusado" quando
 * a pessoa falava por outro número, e bloqueava o envio. WT-12 do catálogo:
 * "a janela de 24 h (que só o oficial tem) … vale conversa a conversa". A
 * janela é da caixa que VAI enviar, e só a da Cloud API a tem.
 */

const fonte = (arquivo: string) => fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8')

describe('D5: a janela da caixa por onde a pessoa fala', () => {
  it('o WhatsApp Web não tem janela: responde por ele', async () => {
    const { janelaFechadaNaCaixaDeSaida } = await import('@/lib/inbox/janela-da-caixa-de-saida')
    expect(janelaFechadaNaCaixaDeSaida('whatsapp', { provider: 'uazapi' })).toBe(false)
  })

  it('a API oficial tem: o contato nunca falou com ela, então está fechada', async () => {
    const { janelaFechadaNaCaixaDeSaida } = await import('@/lib/inbox/janela-da-caixa-de-saida')
    expect(janelaFechadaNaCaixaDeSaida('whatsapp', { provider: 'official' })).toBe(true)
  })

  it('sem outra caixa (responde pela da conversa), nada a dizer aqui', async () => {
    const { janelaFechadaNaCaixaDeSaida } = await import('@/lib/inbox/janela-da-caixa-de-saida')
    expect(janelaFechadaNaCaixaDeSaida('whatsapp', null)).toBe(false)
  })
})

describe('D5: a tela usa a regra, e o aviso da outra caixa fica', () => {
  const tela = fonte('components/admin/crm-inbox.tsx')

  it('a janela fechada na caixa própria vem do provedor dela', () => {
    expect(tela).not.toMatch(/janelaFechadaNaCaixaPropria = !!respondendoPelaOutra\s*$/m)
    expect(tela).toMatch(/janelaFechadaNaCaixaPropria = janelaFechadaNaCaixaDeSaida\(/)
  })

  it('a frase das 24 h só aparece com a janela fechada; o aviso dos dois números e a escapatória, sempre', () => {
    expect(tela).toMatch(/\{janelaFechadaNaCaixaPropria && \(\s*<> O cliente nunca falou com o seu — não há janela de 24h, e\s+o texto livre seria recusado\.<\/>\s*\)\}/)
    expect(tela).toMatch(/Você fala pelo <strong>\{respondendoPelaOutra\.label\}<\/strong>/)
    expect(tela).toMatch(/onClick=\{\(\) => setIgnorarCaixaPropria\(true\)\}/)
  })

  it('o servidor já mede pela caixa de saída e pelo provedor dela (NÃO ERA no servidor)', () => {
    const enviar = fonte('lib/inbox/enviar.ts')
    expect(enviar).toMatch(/estadoDaJanela\(channel, ultimoInbound, canal\?\.nome\)/)
  })
})
