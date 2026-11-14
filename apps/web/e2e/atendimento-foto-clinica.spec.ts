import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A30 da simulação de 2026-10-27: não havia anexo de foto na tela do
 * atendimento. A Lívia anexou a foto por Clientes → Documentos → "Foto
 * clínica", fora do fluxo e sem ligação com o atendimento.
 *
 * Agora a tela do atendimento tem "Fotos do atendimento": o MESMO upload dos
 * Documentos (bucket privado, categoria "Foto clínica", a mesma recusa do
 * anexo clínico), ligado ao agendamento (`client_documents.appointment_id`).
 * Só para quem vê o prontuário deste atendimento.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
let cliente = ''
let outraCliente = ''
let atendimento = ''
let atendimentoDaOutra = ''
// PNG de 1×1.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const fotosDo = async (appointmentId: string) => (await db().from('client_documents')
  .select('id, category, client_id').eq('appointment_id', appointmentId)).data ?? []

test.beforeAll(async () => {
  rede = await criarOutraRede(`fc${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  profissional = await criarMembro(`fcp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
  recepcao = await criarMembro(`fcr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
  cliente = await rede.criarCliente('Mariana')
  outraCliente = await rede.criarCliente('Outra')
  const base = { branch_id: rede.branchId, procedure_id: rede.procedureId, professional_id: profissional.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString() }
  const { data, error } = await db().from('appointments').insert([
    { ...base, client_id: cliente },
    { ...base, client_id: outraCliente, scheduled_at: new Date(Date.now() - 90 * 60_000).toISOString() },
  ]).select('id, client_id')
  expect(error).toBeNull()
  atendimento = data!.find(a => a.client_id === cliente)!.id
  atendimentoDaOutra = data!.find(a => a.client_id === outraCliente)!.id
})
test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await profissional?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

test.describe.serial('a foto clínica pela tela do atendimento', () => {
  test('a profissional anexa a foto ali, e ela fica ligada ao atendimento', async ({ browser }) => {
    await como(profissional!, browser, async p => {
      await p.goto(`/${slug}/agenda/${atendimento}`)
      const fotos = p.locator('[data-fotos-do-atendimento]')
      await fotos.getByRole('button', { name: 'Anexar foto' }).click()
      await fotos.locator('input[name="file"]').setInputFiles({ name: 'antes.png', mimeType: 'image/png', buffer: PNG })
      await fotos.getByRole('button', { name: 'Anexar foto' }).last().click()
      await expect.poll(async () => (await fotosDo(atendimento)).length).toBe(1)
      await expect(fotos.getByRole('img', { name: /Foto clínica/ }), 'a foto aparece na tela do atendimento').toBeVisible()
      // A33 da 6ª simulação ("a miniatura aparece em branco logo depois de anexar"): a imagem CARREGA
      // logo após anexar — o branco era o arquivo de teste do robô (10 px; aqui, 1×1 transparente).
      await expect.poll(() => fotos.getByRole('img', { name: /Foto clínica/ }).first()
        .evaluate(e => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0), { message: 'a miniatura carregou' }).toBe(true)
    })
    const anexadas = await fotosDo(atendimento)
    expect(anexadas).toHaveLength(1)
    expect(anexadas[0]).toMatchObject({ category: 'foto_clinica', client_id: cliente })
  })

  // Sobra da frente 8 (2026-10-27): na aba Documentos a foto aparecia sem
  // dizer de qual atendimento veio. A linha diz o dia e o procedimento, com o
  // link para a tela do atendimento.
  // PR1b (2026-11-14): o anexo clínico saiu da aba Documentos e mora no
  // Prontuário. A foto de um atendimento ainda aberto (sem registro) fica em
  // "Anexos clínicos", com o caminho ao atendimento.
  test('na aba Prontuário da ficha, a foto diz de qual atendimento veio', async ({ browser }) => {
    const { data: ag } = await db().from('appointments').select('scheduled_at, procedures(name)').eq('id', atendimento).single()
    const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
      .format(new Date(ag!.scheduled_at as string))
    const procedimento = (ag!.procedures as unknown as { name: string }).name
    await como(profissional!, browser, async p => {
      await p.goto(`/${slug}/clients/${cliente}?aba=fichas`)
      const origem = p.locator('[data-anexos-clinicos] [data-documento-atendimento]')
      await expect(origem, 'a linha da foto diz o atendimento').toHaveText(`Atendimento de ${dia} · ${procedimento}`)
      await expect(origem).toHaveAttribute('href', `/${slug}/agenda/${atendimento}`)
    })
  })

  // J-41 e J-36 (ajustes J, 2026-10-30): o nome dado à foto era ignorado — a
  // miniatura mostrava o nome do ARQUIVO — e a foto não entrava no histórico
  // do atendimento. O histórico diz só "Foto clínica anexada": o título é
  // escrito pela profissional e pode dizer o que a foto mostra, e o histórico
  // aparece para quem tem só a agenda.
  const TITULO = `Antes — região malar ${marca}`
  test('o título dado à foto aparece no cartão e no Prontuário, e o histórico registra a foto sem o título', async ({ browser }) => {
    const antes = (await fotosDo(atendimento)).length
    await como(profissional!, browser, async p => {
      await p.goto(`/${slug}/agenda/${atendimento}`)
      const fotos = p.locator('[data-fotos-do-atendimento]')
      await fotos.getByRole('button', { name: 'Anexar foto' }).click()
      await fotos.locator('input[name="name"]').fill(TITULO)
      await fotos.locator('input[name="file"]').setInputFiles({ name: 'IMG_0001.png', mimeType: 'image/png', buffer: PNG })
      await fotos.getByRole('button', { name: 'Anexar foto' }).last().click()
      await expect.poll(async () => (await fotosDo(atendimento)).length).toBe(antes + 1)
      await expect(fotos.locator('[data-titulo-da-foto]', { hasText: TITULO }), 'o cartão mostra o título, não o nome do arquivo').toBeVisible()
      await expect(fotos.locator('[data-titulo-da-foto]', { hasText: 'IMG_0001.png' })).toHaveCount(0)
      await p.reload()
      const historico = p.locator('[data-historico-do-atendimento]')
      await expect(historico.getByText('Foto clínica anexada').first(), 'a foto entra no histórico').toBeVisible()
      await expect(historico, 'o histórico não repete o título (pode ser dado clínico)').not.toContainText(TITULO)
      await p.goto(`/${slug}/clients/${cliente}?aba=fichas`)
      await expect(p.locator('[data-anexo-clinico]').getByText(TITULO, { exact: true }), 'o Prontuário mostra o título').toBeVisible()
    })
    const { data: linhas } = await db().from('appointment_history').select('action, description').eq('appointment_id', atendimento)
    const daFoto = (linhas ?? []).filter(l => l.action === 'FOTO_CLINICA')
    expect(daFoto.length, 'uma linha por foto anexada').toBe((await fotosDo(atendimento)).length)
    for (const l of daFoto) expect(l.description).toBe('Foto clínica anexada')
    // Quem tem só a agenda vê o histórico — e nada do título.
    await como(recepcao!, browser, async p => {
      await p.goto(`/${slug}/agenda/${atendimento}`)
      await expect(p.locator('[data-historico-do-atendimento]').getByText('Foto clínica anexada').first()).toBeVisible()
      await expect(p.locator('body')).not.toContainText(TITULO)
    })
  })

  test('a ligação com o atendimento é conferida: o de outra cliente é recusado', async ({ browser }) => {
    const antesDaRecusa = (await fotosDo(atendimento)).length
    await como(profissional!, browser, async p => {
      await p.goto(`/${slug}/agenda/${atendimento}`)
      const fotos = p.locator('[data-fotos-do-atendimento]')
      await fotos.getByRole('button', { name: 'Anexar foto' }).click()
      await fotos.locator('input[name="file"]').setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: PNG })
      // O id trocado vai no envio (o evento `formdata`), não no `value` do
      // campo escondido: o relógio do atendimento em andamento renderiza a
      // tela a cada segundo, e o React reescreve o `value` do campo — o tique
      // que caía entre a troca e o clique desfazia a troca, e a foto ia para o
      // PRÓPRIO atendimento (F27: a completa de 2026-11-05 viu as 3 fotos).
      await fotos.locator('form').evaluate((form, outro) => {
        form.addEventListener('formdata', e => (e as FormDataEvent).formData.set('appointment_id', outro))
      }, atendimentoDaOutra)
      await fotos.getByRole('button', { name: 'Anexar foto' }).last().click()
      await expect(fotos.getByText(/não é desta cliente|não encontrado/i)).toBeVisible()
    })
    expect(await fotosDo(atendimentoDaOutra)).toHaveLength(0)
    expect(await fotosDo(atendimento), 'nem no atendimento da tela').toHaveLength(antesDaRecusa)
  })

  test('sem o prontuário, a tela do atendimento não mostra nem anexa foto', async ({ browser }) => {
    await como(recepcao!, browser, async p => {
      await p.goto(`/${slug}/agenda/${atendimento}`)
      await expect(p.getByRole('heading', { name: /Agendamento|Atendimento/ }).first().or(p.locator('main'))).toBeVisible()
      await expect(p.locator('[data-fotos-do-atendimento]')).toHaveCount(0)
    })
  })
})

test.describe.serial('a foto do atendimento: ver, enviar à cliente e apagar com rastro', () => {
  let foto = ''
  const primeiraFoto = async () => {
    const { data, error } = await db().from('client_documents').select('id').eq('appointment_id', atendimento).is('apagado_em', null)
      .order('created_at').limit(1).maybeSingle<{ id: string }>()
    expect(error).toBeNull()
    return data?.id ?? null
  }
  test.beforeAll(async ({ browser }) => {
    // Um teste de cima que falha leva o worker junto, e o novo refaz o
    // beforeAll do arquivo: rede e atendimento NOVOS, sem foto (F27 — era o
    // `null.id` que vinha atrás de toda falha de cima). Aí a foto se anexa
    // aqui, pela mesma tela.
    if (!(await primeiraFoto())) {
      await como(profissional!, browser, async p => {
        await p.goto(`/${slug}/agenda/${atendimento}`)
        const fotos = p.locator('[data-fotos-do-atendimento]')
        await fotos.getByRole('button', { name: 'Anexar foto' }).click()
        await fotos.locator('input[name="file"]').setInputFiles({ name: 'antes.png', mimeType: 'image/png', buffer: PNG })
        await fotos.getByRole('button', { name: 'Anexar foto' }).last().click()
        await expect.poll(primeiraFoto).not.toBeNull()
      })
    }
    foto = (await primeiraFoto())!
  })

  // A37 da 5ª simulação: a foto do atendimento não tinha "Enviar à cliente", e
  // clicar na miniatura não fazia nada.
  test('A37: a miniatura abre a foto grande, e "Enviar à cliente" a manda ao app (e "Tirar do app" desfaz)', async ({ browser }) => {
    await como(profissional!, browser, async p => {
      await p.goto(`/${slug}/agenda/${atendimento}`)
      const cartao = p.locator(`[data-foto-do-atendimento="${foto}"]`)
      await cartao.getByRole('button', { name: /^Ver / }).click()
      const janela = p.getByRole('dialog')
      await expect(janela.getByRole('img')).toBeVisible()
      await janela.getByRole('button', { name: 'Fechar' }).click()
      await expect(janela).toHaveCount(0)

      await expect(cartao.getByText('Só a equipe vê')).toBeVisible()
      await cartao.getByRole('button', { name: 'Enviar à cliente' }).click()
      await expect.poll(async () => (await db().from('client_documents').select('enviado_em').eq('id', foto).single()).data?.enviado_em).not.toBeNull()
      await expect(cartao.getByText('No app da cliente')).toBeVisible()
      await cartao.getByRole('button', { name: 'Tirar do app' }).click()
      await expect.poll(async () => (await db().from('client_documents').select('enviado_em').eq('id', foto).single()).data?.enviado_em).toBeNull()
    })
  })

  // atend-02 (revisão do Heitor): apagar a foto clínica não deixava rastro na
  // linha do tempo; só a anexada aparecia.
  test('atend-02: apagar a foto clínica deixa "Foto clínica apagada por <nome>" no histórico do atendimento', async ({ browser }) => {
    const { data: membro } = await db().from('users').select('name').eq('id', profissional!.userId).single<{ name: string }>()
    await como(profissional!, browser, async p => {
      p.on('dialog', d => d.accept())
      await p.goto(`/${slug}/clients/${cliente}?aba=fichas`)
      await p.locator(`[data-anexo-clinico="${foto}"]`).getByTitle('Excluir').click()
      await expect.poll(async () => (await db().from('client_documents').select('apagado_em').eq('id', foto).single()).data?.apagado_em).not.toBeNull()
      await p.goto(`/${slug}/agenda/${atendimento}`)
      await expect(p.locator('[data-historico-do-atendimento]').getByText(`Foto clínica apagada por ${membro!.name}`)).toBeVisible()
    })
    const { data: linhas } = await db().from('appointment_history').select('action, description').eq('appointment_id', atendimento).eq('action', 'FOTO_CLINICA_APAGADA')
    expect(linhas).toEqual([{ action: 'FOTO_CLINICA_APAGADA', description: `Foto clínica apagada por ${membro!.name}` }])
  })
})
