import { test, expect, type Request } from '@playwright/test'
import { banco, tenantId, unidadeQueAtende, PREFIXO } from './apoio/banco'
import { capturarAcao, reenviarAcao } from './apoio/acao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarClientes } from './apoio/limpeza'

/**
 * Prontuário pela tela: anamnese geral, ficha do procedimento com foto, e
 * documentos do cliente — e nenhum deles escreve em outra rede.
 *
 * Até 2026-09-27 nada disto tinha teste, e é o dado mais sensível do sistema.
 * A varredura achou três furos: a anamnese conferia a unidade e não o cliente;
 * o documento, idem; e a foto subia ANTES de conferir o agendamento. Cada um é
 * provado aqui com o reenvio da chamada legítima apontando para a outra rede.
 *
 * Os arquivos de teste são SVG e TXT de propósito: o reenvio troca o id no
 * corpo da requisição como texto, e um binário se corromperia no caminho.
 */

const marca = Date.now().toString(36)
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2"/></svg>')

interface Cenario {
  tenant: string; unidade: string; cliente: string; appt: string
  procedimento: string; ficha: string; plano: string
  clienteAlheio: string; apptAlheio: string
}

test.describe.serial('prontuário', () => {
  let c: Cenario | null = null
  let outra: OutraRede | null = null
  const chamadas: { anamnese?: Request } = {}

  test.beforeAll(async () => {
    const db = banco()
    const unidade = await unidadeQueAtende()
    test.skip(!unidade, 'nenhuma unidade com profissional')
    const tenant = await tenantId()
    const ins = async (tabela: string, linha: Record<string, unknown>) => {
      const { data, error } = await db.from(tabela).insert(linha).select('id').single<{ id: string }>()
      expect(error, `criar ${tabela}`).toBeNull()
      return data!.id
    }
    const { data: prof } = await db.from('users').select('id')
      .eq('branch_id', unidade!.id).eq('provides_services', true).eq('is_active', true).limit(1).single<{ id: string }>()

    const ficha = await ins('forms', {
      tenant_id: tenant, name: `${PREFIXO} Ficha ${marca}`, is_active: true,
      schema: { rows: [
        { id: 'r1', fields: [{ id: 'regiao', type: 'text', label: `Região ${marca}` }] },
        { id: 'r2', fields: [{ id: 'foto', type: 'photo', label: `Foto ${marca}` }] },
      ] },
    })
    const procedimento = await ins('procedures', { tenant_id: tenant, name: `${PREFIXO} Proc prontuario ${marca}`, category: 'e2e', duration_min: 30, price: 0, form_id: ficha })
    const cliente = await ins('clients', { tenant_id: tenant, branch_id: unidade!.id, name: `${PREFIXO} Cliente prontuario ${marca}`, phone: '5548' + String(Date.now()).slice(-9) })
    await db.from('loyalty_accounts').upsert({ client_id: cliente }, { onConflict: 'client_id' })
    const appt = await ins('appointments', {
      branch_id: unidade!.id, client_id: cliente, procedure_id: procedimento, professional_id: prof!.id,
      scheduled_at: new Date().toISOString(), duration_min: 30, price: 0, status: 'IN_PROGRESS', started_at: new Date().toISOString(),
    })
    // A ficha aparece no atendimento quando a avaliação já gerou um plano.
    const plano = await ins('treatment_plans', {
      branch_id: unidade!.id, professional_id: prof!.id, client_id: cliente,
      evaluation_appointment_id: appt, status: 'ACCEPTED', name: `${PREFIXO} Plano prontuario ${marca}`,
    })

    outra = await criarOutraRede(`pr${marca}`)
    const clienteAlheio = await outra.criarCliente('Cliente alheio prontuario')
    const apptAlheio = await ins('appointments', {
      branch_id: outra.branchId, client_id: clienteAlheio, procedure_id: outra.procedureId, professional_id: outra.professionalId,
      scheduled_at: new Date().toISOString(), duration_min: 30, price: 0, status: 'SCHEDULED',
    })
    c = { tenant, unidade: unidade!.id, cliente, appt, procedimento, ficha, plano, clienteAlheio, apptAlheio }
  })

  test.afterAll(async () => {
    if (!c) return
    const db = banco()
    // A pasta do agendamento alheio também: se a trava falhar, a foto invasora
    // cai ali — e nenhuma outra limpeza a alcança.
    for (const pasta of [`${c.tenant}/${c.appt}`, `${c.tenant}/${c.apptAlheio}`]) {
      const { data: fotos } = await db.storage.from('anamnesis-photos').list(pasta)
      if (fotos?.length) await db.storage.from('anamnesis-photos').remove(fotos.map(f => `${pasta}/${f.name}`))
    }
    const falhas = await apagarClientes([c.cliente])
    await db.from('procedures').delete().eq('id', c.procedimento)
    await db.from('forms').delete().eq('id', c.ficha)
    await outra?.limpar()
    expect(falhas, 'a limpeza tem de apagar tudo').toEqual([])
  })

  test('anamnese geral e ficha do procedimento, com foto, pela tela do atendimento', async ({ page }) => {
    const db = banco()
    await page.goto(`/admin/agenda/${c!.appt}`)

    // -- Anamnese geral (nasce aberta: o cliente ainda não tem) ----------------
    await page.locator('select[name="skinType"]').selectOption({ index: 1 })
    await page.locator('textarea[name="allergies"]').fill(`${PREFIXO} dipirona`)
    const anamnese = capturarAcao(page, corpo => corpo.includes(c!.cliente) && corpo.includes('dipirona'))
    await page.getByRole('button', { name: 'Salvar anamnese' }).click()
    chamadas.anamnese = await anamnese
    await expect.poll(async () => {
      const { data } = await db.from('medical_records').select('general_anamnesis').eq('client_id', c!.cliente).maybeSingle()
      return (data?.general_anamnesis as { allergies?: string } | null)?.allergies ?? null
    }, { message: 'a anamnese geral é gravada no prontuário do cliente' }).toBe(`${PREFIXO} dipirona`)

    // -- Ficha do procedimento --------------------------------------------------
    const campo = page.locator('div').filter({ has: page.locator('label', { hasText: `Região ${marca}` }) }).locator('input.field').last()
    await campo.fill('Face')

    await page.locator('div').filter({ has: page.locator('label', { hasText: `Foto ${marca}` }) })
      .locator('input[type="file"]').last()
      .setInputFiles({ name: 'antes.svg', mimeType: 'image/svg+xml', buffer: SVG })
    await expect(page.getByAltText('Foto'), 'a prévia da foto aparece').toBeVisible()

    await page.getByRole('button', { name: 'Salvar ficha' }).click()
    await expect(page.getByText('Salvo', { exact: true }).first()).toBeVisible()

    const { data: entrada } = await db.from('medical_record_entries').select('form_data').eq('appointment_id', c!.appt).single()
    const respostas = (entrada!.form_data as { ficha: { answers: Record<string, string> } }).ficha.answers
    expect(respostas.regiao).toBe('Face')
    expect(respostas.foto, 'a foto fica como CAMINHO no bucket privado, dentro da rede').toMatch(new RegExp(`^${c!.tenant}/${c!.appt}/`))
    const { data: arquivos } = await db.storage.from('anamnesis-photos').list(`${c!.tenant}/${c!.appt}`)
    expect(arquivos?.length, 'o arquivo subiu').toBe(1)

    const { data: eventos } = await db.from('domain_events').select('nome').eq('entidade_id', c!.appt)
    expect((eventos ?? []).map(e => e.nome)).toEqual(expect.arrayContaining(['anamnese.respondida', 'foto.enviada']))
  })

  test('documentos do cliente: anexar, baixar e excluir', async ({ page }) => {
    const db = banco()
    await page.goto(`/admin/clients/${c!.cliente}?aba=documentos`)
    await page.getByRole('button', { name: /Adicionar (primeiro )?documento/ }).first().click()
    await page.locator('input[name="name"]').fill(`${PREFIXO} Termo ${marca}`)
    await page.locator('select[name="category"]').selectOption('termo_consentimento')
    await page.locator('input[name="file"]').setInputFiles({ name: 'termo.txt', mimeType: 'text/plain', buffer: Buffer.from('termo e2e') })
    await page.getByRole('button', { name: 'Anexar documento' }).click()

    await expect.poll(async () => {
      const { data } = await db.from('client_documents').select('file_path').eq('client_id', c!.cliente)
      return data?.length ?? 0
    }, { message: 'o documento é gravado' }).toBe(1)
    const baixar = page.getByTitle('Baixar').first()
    await expect(baixar).toBeVisible()
    expect(await baixar.getAttribute('href'), 'baixa por link assinado do bucket privado').toMatch(/client-documents.*token=/)

    page.once('dialog', d => d.accept())
    await page.getByTitle('Excluir').first().click()
    await expect.poll(async () => {
      const { data } = await db.from('client_documents').select('id').eq('client_id', c!.cliente)
      return data?.length ?? 0
    }, { message: 'excluir tira a linha' }).toBe(0)
    const { data: restos } = await db.storage.from('client-documents').list(`${c!.unidade}/${c!.cliente}`)
    expect(restos ?? [], 'e o arquivo').toHaveLength(0)
  })

  // Com ARQUIVO no corpo, o Playwright não expõe a requisição para reenvio
  // (`postDataBuffer` vem vazio). Então o ataque é feito como no DevTools:
  // adultera-se o que o navegador manda, antes de sair.
  test('anamnese, foto e documento apontados para outra rede não escrevem nada lá', async ({ page, browser }) => {
    const db = banco()
    await page.goto(`/admin/clients/${c!.cliente}`)

    // Anamnese: a chamada legítima, reenviada com o cliente de outra rede.
    await reenviarAcao(page, chamadas.anamnese!, [[c!.cliente, c!.clienteAlheio]])
    const { data: anamneseLa } = await db.from('medical_records').select('general_anamnesis').eq('client_id', c!.clienteAlheio).maybeSingle()
    expect.soft(anamneseLa?.general_anamnesis ?? null, 'anamnese no cliente de outra rede').toBeNull()

    // Foto: o `appointment_id` trocado no FormData, dentro da própria página.
    // A sessão do admin desta rodada (cada metade da completa grava a sua:
    // admin-<grupo>.json) — nunca um caminho fixo.
    const ctx = await browser.newContext({ storageState: test.info().project.use.storageState })
    const aba = await ctx.newPage()
    await aba.addInitScript(([meu, alheio]) => {
      const original = FormData.prototype.append
      FormData.prototype.append = function (this: FormData, k: string, v: string | Blob, n?: string) {
        const valor = k === 'appointment_id' && v === meu ? alheio : v
        const args = n === undefined ? [k, valor] : [k, valor, n]
        return (original as (...a: unknown[]) => void).apply(this, args)
      } as typeof FormData.prototype.append
    }, [c!.appt, c!.apptAlheio])
    try {
      await aba.goto(`/admin/agenda/${c!.appt}`)
      await aba.locator('div').filter({ has: aba.locator('label', { hasText: `Foto ${marca}` }) })
        .locator('input[type="file"]').last()
        .setInputFiles({ name: 'invasora.svg', mimeType: 'image/svg+xml', buffer: SVG })
      await expect.soft(aba.getByText('Agendamento não encontrado.'), 'a foto para outra rede é recusada').toBeVisible()
    } finally {
      await ctx.close()
    }
    const { data: fotosLa } = await db.storage.from('anamnesis-photos').list(`${c!.tenant}/${c!.apptAlheio}`)
    expect.soft(fotosLa ?? [], 'foto subida para o agendamento de outra rede').toHaveLength(0)

    // Documento: o `client_id` escondido do formulário trocado antes de anexar.
    await page.goto(`/admin/clients/${c!.cliente}?aba=documentos`)
    await page.getByRole('button', { name: /Adicionar (primeiro )?documento/ }).first().click()
    await page.locator('input[name="name"]').fill(`${PREFIXO} Invasor ${marca}`)
    await page.locator('input[name="file"]').setInputFiles({ name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('x') })
    await page.locator('input[name="client_id"]').evaluate((el, alheio) => { (el as HTMLInputElement).value = alheio }, c!.clienteAlheio)
    await page.getByRole('button', { name: 'Anexar documento' }).click()
    await expect.soft(page.getByText('Cliente não encontrado.'), 'o documento para outra rede é recusado').toBeVisible()
    const { data: docsLa } = await db.from('client_documents').select('id').eq('client_id', c!.clienteAlheio)
    expect.soft(docsLa ?? [], 'documento na ficha do cliente de outra rede').toHaveLength(0)
  })
})
