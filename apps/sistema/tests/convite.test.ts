import { describe, it, expect, vi } from 'vitest'
import { enviarConvite } from '@/lib/equipe/convite'

/**
 * O convite de quem entra na equipe da plataforma é o e-mail de "definir
 * senha" (2026-10-06). O envio podia falhar e a tela dizer "enviado": o
 * resultado do Auth era descartado. Agora o erro volta como texto (null =
 * saiu), e o link vai para o host do papel.
 */
const env = { SISTEMA_URL: 'https://admin.bellarisos.com', SUPORTE_URL: 'https://suporte.bellarisos.com' }

describe('enviarConvite', () => {
  it('saiu: devolve null, com o link para o host do papel', async () => {
    const reset = vi.fn().mockResolvedValue({ error: null })
    expect(await enviarConvite({ resetPasswordForEmail: reset }, 'ana@x.com', 'ADMIN', env)).toBeNull()
    expect(reset).toHaveBeenCalledWith('ana@x.com', { redirectTo: 'https://admin.bellarisos.com/auth/confirm?next=/update-password' })
    await enviarConvite({ resetPasswordForEmail: reset }, 'bia@x.com', 'SUPORTE', env)
    expect(reset).toHaveBeenLastCalledWith('bia@x.com', { redirectTo: 'https://suporte.bellarisos.com/auth/confirm?next=/update-password' })
  })

  it('o Auth recusou (SMTP, limite): devolve o motivo', async () => {
    const reset = vi.fn().mockResolvedValue({ error: { message: 'Error sending recovery email' } })
    expect(await enviarConvite({ resetPasswordForEmail: reset }, 'ana@x.com', 'ADMIN', env)).toBe('Error sending recovery email')
  })

  it('lançou (rede): devolve o motivo, não estoura', async () => {
    const reset = vi.fn().mockRejectedValue(new Error('fetch failed'))
    expect(await enviarConvite({ resetPasswordForEmail: reset }, 'ana@x.com', 'ADMIN', env)).toBe('fetch failed')
  })
})
