import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import type { NumeroDeWhatsApp } from '@/lib/whatsapp/types'

/**
 * R11 (o Heitor, 26/11, na página de perguntas: "Está no escopo: o botão
 * 'Tentar de novo' na bolha que não saiu"). A bolha "Não enviada" ganha o
 * "Tentar de novo": reenvia a MESMA mensagem pelo mesmo número (ou pelo da
 * conversa, se aquele saiu), com as travas do envio normal — o alcance
 * (`conversaAoAlcance`), o suporte (`bloqueioDoSuporte`), a janela de 24 h e o
 * número a que a pessoa está ligada. A mesma linha volta a 'sending' (não nasce
 * outra bolha), e a régua das respostas conta uma vez só: o gatilho
 * `trg_mensagem_aceita` mede quando ela PASSA a aceita (migration
 * 20261210100001).
 */

const fonte = (arquivo: string) => fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8')

function numero(id: string, extra: Partial<NumeroDeWhatsApp> = {}): NumeroDeWhatsApp {
  return {
    id, tenantId: 't1', provider: 'uazapi', label: `Número ${id}`, phone: null, phoneNumberId: null,
    wabaId: null, branchId: null, userIds: [], isDefault: false, isActive: true, managed: false,
    removido: false, config: { provider: 'uazapi' } as never, ...extra,
  }
}

describe('R11: por qual número a mensagem sai de novo', () => {
  it('pelo mesmo número, quando é o da conversa', async () => {
    const { numeroDoReenvio } = await import('@/lib/inbox/numero-do-reenvio')
    const r = numeroDoReenvio([numero('conv'), numero('outro')], { daMensagem: 'conv', daConversa: 'conv', userId: 'u1' })
    expect(r).toMatchObject({ numero: { id: 'conv' } })
  })

  it('pelo mesmo número, quando é o da pessoa que tenta de novo', async () => {
    const { numeroDoReenvio } = await import('@/lib/inbox/numero-do-reenvio')
    const r = numeroDoReenvio([numero('conv'), numero('meu', { userIds: ['u1'] })], { daMensagem: 'meu', daConversa: 'conv', userId: 'u1' })
    expect(r).toMatchObject({ numero: { id: 'meu' } })
  })

  it('o número de OUTRA pessoa (nem o dela nem o da conversa) não serve: diz por quê', async () => {
    const { numeroDoReenvio } = await import('@/lib/inbox/numero-do-reenvio')
    const r = numeroDoReenvio([numero('conv'), numero('dela', { userIds: ['u2'], label: 'Comercial' })], { daMensagem: 'dela', daConversa: 'conv', userId: 'u1' })
    expect(r).toEqual({ erro: expect.stringMatching(/Comercial/) })
  })

  it('o número da mensagem saiu (removido ou fora do ar): sai pelo da conversa', async () => {
    const { numeroDoReenvio } = await import('@/lib/inbox/numero-do-reenvio')
    expect(numeroDoReenvio([numero('conv')], { daMensagem: 'removido', daConversa: 'conv', userId: 'u1' }))
      .toMatchObject({ numero: { id: 'conv' } })
    expect(numeroDoReenvio([numero('conv'), numero('caiu', { isActive: false, userIds: ['u1'] })], { daMensagem: 'caiu', daConversa: 'conv', userId: 'u1' }))
      .toMatchObject({ numero: { id: 'conv' } })
  })

  it('a conversa sem número sai pelo padrão da rede (o envio normal), nunca pelo primeiro ativo', async () => {
    const { numeroDoReenvio } = await import('@/lib/inbox/numero-do-reenvio')
    expect(numeroDoReenvio([numero('a'), numero('padrao', { isDefault: true })], { daMensagem: null, daConversa: null, userId: 'u1' }))
      .toMatchObject({ numero: { id: 'padrao' } })
    expect(numeroDoReenvio([numero('a')], { daMensagem: null, daConversa: null, userId: 'u1' }))
      .toEqual({ erro: expect.any(String) })
  })

  it('o número da conversa também fora do ar: não sai, e diz por quê', async () => {
    const { numeroDoReenvio } = await import('@/lib/inbox/numero-do-reenvio')
    const r = numeroDoReenvio([numero('conv', { isActive: false })], { daMensagem: 'conv', daConversa: 'conv', userId: 'u1' })
    expect(r).toEqual({ erro: expect.stringMatching(/fora do ar/) })
  })
})

