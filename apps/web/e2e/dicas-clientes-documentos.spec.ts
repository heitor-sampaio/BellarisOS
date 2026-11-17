import { test, expect } from '@playwright/test'
import { banco, PREFIXO, tenantId, unidadesAtivas } from './apoio/banco'
import { apagarClientes } from './apoio/limpeza'

/**
 * As explicações saem da tela e vão para a dica (o Heitor, 2026-11-16: "pode
 * tirar esse monte de aviso e explicação, se quiser manter bota em um
 * tooltipzinho que só aparece se passar o mouse em cima. Aproveita e faz esse
 * ajuste pra todo sistema"), na ficha da cliente, nos planos de tratamento e
 * nos injetáveis (docs/regras/design.md, "A explicação mora na dica").
 *
 * A tela mostra o estado e o caminho para agir; o "por que" e o "como
 * funciona" ficam no "i" ao lado do rótulo, que abre ao passar o mouse (e no
 * toque, no celular). Com a sessão padrão (a Admin da rede de teste) e uma
 * ficha `[e2e]` nova, sem documento nem plano.
 */

const marca = Date.now().toString(36)
let cliente = ''

test.beforeAll(async () => {
  const [unidade] = await unidadesAtivas()
  const n8 = String(Date.now()).slice(-8)
  const { data, error } = await banco().from('clients').insert({
    tenant_id: await tenantId(), branch_id: unidade!.id,
    name: `${PREFIXO} Dicas da ficha ${marca}`, phone: `(71) 9${n8.slice(0, 4)}-${n8.slice(4)}`,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  cliente = data!.id
})

test.afterAll(async () => {
  if (cliente) await apagarClientes([cliente])
})

test.describe('Clientes e documentos: a explicação fica na dica', () => {
  test('a ficha: o vazio dos documentos, o menu e a exportação da LGPD sem parágrafo; a dica abre ao passar o mouse', async ({ page }) => {
    await page.goto(`/admin/clients/${cliente}?aba=documentos`)
    await expect(page.getByText('Nenhum documento anexado', { exact: true })).toBeVisible()

    // O vazio diz só o estado; onde moram os anexos clínicos está na dica.
    const ondeFicam = page.getByText(/ficam na aba Prontuário, em Anexos clínicos/)
    await expect(ondeFicam).toBeHidden()
    await page.getByRole('button', { name: 'Onde ficam os anexos clínicos' }).hover()
    await expect(ondeFicam).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(ondeFicam).toBeHidden()

    // O menu: o que arquivar faz mora na dica ao lado de "Arquivar cliente".
    await page.getByRole('button', { name: 'Mais ações' }).click()
    const arquivar = page.getByText(/Some das listas e deixa de contar como cliente nova/)
    await expect(arquivar).toBeHidden()
    await page.getByRole('button', { name: 'Sobre arquivar a cliente' }).hover()
    await expect(arquivar).toBeVisible()

    // A exportação da LGPD: o parágrafo de abertura foi para a dica do título.
    await page.getByRole('button', { name: 'Exportar dados (LGPD)' }).click()
    const janela = page.getByRole('dialog', { name: 'Exportar dados (LGPD)' })
    await expect(janela.getByRole('button', { name: 'Gerar o pacote' })).toBeVisible()
    const oQueLeva = janela.getByText(/em PDF e JSON/)
    await expect(oQueLeva).toBeHidden()
    await janela.getByRole('button', { name: 'Sobre o pacote da LGPD' }).hover()
    await expect(oQueLeva).toBeVisible()
  })

  test('o Planejamento da ficha e o "Novo plano" de Tratamentos: sem o parágrafo, o "como funciona" na dica', async ({ page }) => {
    await page.goto(`/admin/clients/${cliente}?aba=planejamento`)
    await expect(page.getByText('Nenhum plano ainda', { exact: true })).toBeVisible()
    const doCliente = page.getByText(/pode ser montado agora, revisado depois/)
    await expect(doCliente).toBeHidden()
    await page.getByRole('button', { name: 'Sobre o plano de tratamento' }).hover()
    await expect(doCliente).toBeVisible()

    await page.goto('/admin/planejamentos')
    await page.getByRole('button', { name: 'Novo plano' }).first().click()
    const janela = page.getByRole('dialog', { name: 'Novo plano' })
    await expect(janela.getByLabel('Nome do plano')).toBeVisible()
    const subtitulo = janela.getByText(/Dê um nome para reencontrar o plano depois/)
    await expect(subtitulo).toBeHidden()
    await janela.getByRole('button', { name: 'Sobre o nome e a cliente do plano' }).hover()
    await expect(subtitulo).toBeVisible()
  })

  test('Injetáveis: o subtítulo da lista e o "e o cliente?" do novo planejamento moram na dica', async ({ page }) => {
    await page.goto('/admin/injetaveis')
    await expect(page.getByRole('heading', { level: 1, name: /Injetáveis/ })).toBeVisible()
    const subtitulo = page.getByText('Planejamento com nome, com ou sem cliente.')
    await expect(subtitulo).toBeHidden()
    await page.getByRole('button', { name: 'Sobre os injetáveis' }).hover()
    await expect(subtitulo).toBeVisible()
    await page.mouse.move(0, 0)

    await page.getByRole('button', { name: 'Novo planejamento' }).click()
    const janela = page.getByRole('dialog', { name: 'Novo planejamento' })
    await expect(janela.getByLabel('Nome *')).toBeVisible()
    const oCliente = janela.getByText(/O cliente entra depois, pelo cabeçalho do planejamento/)
    await expect(oCliente).toBeHidden()
    await janela.getByRole('button', { name: 'Sobre o cliente do planejamento' }).hover()
    await expect(oCliente).toBeVisible()
  })

  test.describe('no celular', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
    test('a dica do vazio dos documentos abre no toque', async ({ page }) => {
      await page.goto(`/admin/clients/${cliente}?aba=documentos`)
      const ondeFicam = page.getByText(/ficam na aba Prontuário, em Anexos clínicos/)
      await expect(page.getByText('Nenhum documento anexado', { exact: true })).toBeVisible()
      await expect(ondeFicam).toBeHidden()
      await page.getByRole('button', { name: 'Onde ficam os anexos clínicos' }).tap()
      await expect(ondeFicam).toBeVisible()
    })
  })
})
