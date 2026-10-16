import { describe, it, expect } from 'vitest'
import { falhaDoEnvio, textoDaFalhaDaMeta } from '@/lib/inbox/falhas'
import {
  categoriaDoTemplate, precoDaCategoria, formatarPreco, avisoDoTemplate, estimarCusto,
  TABELA_DA_META,
} from '@/lib/whatsapp/cobranca'
import { OfficialAPIProvider } from '@/lib/whatsapp/official'

/**
 * A Meta cobra a clínica (2026-10-15): template por categoria e, desde
 * 01/10/2026, a resposta digitada depois de 1.000 por número no mês. O sistema
 * não paga nada — a conta do WhatsApp é da clínica —, mas tem de dizer o que
 * custa ANTES, contar o que foi cobrado DEPOIS e reconhecer a recusa por falta
 * de forma de pagamento.
 */
describe('falhaDoEnvio — o erro do provedor vira o motivo certo', () => {
  const daCloud = (code: number, message: string) =>
    new Error(`WhatsApp API 400: ${JSON.stringify({ message, type: 'OAuthException', code, fbtrace_id: 'A1b2' })}`)

  it('131042 é falta de forma de pagamento — não "a janela fechou"', () => {
    // O filtro antigo procurava "24" e "10" no texto inteiro: 131042 tem os dois.
    const f = falhaDoEnvio(daCloud(131042, '(#131042) Business eligibility payment issue'))
    expect(f.codigo).toBe(131042)
    expect(f.texto).toMatch(/forma de pagamento/i)
    expect(f.texto).not.toMatch(/janela/i)
  })

  it('a janela da Cloud API (131047) e a do Messenger (#10)', () => {
    expect(falhaDoEnvio(daCloud(131047, 'Re-engagement message')).texto).toMatch(/janela/i)
    const messenger = new Error(`Meta Messaging 400: ${JSON.stringify({ message: '(#10) This message is sent outside of allowed window.', code: 10 })}`)
    expect(falhaDoEnvio(messenger).texto).toMatch(/janela/i)
  })

  it('token vencido e limite de envio', () => {
    expect(falhaDoEnvio(daCloud(190, 'Error validating access token')).texto).toMatch(/expirou/i)
    expect(falhaDoEnvio(daCloud(130429, 'Rate limit hit')).texto).toMatch(/muitas mensagens/i)
  })

  it('erro sem código conhecido é o genérico, e número solto no texto não decide nada', () => {
    const f = falhaDoEnvio(new Error('uazapi /send/text 500: timeout after 24010ms'))
    expect(f.codigo).toBeNull()
    expect(f.texto).toMatch(/Não foi possível enviar/)
  })

  it('a falha que chega pelo webhook usa o mesmo texto', () => {
    expect(textoDaFalhaDaMeta(131042, 'Business eligibility payment issue')).toMatch(/forma de pagamento/i)
    expect(textoDaFalhaDaMeta(999999, 'Alguma coisa')).toMatch(/Alguma coisa/)
  })
})

describe('o preço de cada mensagem (tabela da Meta no Brasil)', () => {
  it('categoria do template e preço', () => {
    expect(categoriaDoTemplate('MARKETING')).toBe('marketing')
    expect(categoriaDoTemplate('UTILITY')).toBe('utility')
    expect(categoriaDoTemplate('AUTHENTICATION')).toBe('authentication')
    expect(precoDaCategoria('marketing')).toBe(TABELA_DA_META.precos.marketing)
    expect(TABELA_DA_META.precos.marketing).toBeGreaterThan(TABELA_DA_META.precos.utility * 5)
  })

  it('preço de centavo não vira "R$ 0,04"', () => {
    expect(formatarPreco(0.3217)).toBe('R$ 0,32')
    expect(formatarPreco(0.035)).toBe('R$ 0,035')
  })

  it('o aviso do template: marketing com a janela aberta lembra que a resposta digitada sai mais barata', () => {
    const aberta = avisoDoTemplate('MARKETING', true)
    expect(aberta.tom).toBe('alerta')
    expect(aberta.texto).toMatch(/marketing/i)
    expect(aberta.texto).toContain('R$ 0,32')
    expect(aberta.texto).toMatch(/resposta digitada/i)

    const fechada = avisoDoTemplate('MARKETING', false)
    expect(fechada.tom).toBe('info')
    expect(fechada.texto).not.toMatch(/resposta digitada/i)

    expect(avisoDoTemplate('UTILITY', false).texto).toContain('R$ 0,035')
  })

  it('a estimativa soma só o que a Meta marcou como cobrado', () => {
    expect(estimarCusto([
      { categoria: 'marketing', cobradas: 2 },
      { categoria: 'utility', cobradas: 10 },
      { categoria: 'service', cobradas: 0 },
    ])).toBeCloseTo(2 * 0.3217 + 10 * 0.035, 6)
    expect(estimarCusto([])).toBe(0)
  })
})

describe('o status da Cloud API traz a cobrança e o erro', () => {
  const provedor = new OfficialAPIProvider({ provider: 'official', phoneNumberId: '1', accessToken: 'x' })
  const status = (s: Record<string, unknown>) => ({
    entry: [{ changes: [{ value: { metadata: { phone_number_id: '1' }, statuses: [{ id: 'wamid.A', ...s }] } }] }],
  })

  it('a cobrança vem no "pricing"', () => {
    expect(provedor.parseStatus(status({
      status: 'delivered',
      pricing: { billable: true, pricing_model: 'PMP', category: 'marketing', type: 'regular' },
    }))).toEqual({
      externalId: 'wamid.A', status: 'delivered',
      cobranca: { cobrada: true, categoria: 'marketing', tipo: 'regular' },
    })
  })

  it('a falha traz o código e o título', () => {
    expect(provedor.parseStatus(status({
      status: 'failed',
      errors: [{ code: 131042, title: 'Business eligibility payment issue', message: 'x' }],
    }))).toEqual({
      externalId: 'wamid.A', status: 'failed',
      erro: { codigo: 131042, titulo: 'Business eligibility payment issue' },
    })
  })

  it('status sem nada disso continua como era', () => {
    expect(provedor.parseStatus(status({ status: 'read' }))).toEqual({ externalId: 'wamid.A', status: 'read' })
  })
})
