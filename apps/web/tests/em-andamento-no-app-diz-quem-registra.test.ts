import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * D20 da 31ª simulação (AG-55; o Heitor, 25/11: o "Em andamento" é o que "já
 * começou e não acabou"): no app, o "Em andamento" não dizia que a equipe
 * registra o fim — o texto de AG-55 ("A equipe registra quando o atendimento
 * terminar") só existia na dica do "passou da hora". Fica à vista no cartão da
 * home e no grupo "Em andamento" da Agenda, num seletor próprio
 * (`data-em-andamento-registra`): o caso "A51" de
 * `e2e/portal-cliente-alterar-agendamento.spec.ts` exige o `[data-passou-da-hora]`
 * ausente no "Em andamento".
 */
const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

describe('D20: o "Em andamento" do app diz quem registra o fim', () => {
  it('o texto mora num lugar só', async () => {
    const { TEXTO_DO_EM_ANDAMENTO_NO_APP } = await import('@/lib/clientes/textos-do-app')
    expect(TEXTO_DO_EM_ANDAMENTO_NO_APP).toBe('A equipe registra quando o atendimento terminar.')
  })
  it('a home mostra a linha quando há um em andamento, à vista (não na dica)', () => {
    const home = fonte('app/[slug]/cliente/home/page.tsx')
    expect(home).toMatch(/\{emAndamentoAppt && \(\s*<p data-em-andamento-registra[^>]*>\{TEXTO_DO_EM_ANDAMENTO_NO_APP\}<\/p>/)
  })
  it('a Agenda do app mostra a linha no grupo "Em andamento"', () => {
    const agenda = fonte('app/[slug]/cliente/agendamentos/page.tsx')
    const i = agenda.indexOf('<GroupLabel>Em andamento</GroupLabel>')
    expect(i).toBeGreaterThan(-1)
    expect(agenda.slice(i, i + 400)).toMatch(/<p data-em-andamento-registra[^>]*>\{TEXTO_DO_EM_ANDAMENTO_NO_APP\}<\/p>/)
  })
})
