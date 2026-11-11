import { describe, it, expect } from 'vitest'
import { escopoInicial } from '@/lib/cargos/escopo-inicial'

/**
 * A2 da 12ª simulação (2026-11-11): o cargo novo trazia os alcances
 * pré-marcados ("Só a própria agenda", "Só as próprias comissões") com o
 * módulo em "Sem acesso", e a Contadora foi salva com "Só as próprias
 * comissões" por engano. Princípio 3: o alcance nasce SEM escolha (`null`), e
 * a tela pede ao ligar o módulo. (Substitui a A5 da 9ª, o CRM nascendo em
 * "Todos": agora nenhum escopável nasce escolhido.)
 */
describe('o escopo com que o módulo nasce ao ser ligado no cargo', () => {
  it('nenhum escopável nasce escolhido', () => {
    for (const m of ['agenda', 'medical_records', 'financial', 'crm', 'reports'] as const) {
      expect(escopoInicial(m, undefined), m).toBeNull()
      expect(escopoInicial(m, { level: 'NONE', scope: 'ALL' }), `${m}: o ALL do banco não é escolha`).toBeNull()
    }
  })
  it('o "só os meus" guardado do módulo desligado volta ao religar (D6)', () => {
    expect(escopoInicial('crm', { level: 'NONE', scope: 'OWN' })).toBe('OWN')
    expect(escopoInicial('agenda', { level: 'NONE', scope: 'OWN' })).toBe('OWN')
  })
  it('o módulo já ligado mantém o que foi escolhido', () => {
    expect(escopoInicial('crm', { level: 'MANAGE', scope: 'OWN' })).toBe('OWN')
    expect(escopoInicial('agenda', { level: 'VIEW', scope: 'ALL' })).toBe('ALL')
  })
})
