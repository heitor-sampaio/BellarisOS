import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { subirOpenaiFalsa, type OpenaiFalsa } from './apoio/openai-falsa'
import { redeDoCopilot, contraAFalsa, comSessao, esperarResposta, type RedeDoCopilot } from './apoio/copilot'

/**
 * A MÍDIA do Copilot (fase 6, 2026-10-08): voz, imagem e documento.
 *  - a voz é transcrita (a tela mostra o que foi entendido) e vai ao modelo como texto;
 *  - a imagem vai como imagem, o PDF como arquivo, o txt como texto;
 *  - o tipo é pelo CONTEÚDO (um texto chamado .png é recusado), com limite de tamanho;
 *  - a foto grande do celular é REDUZIDA no navegador antes de subir;
 *  - o arquivo não é guardado: a conversa fica só com o nome e o tipo.
 */
test.skip(!contraAFalsa(), 'só contra o build: o servidor precisa da OpenAI falsa')
test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
let falsa: OpenaiFalsa
let rede: RedeDoCopilot

// Um PNG 1×1 e um "PDF" mínimo, de verdade nos primeiros bytes.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')
// O começo de um webm (EBML) — o servidor reconhece o áudio pelo conteúdo.
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(2000, 1)])

const entradaDoUltimoPedido = () => {
  const itens = falsa.respostas().at(-1)?.corpo.input ?? []
  const ultimo = itens.at(-1) as { content?: { type: string; text?: string; image_url?: string; file_data?: string; filename?: string }[] }
  return ultimo?.content ?? []
}

async function postar(p: import('@playwright/test').Page, campos: Record<string, string | { name: string; mimeType: string; buffer: Buffer }>) {
  return p.request.post('/api/copilot', { headers: { origin: process.env.E2E_BASE_URL! }, multipart: { pagina: '/admin/dashboard', ...campos } })
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  falsa = await subirOpenaiFalsa()
  rede = await redeDoCopilot(`mid${marca}`)
})
test.afterAll(async () => {
  await rede?.limpar()
  await falsa?.fechar()
})
test.beforeEach(() => falsa.zerar())

test('a imagem, anexada pela tela, chega ao modelo como imagem; a conversa guarda só o nome', async ({ browser }) => {
  falsa.roteiro.push({ texto: 'Vi a imagem.' })
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/dashboard')
    await p.getByRole('button', { name: 'Copilot', exact: true }).click()
    const painel = p.getByRole('dialog', { name: 'Copilot' })
    await painel.getByLabel('Arquivo para o Copilot').setInputFiles({ name: 'ficha.png', mimeType: 'image/png', buffer: PNG })
    await expect(painel.getByText('ficha.png')).toBeVisible()
    await painel.getByRole('textbox', { name: 'Mensagem para o Copilot' }).fill('o que tem nesta foto?')
    await painel.getByRole('button', { name: 'Enviar' }).click()
    await esperarResposta(p)
    await expect(painel.locator('.copilot-corpo').getByText('Vi a imagem.')).toBeVisible()
  })
  const imagem = entradaDoUltimoPedido().find(c => c.type === 'input_image')
  expect(imagem?.image_url).toBe(`data:image/png;base64,${PNG.toString('base64')}`)
  const { data: msg } = await banco().from('copilot_mensagens').select('conteudo').eq('tenant_id', rede.outra.tenantId).eq('papel', 'user').single()
  expect(msg!.conteudo).toMatchObject({ texto: 'o que tem nesta foto?', anexos: [{ nome: 'ficha.png', tipo: 'imagem' }] })
  expect(JSON.stringify(msg!.conteudo)).not.toContain(PNG.toString('base64'))
})

