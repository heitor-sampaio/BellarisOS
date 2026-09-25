import { test, expect, type Page } from '@playwright/test'

/**
 * Seletor tem UMA altura em todo o sistema.
 *
 * O Heitor viu, em 2026-09-24, que "no dashboard o seletor de período é maior
 * do que o seletor de unidade na agenda" — e estava certo: o `<SegSelect>`
 * tinha duas variantes de tamanho, e cada tela escolhia a sua no `style`
 * inline. Este arquivo existe porque a regra é invisível: nada quebra quando
 * alguém acrescenta um `padding` próprio a um seletor, a barra só volta a ficar
 * desalinhada. Ver §13 do CLAUDE.md.
 *
 * O número não está escrito aqui de propósito: o teste lê `--altura-controle`
 * do próprio CSS. Mudar a altura do sistema é uma linha; sair da altura do
 * sistema é o que este teste barra.
 */

/** `abrir`: painel que precisa ser aberto para os seletores existirem na tela. */
const TELAS: { rota: string; abrir?: string }[] = [
  { rota: '/admin/dashboard' },
  { rota: '/admin/agenda' },
  { rota: '/admin/planejamentos' },
  { rota: '/admin/estoque' },
  { rota: '/admin/financeiro' },
  { rota: '/admin/clients' },
  { rota: '/admin/oportunidades' },
  { rota: '/admin/inbox', abrir: 'button[title="Filtrar conversas"]' },
  { rota: '/admin/notificacoes' },
  { rota: '/admin/team' },
  { rota: '/admin/reports' },
]

/** Altura declarada no design system, em pixels. */
async function alturaDoSistema(page: Page): Promise<number> {
  const bruto = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--altura-controle').trim(),
  )
  expect(bruto, 'o token --altura-controle precisa existir no globals.css').toMatch(/^\d/)
  return Number.parseFloat(bruto)
}

const SELETORES = '.seg-desktop, .seg-mobile, .filtro-select, .filtro-toggle'

async function abrirTela(page: Page, rota: string, abrir?: string) {
  await page.goto(rota)
  await page.waitForLoadState('networkidle')
  if (abrir) {
    const gatilho = page.locator(abrir).first()
    await gatilho.waitFor({ state: 'visible' })
    await gatilho.click()
  }
}

test.describe('seletores', () => {
  for (const { rota, abrir } of TELAS) {
    test(`todo seletor de ${rota} tem a altura do sistema`, async ({ page }) => {
      await abrirTela(page, rota, abrir)
      const esperada = await alturaDoSistema(page)

      // Só o que está VISÍVEL: o segmentado e o gatilho de celular coexistem no
      // DOM, e o escondido mede zero.
      const medidas = await page.evaluate((sel) => {
        return [...document.querySelectorAll(sel)]
          .filter(el => (el as HTMLElement).offsetParent !== null)
          .map(el => ({
            classe: el.className,
            texto: (el.textContent ?? '').trim().slice(0, 40),
            altura: Math.round(el.getBoundingClientRect().height),
          }))
      }, SELETORES)

      expect(medidas.length, `${rota} não tem nenhum seletor — o seletor da tela sumiu?`).toBeGreaterThan(0)

      const fora = medidas.filter(m => m.altura !== esperada)
      expect(fora, `seletores fora de --altura-controle (${esperada}px) em ${rota}`).toEqual([])
    })
  }

  test('nenhum seletor do sistema carrega aparência em style inline', async ({ page }) => {
    // `style` vence classe: um padding ou um raio ali desfaz a padronização sem
    // erro nenhum, e foi assim que o sistema chegou a quatro desenhos da mesma
    // coisa. Posição (flex, largura, margem) continua permitida — é do layout
    // da barra, não do controle.
    const APARENCIA = ['padding', 'font-size', 'border-radius', 'background', 'height', 'border']

    for (const { rota, abrir } of TELAS) {
      await abrirTela(page, rota, abrir)

      const sujos = await page.evaluate(({ props, sel }) => {
        return [...document.querySelectorAll(sel + ', .seg-chip, .chip-filtro')]
          .map(el => ({ el, inline: (el.getAttribute('style') ?? '').toLowerCase() }))
          .filter(({ inline }) => inline && props.some(p => inline.includes(p)))
          .map(({ el, inline }) => `${el.className} → ${inline}`)
      }, { props: APARENCIA, sel: SELETORES })

      expect(sujos, `aparência em style inline em ${rota}`).toEqual([])
    }
  })
})
