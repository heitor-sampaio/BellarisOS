import { test, expect } from '@playwright/test'
import { banco, nomeDeTeste, tenantId } from './apoio/banco'

/**
 * D16 da simulação de 2026-10-28: o passo "Mandar mensagem" mostrava
 * "WhatsApp" no seletor de canal sem ter gravado nada (`c.canal ?? 'whatsapp'`),
 * e a validação acusava "Falta o canal" até a pessoa escolher a opção de novo.
 * O que a tela mostra é o que está na config: o passo nasce com
 * `canal: 'whatsapp'`; automação já salva sem canal mostra "Escolha o canal…".
 */
const criadas: string[] = []
test.afterAll(async () => {
  const db = banco()
  for (const id of criadas) await db.from('automations').delete().eq('id', id)
})

test('o passo "Mandar mensagem" nasce com o canal WhatsApp GRAVADO', async ({ page }) => {
  await page.goto('/admin/automacoes')
  await page.getByRole('button', { name: 'Nova automação' }).click()
  await page.getByPlaceholder('Nome da automação').fill(nomeDeTeste('Canal'))
  await page.getByRole('button', { name: 'Criar', exact: true }).click()
  await page.waitForURL(/\/admin\/automacoes\/[0-9a-f-]{36}/)
  const id = page.url().split('/').pop()!
  criadas.push(id)

  await page.getByRole('button', { name: 'Mandar mensagem' }).click()
  const painel = page.getByLabel('Configuração do node')
  await expect(painel.getByLabel(/^Canal/)).toHaveValue('whatsapp')
  await painel.getByPlaceholder('Oi {{cliente.nome}}, tudo bem?').fill('Oi')

  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible()
  const { data } = await banco().from('automations').select('grafo').eq('id', id).single()
  const no = (data!.grafo as { nos: { tipo: string; config: Record<string, unknown> }[] }).nos.find(n => n.tipo === 'acao.mensagem')!
  expect(no.config.canal, 'o que a tela mostrava tem de estar gravado').toBe('whatsapp')
})

test('automação salva sem canal mostra "Escolha o canal", não WhatsApp', async ({ page }) => {
  const { data, error } = await banco().from('automations').insert({
    tenant_id: await tenantId(), nome: nomeDeTeste('SemCanal'), status: 'RASCUNHO', gatilhos: ['conversa.mensagem_recebida'],
    grafo: {
      nos: [
        { id: 'g', tipo: 'gatilho.evento', pos: { x: 0, y: 0 }, nome: 'Quando acontecer', config: { evento: 'conversa.mensagem_recebida' } },
        { id: 'm', tipo: 'acao.mensagem', pos: { x: 280, y: 0 }, nome: 'Mandar mensagem', config: { texto: 'Oi' } },
      ],
      ligacoes: [{ id: 'l1', de: 'g', para: 'm' }],
    },
  }).select('id').single()
  expect(error).toBeNull()
  criadas.push(data!.id as string)

  await page.goto(`/admin/automacoes/${data!.id}`)
  await page.locator('.react-flow__node', { hasText: 'Mandar mensagem' }).click()
  const canal = page.getByLabel('Configuração do node').getByLabel(/^Canal/)
  await expect(canal, 'a tela não pode escolher por quem a config deixou vazia').toHaveValue('')
  await expect(canal.locator('option:checked')).toHaveText('Escolha o canal…')
  // A validação diz o mesmo que a tela: falta o canal.
  await expect(page.getByText(/Falta o canal/).first()).toBeVisible()

  // Escolher grava.
  await canal.selectOption('instagram')
  await expect(canal).toHaveValue('instagram')
})
