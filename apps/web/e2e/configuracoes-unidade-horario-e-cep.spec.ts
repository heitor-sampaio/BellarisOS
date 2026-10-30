import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * J-4 e J-5 (simulação): o "Nova unidade" não perguntava o horário de
 * funcionamento — a unidade nascia no padrão e a dona só descobria na agenda
 * —, e o CEP (nos dois formulários de unidade) só buscava ao SAIR do campo e
 * não tinha máscara. Agora o modal tem o mesmo editor de horário do detalhe
 * (que `createBranch` já lia), e o CEP ganha a máscara e busca ao 8º dígito,
 * como o setup.
 *
 * O ViaCEP é trocado por uma resposta fixa (page.route): o teste não depende
 * da rede de fora.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestora: MembroDeTeste | null = null

async function como<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: gestora!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function viaCepFalso(p: Page) {
  await p.route('https://viacep.com.br/**', r => r.fulfill({
    json: { logradouro: 'Rua Felipe Schmidt', bairro: 'Centro', localidade: 'Florianópolis', uf: 'SC' },
  }))
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`uh${marca}`)
  gestora = await criarMembro(`uhg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestora', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  if (rede) await db().from('branches').delete().eq('tenant_id', rede.tenantId).neq('id', rede.branchId)
  await gestora?.limpar()
  await rede?.limpar()
})

test('o "Nova unidade" pergunta o horário de funcionamento, e a unidade nasce com ele', async ({ browser }) => {
  const nome = `${PREFIXO} Kobrasol ${marca}`
  await como(browser, async p => {
    await viaCepFalso(p)
    await p.goto('/admin/settings?tab=unidades')
    await p.getByRole('button', { name: 'Nova unidade' }).click()
    const janela = p.getByRole('dialog', { name: 'Nova unidade' })
    await expect(janela.getByText('Horário de funcionamento')).toBeVisible()
    await janela.locator('#br-name').fill(nome)
    await janela.getByLabel('Sábado abre').uncheck()
    await janela.getByLabel('Segunda, abre às').fill('09:00')

    // J-5: máscara enquanto digita e a busca no 8º dígito, sem sair do campo.
    const cep = janela.getByLabel('CEP')
    await cep.pressSequentially('88010400')
    await expect(cep).toHaveValue('88010-400')
    await expect(janela.locator('#br-city')).toHaveValue('Florianópolis')
    await expect(janela.locator('#br-address')).toHaveValue('Rua Felipe Schmidt — Centro')
    await expect(cep).toBeFocused()

    await janela.getByRole('button', { name: 'Criar unidade' }).click()
    await expect(janela).toBeHidden({ timeout: 15_000 })
  })
  const { data } = await db().from('branches').select('horario, zip_code, city, state')
    .eq('tenant_id', rede!.tenantId).eq('name', nome).single<{ horario: { dias: Record<string, { de: string; ate: string }[]> } | null; zip_code: string; city: string; state: string }>()
  expect(data!.horario?.dias['6'], 'sábado fechado').toEqual([])
  expect(data!.horario?.dias['1'], 'segunda das 09').toEqual([{ de: '09:00', ate: '20:00' }])
  expect([data!.zip_code, data!.city, data!.state]).toEqual(['88010-400', 'Florianópolis', 'SC'])
})

test('o detalhe da unidade também busca o CEP ao 8º dígito, com máscara', async ({ browser }) => {
  await como(browser, async p => {
    await viaCepFalso(p)
    await p.goto(`/admin/branches/${rede!.branchId}`)
    const cep = p.getByLabel('CEP')
    await cep.fill('')
    await cep.pressSequentially('88010400')
    await expect(cep).toHaveValue('88010-400')
    await expect(p.locator('#be-city')).toHaveValue('Florianópolis')
    await expect(cep).toBeFocused()
  })
})
