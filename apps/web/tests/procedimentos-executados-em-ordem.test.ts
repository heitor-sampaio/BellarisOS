import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Os procedimentos feitos no atendimento saem NA ORDEM DA SESSÃO
 * (`treatment_plan_session_procedures.sort_order`). É a ordem em que a cliente
 * os vê para dar a nota (`procedimentosDoAtendimento`) e a das notas na tela
 * da equipe (F17-3). A função não tinha `order by`: o banco devolvia na ordem
 * que quisesse, e a 1ª completa contra o banco local pegou "Preenchimento ·
 * Botox" numa sessão "Botox, Preenchimento" (16/11).
 */
const RAIZ = join(__dirname, '..', '..', '..')

function ultimaDefinicao(funcao: string): string {
  const pasta = join(RAIZ, 'supabase', 'migrations')
  const padrao = new RegExp(`create or replace function public\\.${funcao}\\b`, 'i')
  const nome = readdirSync(pasta).filter(n => n.endsWith('.sql')).sort()
    .filter(n => padrao.test(readFileSync(join(pasta, n), 'utf8'))).pop()
  return nome ? readFileSync(join(pasta, nome), 'utf8') : ''
}

describe('metrics_procedimentos_executados', () => {
  it('ordena pela ordem da sessão (sort_order), com desempate fixo', () => {
    const sql = ultimaDefinicao('metrics_procedimentos_executados')
    expect(sql).toMatch(/order by[^;]*sort_order/i)
  })
})
