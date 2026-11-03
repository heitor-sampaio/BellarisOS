import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * atend-15 e A34 da 5ª simulação.
 *
 * O Heitor (2026-11-02): "alergia: opção de sim ou não; se sim, campo texto
 * livre para detalhamento e alerta". Nada interpreta o texto: "Sim" abre
 * "Quais alergias?" e dispara a faixa; "Não" não dispara.
 *
 * A34: a alergia digitada no atendimento só virava faixa depois de concluir
 * (a faixa lia a anamnese SALVA). Agora a faixa acompanha o que está na tela,
 * e o rascunho a guarda: recarregar não apaga.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let slug = ''
let atendimento = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`al${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  profissional = await criarMembro(`alp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
  const cliente = await rede.criarCliente('Carla')
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: profissional.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  atendimento = data!.id
})
test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await profissional?.limpar(); await rede?.limpar()
})

test('a ficha de saúde da rede nova pergunta a alergia em Sim/Não, com o detalhe só no Sim', async () => {
  const { data } = await db().from('forms').select('schema').eq('tenant_id', rede!.tenantId).eq('tipo', 'PRE_ATENDIMENTO').single()
  type Campo = { id: string; type: string; options?: string[]; required?: boolean; mostrarSe?: { campo: string; valor: string } }
  const campos = ((data!.schema as { rows: { fields: Campo[] }[] }).rows).flatMap(r => r.fields)
  const alergia = campos.find(c => c.id === 'allergies')!
  expect(alergia.type).toBe('radio')
  expect(alergia.options).toEqual(['Sim', 'Não'])
  expect(alergia.required).toBe(true)
  const detalhe = campos.find(c => c.id === 'allergiesDetalhe')!
  expect(detalhe.type).toBe('textarea')
  expect(detalhe.mostrarSe).toEqual({ campo: 'allergies', valor: 'Sim' })
  const gestacao = campos.find(c => c.id === 'isPregnantOrBreastfeeding')!
  expect(gestacao.options).toContain('Não se aplica')
})

test('o "Sim" digitado vira faixa na hora, sobrevive ao recarregar, e o "Não" tira a faixa', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${atendimento}`)
    const anamnese = p.locator('[data-anamnese-geral]').first()
    const pergunta = anamnese.locator('[data-campo="allergies"]')
    await expect(pergunta).toBeVisible()
    // Sem resposta, nem o detalhe nem a faixa.
    await expect(anamnese.locator('[data-campo="allergiesDetalhe"]')).toHaveCount(0)
    await expect(p.locator('[data-alerta-alergia]')).toHaveCount(0)

    await pergunta.getByLabel('Sim').check()
    const detalhe = anamnese.locator('[data-campo="allergiesDetalhe"] textarea')
    await expect(detalhe).toBeVisible()
    await expect(p.locator('[data-alerta-alergia]'), 'o Sim já avisa, antes do detalhe').toContainText('Alergia')
    await detalhe.fill(`Dipirona ${marca}`)
    await expect(p.locator('[data-alerta-alergia]'), 'a faixa sai do que está NA TELA, sem salvar').toContainText(`Dipirona ${marca}`)

    await p.reload()
    await expect(p.locator('[data-alerta-alergia]'), 'o rascunho guarda a anamnese digitada').toContainText(`Dipirona ${marca}`)
    await expect(p.locator('[data-anamnese-geral] [data-campo="allergiesDetalhe"] textarea').first()).toHaveValue(`Dipirona ${marca}`)

    await p.locator('[data-anamnese-geral] [data-campo="allergies"]').first().getByLabel('Não').check()
    await expect(p.locator('[data-alerta-alergia]')).toHaveCount(0)
    await expect(p.locator('[data-anamnese-geral] [data-campo="allergiesDetalhe"]')).toHaveCount(0)
  })
})

test('o "Sim" sem o detalhe barra o Finalizar, junto do campo', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${atendimento}`)
    const anamnese = p.locator('[data-anamnese-geral]').first()
    // As outras obrigatórias respondidas; a alergia em Sim, sem dizer qual.
    await anamnese.locator('[data-campo="isPregnantOrBreastfeeding"]').getByLabel('Não se aplica').check()
    await anamnese.locator('[data-campo="medications"] textarea').fill('Nenhum [e2e]')
    await anamnese.locator('[data-campo="healthConditions"] textarea').fill('Nenhuma [e2e]')
    await anamnese.locator('[data-campo="allergies"]').getByLabel('Sim').check()
    await anamnese.locator('[data-campo="allergiesDetalhe"] textarea').fill('')
    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    await expect(anamnese.locator('[data-campo="allergiesDetalhe"] [role="alert"]')).toContainText('Quais alergias?')
    await expect(p.getByRole('button', { name: 'Confirmar conclusão' })).toHaveCount(0)
  })
})
