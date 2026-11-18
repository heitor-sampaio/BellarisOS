import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * As correções da auditoria das regras (2026-11-18), a parte dos documentos —
 * o que a fala do Heitor diz, e não o que o Claude tinha decidido por cima:
 *
 * - PC2 (13/11): "ele assina pelo pacote. o ideal era funcionar como no plano
 *   de tratamento"; do plano: "primeiro colhe assinatura, depois paga". O
 *   pacote com o contrato de pacote ativo assina ANTES do dinheiro.
 * - DC4 ("concordo", 13/11): "o do pacote e o do plano, na venda/na criação" —
 *   os documentos do plano nascem quando o plano é criado, não no aceite.
 * - Decisão 2 da 7ª (05/11): "termo assinado pelo responsável (avisar, não
 *   barrar)" — a menor sem responsável não deixa o termo em "faltam dados".
 * - PC7 (13/11): "qualquer documento que tenha sido criado ou anexado no
 *   sistema" — "Outros documentos" oferece todos.
 */

const WEB = join(__dirname, '..')
const RAIZ = join(WEB, '..', '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')
const migration = (prefixo: string) => {
  const pasta = join(RAIZ, 'supabase', 'migrations')
  const nome = readdirSync(pasta).find(n => n.startsWith(prefixo))
  return nome ? readFileSync(join(pasta, nome), 'utf8') : ''
}

describe('PC2: o pacote assina antes de pagar, como o plano', () => {
  const pix = { forma: 'AVISTA', metodo: 'PIX' }
  const credito = { forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: 3 }
  const unidade = 'u1'
  it('sem contrato de pacote ativo (ou dispensado), a venda segue', async () => {
    const { situacaoDoContratoDaVenda } = await import('@/lib/documentos/contrato-da-venda')
    expect(situacaoDoContratoDaVenda(null, pix, unidade)).toBe('VENDE')
    expect(situacaoDoContratoDaVenda({ status: 'DISPENSADO', payment_snapshot: null, branch_id: unidade, citaPagamento: true }, pix, unidade)).toBe('VENDE')
  })
  it('o contrato aberto (a assinar ou com faltam dados) segura o dinheiro', async () => {
    const { situacaoDoContratoDaVenda } = await import('@/lib/documentos/contrato-da-venda')
    for (const status of ['A_GERAR', 'PENDENTE', 'INCOMPLETO']) {
      expect(situacaoDoContratoDaVenda({ status, payment_snapshot: pix, branch_id: unidade, citaPagamento: true }, pix, unidade)).toBe('ASSINAR')
    }
  })
  it('assinado com ESTE pagamento, vende; com outro (ou em outra unidade), pede um contrato novo', async () => {
    const { situacaoDoContratoDaVenda } = await import('@/lib/documentos/contrato-da-venda')
    expect(situacaoDoContratoDaVenda({ status: 'ASSINADO', payment_snapshot: pix, branch_id: unidade, citaPagamento: true }, pix, unidade)).toBe('VENDE')
    expect(situacaoDoContratoDaVenda({ status: 'ASSINADO', payment_snapshot: credito, branch_id: unidade, citaPagamento: true }, pix, unidade)).toBe('SUBSTITUIR')
    expect(situacaoDoContratoDaVenda({ status: 'ASSINADO', payment_snapshot: pix, branch_id: 'u2', citaPagamento: true }, pix, unidade)).toBe('SUBSTITUIR')
    expect(situacaoDoContratoDaVenda({ status: 'ASSINADO', payment_snapshot: credito, branch_id: unidade, citaPagamento: false }, pix, unidade),
      'o contrato que não cita o pagamento vale para qualquer forma').toBe('VENDE')
  })
  it('a venda confere o contrato ANTES de gravar o dinheiro', () => {
    const f = ler('actions/pacotes.ts')
    const confere = f.indexOf('contratoDaVendaDoPacote(')
    const grava = f.indexOf("admin.rpc('pacote_vender_com_equipe'")
    expect(confere).toBeGreaterThan(0)
    expect(confere).toBeLessThan(grava)
    expect(f).toContain('contratoParaAssinar')
  })
  it('o banco: o contrato da venda nasce sem o pacote vendido, e a venda o adota', () => {
    const m = migration('20261124000101')
    expect(m).toContain('service_package_id')
    expect(m).toContain('function public.documento_contrato_da_venda_do_pacote')
    expect(m).toMatch(/purchased_at = now\(\)/)
    expect(m).toContain("notify pgrst, 'reload schema'")
  })
  it('a tela da venda leva a colher antes de vender', () => {
    const f = ler('components/shared/vender-pacote.tsx')
    expect(f).toContain('data-contrato-antes-de-vender')
    expect(f).toContain('TelaDeAssinatura')
  })
})

describe('DC4: os documentos do plano nascem na criação', () => {
  it('salvar o plano (o primeiro "Salvar plano" e os seguintes) emite os termos e os outros documentos', () => {
    const f = ler('actions/treatment-plans.ts')
    expect((f.match(/emitirDocumentosDoPlano\(/g) ?? []).length).toBeGreaterThanOrEqual(5)
    expect(ler('lib/documentos/plano.ts')).toContain('export async function emitirDocumentosDoPlano(')
  })
  it('o banco: só plano com cliente e aberto emite; o cancelado e o recusado cancelam os abertos', () => {
    const m = migration('20261124000101')
    expect(m).toContain('function public.documentos_emitir_do_plano')
    expect(m).toMatch(/tp\.client_id is not null/)
    expect(m).toContain("'Plano cancelado'")
  })
})

describe('decisão 2 da 7ª: a menor sem responsável — avisar, não barrar', () => {
  it('o nome e o CPF do responsável não deixam o termo da menor em "faltam dados"', async () => {
    const { variavelObrigatoria } = await import('@/lib/documentos/variaveis')
    // A régua não depende mais da idade: na menor também o responsável é opcional.
    expect(variavelObrigatoria('responsavel.nome')).toBe(false)
    expect(variavelObrigatoria('responsavel.cpf')).toBe(false)
    expect(variavelObrigatoria('cliente.nome'), 'as outras seguem o catálogo').toBe(true)
    expect(ler('lib/documentos/renderizar.ts')).not.toContain('variavelObrigatoria(v, { menor })')
  })
})

describe('PC7: "Outros documentos" oferece todo documento criado ou anexado', () => {
  const lista = [
    { id: 'd1', nome: 'Autorização de imagem', tipo: 'DOCUMENTO', ativo: true },
    { id: 't1', nome: 'Termo da toxina', tipo: 'TERMO', ativo: true },
    { id: 'k1', nome: 'Contrato avulso', tipo: 'CONTRATO', ativo: true },
    { id: 'x1', nome: 'Termo antigo', tipo: 'TERMO', ativo: false },
  ]
  it('sem termo nem contrato escolhidos, todos os ativos', async () => {
    const { outrosDocumentosOferecidos } = await import('@/lib/documentos/outros-do-procedimento')
    expect(outrosDocumentosOferecidos(lista, { termo: '', contrato: '', marcados: [] }).map(o => o.id)).toEqual(['d1', 't1', 'k1'])
  })
})
