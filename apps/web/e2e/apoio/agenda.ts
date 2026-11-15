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

/**
 * Clica no horário vazio da grade da AGENDA DA REDE, `y` px abaixo do topo da
 * coluna (a completa de 14–15/11).
 *
 * A grade da rede rola sozinha ao abrir (D13 da 13ª): hoje, para uma hora
 * antes de agora. Às 23:40 o topo da coluna ficava ~1.500 px acima da área
 * visível, e o clique em `caixa.y + 2 * 72` caía FORA da grade (no cabeçalho
 * da página) — o "Novo agendamento" não abria. Depois da rolagem pronta, rola
 * a grade até o ponto e só então mede a coluna.
 */
export async function clicarNoHorarioDaRede(p: Page, coluna: Locator, y: number): Promise<void> {
  const grade = p.locator('[data-grade-da-rede][data-rolagem="pronta"]')
  await expect(grade).toBeVisible()
  await grade.evaluate((el, alvo) => { el.scrollTop = Math.max(0, alvo - 80) }, y)
  const caixa = await coluna.boundingBox()
  if (!caixa) throw new Error('não achei a coluna da grade')
  await p.mouse.click(caixa.x + caixa.width / 2, caixa.y + y)
}