test('a voz é transcrita e vai como texto; o PDF vai como arquivo; o txt, como texto', async ({ browser }) => {
  falsa.transcricao = 'Quais os horários livres amanhã?'
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/dashboard')
    const voz = await postar(p, { anexos: { name: 'audio.webm', mimeType: 'audio/webm', buffer: WEBM } })
    expect(voz.status()).toBe(200)
    expect(await voz.text()).toContain('"tipo":"transcricao","texto":"Quais os horários livres amanhã?"')
    expect(falsa.pedidos.filter(x => x.caminho.endsWith('/audio/transcriptions'))).toHaveLength(1)
    expect(entradaDoUltimoPedido().find(c => c.type === 'input_text')?.text).toContain('Quais os horários livres amanhã?')

    falsa.zerar()
    const pdf = await postar(p, { texto: 'resuma', anexos: { name: 'contrato.pdf', mimeType: 'application/pdf', buffer: PDF } })
    expect(pdf.status()).toBe(200)
    const arquivo = entradaDoUltimoPedido().find(c => c.type === 'input_file')
    expect(arquivo?.filename).toBe('contrato.pdf')
    expect(arquivo?.file_data).toBe(`data:application/pdf;base64,${PDF.toString('base64')}`)

    falsa.zerar()
    const txt = await postar(p, { texto: 'leia', anexos: { name: 'lista.txt', mimeType: 'text/plain', buffer: Buffer.from('Maria 4899999\nJoão 4888888') } })
    expect(txt.status()).toBe(200)
    expect(entradaDoUltimoPedido().map(c => c.text ?? '').join('\n')).toContain('Maria 4899999')
  })
})

test('o tipo é pelo conteúdo e há limite: texto chamado .png, docx e imagem grande demais são recusados', async ({ browser }) => {
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/dashboard')
    const disfarcado = await postar(p, { anexos: { name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from('<script>não sou imagem</script>') } })
    expect(disfarcado.status()).toBe(400)
    const docx = await postar(p, { anexos: { name: 'ficha.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK\x03\x04conteudo') } })
    expect(docx.status()).toBe(400)
    expect((await docx.json()).error).toContain('PDF')
    const grande = await postar(p, { anexos: { name: 'grande.png', mimeType: 'image/png', buffer: Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(6 * 1024 * 1024)]) } })
    expect(grande.status()).toBe(400)
    expect((await grande.json()).error).toContain('5 MB')
  })
  expect(falsa.respostas()).toHaveLength(0)
})

test('a foto grande do celular é reduzida no navegador antes de subir', async ({ browser }) => {
  falsa.roteiro.push({ texto: 'Recebi a foto.' })
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/dashboard')
    // Uma "foto" de 2600×2000 com ruído aleatório (não comprime): bem mais de 5 MB em PNG.
    const grande = await p.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 2600; c.height = 2000
      const g = c.getContext('2d')!
      const img = g.createImageData(2600, 2000)
      for (let i = 0; i < img.data.length; i++) img.data[i] = (i % 4 === 3) ? 255 : Math.floor(Math.random() * 256)
      g.putImageData(img, 0, 0)
      // Em base64 (o dataURL): devolver um array de ~20 milhões de números ao
      // Node levava quase o tempo inteiro do teste.
      return c.toDataURL('image/png').split(',')[1]!
    })
    const bytes = Buffer.from(grande, 'base64')
    expect(bytes.length).toBeGreaterThan(5 * 1024 * 1024)
    await p.getByRole('button', { name: 'Copilot', exact: true }).click()
    const painel = p.getByRole('dialog', { name: 'Copilot' })
    await painel.getByLabel('Arquivo para o Copilot').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: bytes })
    // Reduzida: o anexo vira um .jpg antes de subir.
    await expect(painel.locator('.copilot-anexos-pendentes').getByText('foto.jpg')).toBeVisible({ timeout: 20_000 })
    await painel.getByRole('textbox', { name: 'Mensagem para o Copilot' }).fill('veja a foto')
    await painel.getByRole('button', { name: 'Enviar' }).click()
    await esperarResposta(p)
    await expect(painel.locator('.copilot-corpo').getByText('Recebi a foto.')).toBeVisible()
  })
  const imagem = entradaDoUltimoPedido().find(c => c.type === 'input_image')
  expect(imagem?.image_url).toMatch(/^data:image\/jpeg;base64,/)
  expect(Buffer.from(imagem!.image_url!.split(',')[1]!, 'base64').length).toBeLessThan(5 * 1024 * 1024)
})
