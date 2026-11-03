import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * O webhook da API oficial que DESCARTA uma entrega avisa no log (F7c,
 * 2026-11-02). Quando o `phone_number_id` não é de nenhuma caixa, ele responde
 * 200 (a Meta não pode ficar reenviando) — e, sem log nenhum, o diagnóstico do
 * "nenhuma mensagem chega" não tinha por onde começar. Agora registra um
 * console.warn com o id. A resposta não muda.
 */

const numeroPorId = vi.fn()
vi.mock('@/lib/whatsapp/factory', () => ({ getNumeroPorPhoneNumberId: (id: string) => numeroPorId(id) }))
vi.mock('@/lib/inbox/resolve-conversation', () => ({
  resolveConversation: vi.fn(), insertInboundMessage: vi.fn(), updateMessageStatus: vi.fn(),
}))
vi.mock('@/lib/whatsapp/coexistencia', () => ({ mudancasDaCoexistencia: () => [], tratarCoexistencia: vi.fn() }))

const { POST } = await import('@/app/api/webhooks/whatsapp/route')

function entrega(phoneNumberId: string) {
  const corpo = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: '1', changes: [{ field: 'messages', value: { metadata: { phone_number_id: phoneNumberId } } }] }],
  })
  return new NextRequest('http://localhost/api/webhooks/whatsapp', { method: 'POST', body: corpo })
}

describe('webhook da API oficial: entrega sem caixa', () => {
  let aviso: ReturnType<typeof vi.spyOn>
  beforeEach(() => { aviso = vi.spyOn(console, 'warn').mockImplementation(() => {}) })
  afterEach(() => { aviso.mockRestore(); numeroPorId.mockReset() })

  it('phone_number_id de nenhuma caixa: responde 200 e avisa no log com o id', async () => {
    numeroPorId.mockResolvedValue(null)
    const r = await POST(entrega('123456789012345'))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
    expect(aviso).toHaveBeenCalledTimes(1)
    expect(String(aviso.mock.calls[0]!.join(' '))).toContain('123456789012345')
  })

  it('o número existe mas não é da API oficial: também avisa', async () => {
    numeroPorId.mockResolvedValue({ id: 'x', tenantId: 't', provider: 'uazapi', config: {} })
    const r = await POST(entrega('999'))
    expect(r.status).toBe(200)
    expect(String(aviso.mock.calls[0]?.join(' '))).toContain('999')
  })
})
