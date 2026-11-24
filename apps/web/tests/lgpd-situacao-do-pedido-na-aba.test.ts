import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { situacaoDoPedidoNaAba } from '@/lib/lgpd/situacao-do-prontuario'

/**
 * O pedido da LGPD na aba da equipe (princípio 3): pronto o pacote geral e o
 * prontuário ainda à espera da liberação, ele não está "Entregue" — o
 * prontuário pedido ainda não foi. Diz o mesmo que o app ("Parte geral pronta").
 */

const WEB = join(__dirname, '..')

describe('a situação do pedido ao lado do "Prontuário a liberar"', () => {
  it('pacote pronto com o prontuário a liberar: só a parte geral foi entregue', () => {
    expect(situacaoDoPedidoNaAba('completed', 'pending').label).toBe('Parte geral entregue')
  })
  it('sem prontuário pedido, liberado ou negado, o pacote pronto está entregue', () => {
    expect(situacaoDoPedidoNaAba('completed', 'not_requested').label).toBe('Entregue')
    expect(situacaoDoPedidoNaAba('completed', 'approved').label).toBe('Entregue')
    expect(situacaoDoPedidoNaAba('completed', 'denied').label).toBe('Entregue')
  })
  it('em preparo e falhou seguem como eram', () => {
    expect(situacaoDoPedidoNaAba('pending', 'pending').label).toBe('Em preparo')
    expect(situacaoDoPedidoNaAba('processing', 'approved').label).toBe('Em preparo')
    expect(situacaoDoPedidoNaAba('failed', 'not_requested').label).toBe('Falhou')
  })
  it('a aba usa a situação do pedido inteiro, não só o status do pacote', () => {
    const aba = readFileSync(join(WEB, 'components/admin/settings-lgpd.tsx'), 'utf8')
    expect(aba).toContain('situacaoDoPedidoNaAba(r.status, r.medical_status)')
    expect(aba).not.toContain('STATUS[r.status]')
  })
})
