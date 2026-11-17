import { test, expect } from '@playwright/test'

/**
 * Configurações — comissões, integrações, cargos (o inbox) e fidelidade: as
 * explicações saem da tela e vão para a dica (o Heitor, 2026-11-16: "pode tirar
 * esse monte de aviso e explicação, se quiser manter bota em um tooltipzinho
 * que só aparece se passar o mouse em cima. Aproveita e faz esse ajuste pra
 * todo sistema").
 *
 * Em cada tela: o parágrafo não está à vista e aparece ao passar o mouse no "i"
 * ao lado do título ou do rótulo. Só lê (a sessão padrão, a admin da rede de
 * teste): nada se grava.
 */
test.describe('Configurações (comissões, integrações, fidelidade): a explicação fica na dica', () => {
  test('Comissões e taxas: os parágrafos dos cartões e o texto de ajuda dos campos moram na dica', async ({ page }) => {
    await page.goto('/admin/settings?tab=comissoes')

    const cada = page.locator('[aria-label="Comissão de cada profissional"]')
    await expect(cada).toBeVisible()
    await expect(cada.getByText(/O percentual \(ou valor fixo\) de cada profissional/)).toBeHidden()
    await cada.getByRole('button', { name: 'Onde se define a comissão de cada um' }).hover()
    await expect(cada.getByText(/O percentual \(ou valor fixo\) de cada profissional/)).toBeVisible()

    // O "como funciona" do "Quando a comissão vale" e o fechamento (as três opções).
    const como = page.locator('[aria-label="Como a comissão acontece"]')
    await expect(como.getByText('Quando a cliente paga tudo o que a gerou')).toBeVisible()
    await expect(como.getByText(/Cartão de crédito em várias vezes conta como pago/)).toBeHidden()
    await como.getByRole('button', { name: 'Como funciona (pacote, plano, cartão, crediário, estorno)' }).hover()
    await expect(como.getByText(/Cartão de crédito em várias vezes conta como pago/)).toBeVisible()
    await expect(como.getByText(/Dois fechamentos por mês/)).toBeHidden()
    await como.getByRole('button', { name: 'Sobre o fechamento das comissões' }).hover()
    await expect(como.getByText(/Dois fechamentos por mês/)).toBeVisible()

    // As taxas: o parágrafo do título e o do "Parcelar no crédito até".
    const taxas = page.locator('[aria-label="Taxas da maquininha"]')
    await expect(taxas.getByText(/O percentual que a operadora cobra/)).toBeHidden()
    await taxas.getByRole('button', { name: 'Como as taxas entram na conta' }).hover()
    await expect(taxas.getByText(/O percentual que a operadora cobra/)).toBeVisible()
    await expect(taxas.getByText(/do recebimento, do checkout do plano e das vendas/)).toBeHidden()
    await taxas.getByRole('button', { name: 'Sobre o parcelar no crédito' }).hover()
    await expect(taxas.getByText(/do recebimento, do checkout do plano e das vendas/)).toBeVisible()

    // O crediário: o texto de ajuda do campo.
    const crediario = page.locator('[aria-label="Crediário"]')
    await expect(crediario.getByText(/Acima disso o sistema não deixa passar/)).toBeHidden()
    await crediario.getByRole('button', { name: 'Sobre o limite de parcelas' }).hover()
    await expect(crediario.getByText(/Acima disso o sistema não deixa passar/)).toBeVisible()
  })

  test('Fidelidade: o subtítulo do programa, o "como funciona" dos blocos e o do catálogo moram na dica', async ({ page }) => {
    await page.goto('/admin/settings?tab=fidelidade')

    const programa = page.getByRole('region', { name: 'Programa de fidelidade' })
    await expect(programa).toBeVisible()
    await expect(programa.getByText(/O cliente acumula pontos a cada pagamento/)).toBeHidden()
    await programa.getByRole('button', { name: 'Sobre o programa de fidelidade' }).hover()
    await expect(programa.getByText(/O cliente acumula pontos a cada pagamento/)).toBeVisible()

    await expect(programa.getByText(/abater pontos do valor/)).toBeHidden()
    await programa.getByRole('button', { name: 'Como o desconto em pontos funciona' }).hover()
    await expect(programa.getByText(/abater pontos do valor/)).toBeVisible()

    // O exemplo do campo, na dica ao lado do rótulo — e o campo segue achado pelo rótulo.
    await expect(programa.getByLabel('Valor de 1 ponto (R$)')).toBeVisible()
    await expect(programa.getByText(/100 pontos valem R\$ 1/)).toBeHidden()
    await programa.getByRole('button', { name: 'Exemplo: quanto vale o ponto' }).hover()
    await expect(programa.getByText(/100 pontos valem R\$ 1/)).toBeVisible()

    const catalogo = page.getByTestId('catalogo-de-recompensas')
    await expect(catalogo.getByText(/O que o cliente pode ganhar trocando pontos/)).toBeHidden()
    await catalogo.getByRole('button', { name: 'Sobre o catálogo de recompensas' }).hover()
    await expect(catalogo.getByText(/O que o cliente pode ganhar trocando pontos/)).toBeVisible()
  })

  test('Cargos: o "para quem vale" do inbox de quem vê só os seus mora na dica; a consequência da escolha fica à vista', async ({ page }) => {
    await page.goto('/admin/settings?tab=permissions')
    const secao = page.getByRole('region', { name: 'Inbox de quem vê só as próprias oportunidades' })
    await expect(secao).toBeVisible()
    await expect(secao.getByTestId('explicacao-visibilidade')).toBeVisible()
    await expect(secao.getByText(/Quem vê tudo não muda/)).toBeHidden()
    await secao.getByRole('button', { name: 'Para quem vale esta escolha' }).hover()
    await expect(secao.getByText(/Quem vê tudo não muda/)).toBeVisible()
  })

  test('Integrações: o texto de ajuda do campo mora na dica ao lado do rótulo', async ({ page }) => {
    await page.goto('/admin/settings?tab=integrations')
    // O Google Ads abre o formulário com qualquer configuração (os campos são sempre os mesmos).
    await page.getByRole('button', { name: /^Google Ads/ }).click()
    await expect(page.getByPlaceholder('Ex: 123-456-7890 ou 1234567890')).toBeVisible()
    await expect(page.getByText(/Número de 10 dígitos encontrado/)).toBeHidden()
    await expect(page.getByText(/aprovação manual da Google/)).toBeHidden()
    await page.getByRole('button', { name: 'Sobre o campo Customer ID' }).hover()
    await expect(page.getByText(/Número de 10 dígitos encontrado/)).toBeVisible()
    await page.getByRole('button', { name: 'Sobre o campo Developer Token' }).hover()
    await expect(page.getByText(/aprovação manual da Google/)).toBeVisible()
  })

  test.describe('no celular', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
    test('a dica abre no toque', async ({ page }) => {
      await page.goto('/admin/settings?tab=comissoes')
      const taxas = page.locator('[aria-label="Taxas da maquininha"]')
      await expect(taxas).toBeVisible()
      await expect(taxas.getByText(/O percentual que a operadora cobra/)).toBeHidden()
      await taxas.getByRole('button', { name: 'Como as taxas entram na conta' }).tap()
      await expect(taxas.getByText(/O percentual que a operadora cobra/)).toBeVisible()
    })
  })
})
