import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A3 da 41ª (CLAUDE.md §14: "Botão que a pessoa não pode usar: a tela esconde"):
 * o atendimento cancelado (a desistência no meio) seguia com o editor do plano
 * da avaliação ("Nova sessão"), que só se grava pelo "Gerar plano" — e
 * `gerar_plano_da_avaliacao` recusa o cancelado ("Agendamento cancelado não
 * gera plano."). O editor some no cancelado e na falta; o concluído o mantém
 * ("Montar um plano"). O "Planejamento" do topo fica: o plano é da CLIENTE e se
 * monta "depois" (§11, UM3), e `criarPlanoDoCliente` aceita.
 *
 * O cartão de insumos do cancelado mostra a baixa gravada (D11); sem baixa, some
 * (decisão do Claude, 28/11): não há o que dizer nem o que mexer.
 */
const tela = readFileSync(join(__dirname, '..', 'components/branch/appointment-session.tsx'), 'utf8')

describe('o cancelado não oferece o que o servidor recusa', () => {
  it('o editor do plano da avaliação só no aberto ou no concluído', () => {
    const ramo = tela.slice(tela.indexOf('// Plano ainda não gerado → formulário unificado'), tela.indexOf('{renderFichaCard(insumosSection, true)}'))
    expect(ramo).toMatch(/\{\(status === 'COMPLETED' \|\| !isDone\) && podeVerPlanos && <TreatmentPlanEditor\s/)
  })

  it('o cartão de insumos do cancelado só com a baixa que houve', () => {
    expect(tela).toMatch(/const mostraOsInsumos = canManage && !\(isDone && status !== 'COMPLETED' && insumos\.length === 0\)/)
    expect(tela).not.toMatch(/\{canManage && <InsumoCard key=\{versaoDosInsumos\} \{\.\.\.insumoProps\} \/>\}/)
  })
})
