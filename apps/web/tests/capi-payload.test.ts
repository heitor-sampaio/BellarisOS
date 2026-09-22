import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import { montarPayload } from '@/lib/ads/capi'

/**
 * O corpo do evento da API de Conversões.
 *
 * Existe porque o erro aqui é SILENCIOSO e caro: com `action_source: 'website'`
 * — que era o que este projeto mandava — a Meta aceita o evento com 200 e
 * simplesmente não o atribui a anúncio nenhum. Nada quebra, nada alerta, e a
 * clínica decide verba em cima de um número que não existe.
 */

const sha = (v: string) => createHash('sha256').update(v).digest('hex')

const base = {
  tenantId: 't1',
  event:    'Schedule' as const,
  eventId:  'schedule:abc',
  ctwaClid: 'ARBx9KpQ2mTn7vL4cZ',
  ocorridoEm: new Date('2026-09-22T12:00:00Z'),
}

describe('montarPayload', () => {
  it('declara mensageria, e não site — é o que faz a Meta atribuir', () => {
    const [e] = montarPayload(base, 'PIXEL').data
    expect(e!.action_source).toBe('business_messaging')
    expect(e!.messaging_channel).toBe('whatsapp')
  })

  it('leva o ctwa_clid em user_data: é ele que liga o evento ao clique', () => {
    const [e] = montarPayload(base, 'PIXEL').data
    expect((e!.user_data as Record<string, unknown>).ctwa_clid).toBe('ARBx9KpQ2mTn7vL4cZ')
  })

  it('usa o event_id recebido — a Meta deduplica por ele', () => {
    const [e] = montarPayload(base, 'PIXEL').data
    expect(e!.event_id).toBe('schedule:abc')
  })

  it('carimba o momento do FATO, não o do envio', () => {
    const [e] = montarPayload(base, 'PIXEL').data
    expect(e!.event_time).toBe(Math.floor(Date.parse('2026-09-22T12:00:00Z') / 1000))
  })

  it('manda telefone e e-mail com hash, e o telefone só com dígitos', () => {
    const [e] = montarPayload(
      { ...base, phone: '+55 (48) 99123-4567', email: ' Marina@Exemplo.COM ' },
      'PIXEL',
    ).data
    const ud = e!.user_data as Record<string, unknown>
    // Máscara e dígitos puros têm que gerar o MESMO hash, senão a Meta não
    // reconhece a pessoa que já viu por outro caminho.
    expect(ud.ph).toBe(sha('5548991234567'))
    expect(ud.em).toBe(sha('marina@exemplo.com'))
  })

  it('Purchase leva valor e moeda', () => {
    const [e] = montarPayload(
      { ...base, event: 'Purchase', eventId: 'purchase:x', valor: 1250.5 },
      'PIXEL',
    ).data
    const cd = e!.custom_data as Record<string, unknown>
    expect(cd.value).toBe(1250.5)
    expect(cd.currency).toBe('BRL')
  })

  it('evento sem valor não inventa um zero', () => {
    const [e] = montarPayload(base, 'PIXEL').data
    const cd = e!.custom_data as Record<string, unknown>
    // Zero seria lido como venda de R$ 0 e derrubaria o valor médio da
    // campanha; ausência é ausência.
    expect(cd.value).toBeUndefined()
    expect(cd.currency).toBeUndefined()
  })

  it('sem telefone nem e-mail, o clique sozinho ainda identifica', () => {
    const [e] = montarPayload(base, 'PIXEL').data
    const ud = e!.user_data as Record<string, unknown>
    expect(ud.ph).toBeUndefined()
    expect(ud.em).toBeUndefined()
    expect(ud.ctwa_clid).toBeTruthy()
  })
})
