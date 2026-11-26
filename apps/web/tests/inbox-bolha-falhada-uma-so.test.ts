import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A3 da 32ª simulação (princípio 3): a bolha que falhou aparecia DUAS vezes
 * até recarregar. Na falha, a tela marcava a otimista (`opt-…`) como
 * "failed" e descartava a mensagem gravada que a action devolve; o sinal da
 * conversa relia a gravada, e a mescla só consome a otimista ainda
 * "sending" — a falhada ficava ao lado da gravada. Agora a falha troca a
 * otimista pela gravada (uma só, com o id real), e a releitura casa pelo id.
 */

describe('a mensagem que falhou aparece uma vez só', async () => {
  const mod = await import('@/lib/inbox/bolha-otimista').catch(() => null)
  const otimista = { id: 'opt-1', direction: 'outbound', status: 'sending', content: 'oi' }
  const gravada  = { id: 'm-1',   direction: 'outbound', status: 'failed',  content: 'oi', erro_texto: 'O número não respondeu.' }

  it('o módulo existe', () => {
    expect(mod, 'lib/inbox/bolha-otimista.ts').not.toBeNull()
  })

  it('a falha com a mensagem gravada troca a otimista por ela', () => {
    const r = mod!.trocarOtimista([{ id: 'x', direction: 'inbound', status: 'delivered', content: 'olá' }, otimista], 'opt-1', gravada)
    expect(r.map(m => m.id)).toEqual(['x', 'm-1'])
    expect(r[1]).toMatchObject({ status: 'failed', erro_texto: 'O número não respondeu.' })
  })

  it('se o sinal já trouxe a gravada (e consumiu a otimista), atualiza a gravada sem repetir', () => {
    const r = mod!.trocarOtimista([{ ...gravada, status: 'sending' }], 'opt-1', gravada)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: 'm-1', status: 'failed' })
  })

  it('se as duas estão na tela, fica a gravada', () => {
    const r = mod!.trocarOtimista([otimista, { ...gravada, status: 'sending' }], 'opt-1', gravada)
    expect(r.map(m => m.id)).toEqual(['m-1'])
  })

  it('o envio da tela usa a troca na falha', () => {
    const inbox = readFileSync(join(__dirname, '..', 'components/admin/crm-inbox.tsx'), 'utf8')
    const envio = inbox.slice(inbox.indexOf('function handleSend()'), inbox.indexOf('function handleEnviarAnexo('))
    expect(envio).toMatch(/trocarOtimista\(prev, optimistic\.id, res\.message!?\)/)
  })
})