describe('R11: o modelo (template) que falhou sai de novo com os mesmos valores', () => {
  it('os valores das variáveis voltam do texto que ficou no histórico', async () => {
    const { valoresDoTextoDoModelo, textoDoEnvio } = await import('@/lib/templates/core')
    const t = { header_text: 'Oi, {{nome}}', body_text: 'Seu horário é {{data}} às {{hora}}. Até lá, {{nome}}!', footer_text: 'Vinca' }
    const valores = { nome: 'Ana Paula', data: '24/11', hora: '10:30' }
    expect(valoresDoTextoDoModelo(t, textoDoEnvio(t, valores))).toEqual(valores)
  })

  it('o modelo sem variável volta vazio; o texto que não é deste modelo, null', async () => {
    const { valoresDoTextoDoModelo } = await import('@/lib/templates/core')
    expect(valoresDoTextoDoModelo({ header_text: null, body_text: 'Bom dia!', footer_text: null }, 'Bom dia!')).toEqual({})
    expect(valoresDoTextoDoModelo({ header_text: null, body_text: 'Olá, {{nome}}.', footer_text: null }, 'Outro texto')).toBeNull()
  })
})

describe('R11: a action e o núcleo têm as travas do envio normal', () => {
  const action = fonte('actions/inbox.ts')
  const corpo = action.slice(action.indexOf('export async function reenviarMensagem('))
  const daAction = corpo.slice(0, corpo.indexOf('\n}\n'))

  it('a action existe e confere o plano, a permissão (sem lançar), o suporte e o alcance da mensagem', () => {
    expect(daAction).toMatch(/assertRecurso\(ctx, 'inbox'\)/)
    expect(daAction).toMatch(/can\(ctx, 'crm', 'MANAGE'\)/)
    expect(daAction).not.toMatch(/assertPermission\(ctx, 'crm'/)
    expect(daAction).toMatch(/bloqueioDoSuporte\(ctx/)
    expect(daAction).toMatch(/mensagemAoAlcance\(admin, ctx, messageId\)/)
    expect(daAction).toMatch(/reenviarNaConversa\(/)
  })

  it('o núcleo pega a MESMA linha (só a que está "Não enviada") em vez de gravar outra, e confere a janela', () => {
    const nucleo = fonte('lib/inbox/reenviar.ts')
    expect(nucleo).not.toMatch(/from\('messages'\)\s*\.insert/)
    expect(nucleo).toMatch(/\.eq\('status', 'failed'\)/)
    expect(nucleo).toMatch(/status:\s*'sending'/)
    expect(nucleo).toMatch(/estadoDaJanela\(/)
    expect(nucleo).toMatch(/ultimoInboundNaCaixa\(/)
    expect(nucleo).toMatch(/numeroRemovidoDaConversa\(/)
    expect(nucleo).toMatch(/numeroDoReenvio\(/)
    expect(nucleo).toMatch(/falhaDoEnvio\(/)
    expect(nucleo, 'não emite o fato de mensagem enviada de novo').not.toMatch(/emitirEventoDeConversa/)
  })
})

describe('R11: a bolha "Não enviada" tem o "Tentar de novo"', () => {
  const tela = fonte('components/admin/crm-inbox.tsx')

  it('o botão existe, na bolha que falhou, só para quem pode mandar nela', () => {
    expect(tela).toMatch(/data-tentar-de-novo/)
    expect(tela).toMatch(/Tentar de novo/)
    expect(tela).toMatch(/podeTentarDeNovo\s*=\s*podeAgir && out && falhou/)
    expect(tela).toMatch(/reenviarMensagem\(/)
  })
})
