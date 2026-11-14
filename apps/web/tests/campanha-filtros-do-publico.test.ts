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
  it('sem filtro, nada (a tela diz "todas as clientes ativas")', () => {
    expect(filtrosDoPublico({})).toEqual([])
  })
})
