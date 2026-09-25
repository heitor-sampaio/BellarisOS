import { test, expect } from '@playwright/test'

/**
 * Nenhuma tela renderiza com defeito estrutural.
 *
 * Dois avisos do React que **não são cosméticos** e que eu já deixei passar:
 *
 * 1. **Hidratação divergente.** Quando o texto que o servidor escreveu não bate
 *    com o que o cliente calcula, o React descarta a árvore e redesenha tudo no
 *    navegador. O caso de origem (2026-09-25): a inicial do avatar do inbox
 *    saía de `nome[0]`, que pega a primeira unidade UTF-16 e não o primeiro
 *    caractere — num contato chamado "👁️‍🗨️" isso é metade de um par
 *    substituto, que não é UTF-8 válido. Ver `iniciaisDoNome` em
 *    `packages/utils`.
 *
 * 2. **Chave de lista faltando ou repetida.** O React deixa de casar os itens
 *    de um render para o outro e pode reaproveitar o pedaço de DOM errado — no
 *    estoque, expandir um produto mexia na linha de outro. O caso de origem:
 *    o `map` devolvia um fragmento `<>` sem chave, com a `key` no `<tr>` de
 *    dentro, que não é o filho da lista.
 *
 * Roda contra o banco de desenvolvimento de propósito: é lá que estão os nomes
 * de verdade, com emoji e tudo, que nenhum dado inventado teria.
 */

/** Rotas + um gesto opcional, para alcançar o que só aparece depois de clicar. */
const TELAS: { rota: string; abrir?: string }[] = [
  { rota: '/admin/dashboard' },
  { rota: '/admin/agenda' },
  { rota: '/admin/clients' },
  { rota: '/admin/planejamentos' },
  { rota: '/admin/injetaveis' },
  { rota: '/admin/inbox' },
  { rota: '/admin/oportunidades' },
  { rota: '/admin/notificacoes' },
  { rota: '/admin/marketing' },
  { rota: '/admin/financeiro' },
  { rota: '/admin/estoque' },
  { rota: '/admin/estoque', abrir: 'Por unidade' },
  { rota: '/admin/reports' },
  { rota: '/admin/team' },
  { rota: '/admin/procedures' },
  { rota: '/admin/automacoes' },
  { rota: '/admin/settings' },
  { rota: '/admin/settings?tab=eventos' },
  { rota: '/admin/settings?tab=general' },
]

const RUIM = /hydrat|server rendered|didn't match|unique .key./i

for (const { rota, abrir } of TELAS) {
  const nome = abrir ? `${rota} (${abrir})` : rota
  test(`${nome} renderiza sem aviso do React`, async ({ page }) => {
    const falhas: string[] = []
    const olhar = (t: string) => { if (RUIM.test(t)) falhas.push(t.slice(0, 300)) }
    page.on('console', m => olhar(m.text()))
    page.on('pageerror', e => olhar(e.message))

    await page.goto(rota)
    await page.waitForLoadState('networkidle')
    if (abrir) {
      const gatilho = page.getByRole('button', { name: abrir }).first()
      if (await gatilho.count()) await gatilho.click()
    }
    // Os dois avisos saem DEPOIS da hidratação, não durante o load.
    await page.waitForTimeout(1200)

    expect(falhas, `${nome} tem defeito de render`).toEqual([])
  })
}
