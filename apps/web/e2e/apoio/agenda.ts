import { expect, type Locator, type Page } from '@playwright/test'

/**
 * O cartão de um agendamento na grade do DIA da agenda da unidade, pronto para
 * o clique (F45, 2026-11-07).
 *
 * A grade rola sozinha ao hidratar (`rolagemDaGrade`: o primeiro atendimento ou
 * a abertura da unidade). Clicar no cartão logo depois do `goto` disputava com
 * essa rolagem: o Playwright trazia o cartão para a vista, a grade rolava, e o
 * clique caía na coluna — abria o "Novo agendamento" às 01:45 em vez da janela
 * do agendamento, e o teste esperava 5 minutos por um botão que não vinha
 * (A27 da 7ª e A20 da 8ª, na completa de 06–07/11). A grade marca
 * `data-rolagem="pronta"` depois de rolar; daí em diante o cartão fica parado.
 */
export async function cartaoNaGradeDoDia(p: Page, agendamentoId: string): Promise<Locator> {
  await expect(p.locator('[data-grade-do-dia][data-rolagem="pronta"]')).toBeVisible()
  return p.locator(`[data-agendamento="${agendamentoId}"]`).first()
}
