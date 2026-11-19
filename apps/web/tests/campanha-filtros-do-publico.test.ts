import { describe, it, expect } from 'vitest'
import { filtrosDoPublico } from '@/lib/notifications/resumo-do-publico'

/** A15 da 7ª simulação: o "Revisar" da campanha não dizia o filtro do público. */
describe('os filtros do público da campanha, em português', () => {
  it('diz cada filtro, com os nomes', () => {
    expect(filtrosDoPublico(
      { tags: ['VIP'], genders: ['F'], procedure_ids: ['p1'], has_app_account: true, max_days_since_visit: 60 },
      { procedimentos: [{ id: 'p1', name: 'Botox' }] },
    )).toEqual(['Tags: VIP', 'Sexo: feminino', 'Fez: Botox', 'Sem visita há mais de 60 dias', 'Só quem tem o app'])
  })
  // O filtro de Tags é E em todo lugar (crm-inbox.md; o Heitor, 19/11: "Quem
  // tem TODAS (E)"): com duas ou mais, a tela diz que entram as que têm TODAS.
  it('com mais de uma tag, diz que é preciso ter todas', () => {
    expect(filtrosDoPublico({ tags: ['VIP', 'Noiva'] })).toEqual(['Tags (todas): VIP, Noiva'])
  })
  it('sem filtro, nada (a tela diz "todas as clientes ativas")', () => {
    expect(filtrosDoPublico({})).toEqual([])
  })
})
