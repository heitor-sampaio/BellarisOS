import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ResumoDeDocumento } from '@/lib/documentos/leitura'

/**
 * O pagamento do contrato do procedimento (atendimento avulso) se define onde
 * se colhe a assinatura (DG-01 do catálogo de Documentos: "Quem colhe a
 * assinatura define o pagamento antes dela"; DQ-06: colhe-se na ficha, na tela
 * do atendimento, na janela do agendamento e no PDV; "definir o pagamento do
 * contrato" é colher). D4 da 43ª simulação: a janela do agendamento dizia
 * "Faltam dados: o pagamento do contrato" sem ação, a tela de assinar mandava
 * à ficha ("O pagamento do contrato se define na ficha…") e a tela Documentos
 * oferecia "Completar o cadastro", que não resolve.
 *
 * D7 da 43ª (MQ-15: "o pagamento combinado do contrato não pergunta (a
 * maquininha se escolhe quando o dinheiro entra)"; princípio 3): o combinado
 * do contrato só vira texto — nada se cobra nele, e a maquininha não se
 * escolhe ali. O aviso da taxa ("Não há taxa da maquininha cadastrada para o
 * crédito 2x…") afirmava sobre uma venda que não existe.
 *
 * A13 da 43ª (princípio 3): a janela aberta lia os documentos uma vez só; o
 * cadastro completado (que monta o documento de novo e marca o sinal da
 * agenda) não chegava a ela.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => '/unidade/documentos/d1/assinar' }))
vi.mock('@/actions/documentos', () => ({}))
vi.mock('@/actions/documentos-portal', () => ({}))
vi.mock('@/actions/maquininhas', () => ({}))
vi.mock('@/actions/comissoes', () => ({ maximoDeParcelasNoCrediario: () => new Promise(() => {}) }))
vi.mock('@/actions/credito-na-tela', () => ({}))
vi.mock('@/components/shared/definir-pagamento', () => ({ DefinirPagamento: () => createElement('div', { 'data-definir-pagamento': '' }) }))
vi.mock('@/components/shared/documento-renderizado', () => ({ DocumentoRenderizado: () => null }))
vi.mock('@/components/shared/visualizador-de-pdf', () => ({ VisualizadorDePdf: () => null }))
vi.mock('@/components/shared/signature-pad', () => ({ SignaturePad: () => null }))
vi.mock('@/components/shared/assinar-juntos', () => ({ AssinarJuntos: () => null }))
vi.mock('@/components/shared/tela-cheia-da-cliente', () => ({ TelaCheiaDaCliente: () => null }))
// Uma maquininha só (vale sem perguntar, MQ-15), que cobra por bandeira: sem a
// bandeira, o crédito 2x e o débito não têm a taxa geral.
vi.mock('@/components/shared/use-maquininhas', () => ({
  useMaquininhas: () => ({
    lista: [{ id: 'm1', nome: 'Stone', maximo: 12, taxas: { 'CREDIT_CARD:1': 3 }, cobraPorBandeira: true, porBandeira: { VISA: { taxas: { 'CREDIT_CARD:2': 4, 'DEBIT_CARD:1': 1.5 } } } }],
    mostra: true, quemCadastra: null,
  }),
  maquininhaEscolhida: (lista: { id: string }[] | undefined) => lista?.[0] ?? null,
}))

const raiz = join(__dirname, '..')
const ler = (arquivo: string) => readFileSync(join(raiz, arquivo), 'utf8')

const contrato: ResumoDeDocumento = {
  id: 'd1', titulo: 'Contrato do micro', tipo: 'CONTRATO', origem: 'EDITOR', status: 'INCOMPLETO', exigencia: 'BLOQUEIA',
  momento: 'AGENDAMENTO', faltando: ['Pagamento · Forma de pagamento'], agendamentoId: 'a1', agendamentoEm: '2026-11-28T13:00:00Z',
  procedimento: 'Micro', criadoEm: '2026-11-27T13:00:00Z', assinadoEm: null, canal: null, codigo: null, motivo: null,
  linkAte: null, pedidoNoPortalEm: null, pedePagamento: true, pagamento: null, valorDoAtendimento: 450, vazias: [],
}

describe('D4: a janela do agendamento define o pagamento do contrato', () => {
  it('o contrato que só espera o pagamento: quem colhe o define ali — e "Completar o cadastro" não aparece', async () => {
    const { documentoNaJanela } = await import('@/lib/documentos/na-janela')
    const d = documentoNaJanela(contrato, { colhe: true, completa: true, clienteId: 'c1' })
    expect(d.situacao).toBe('Faltam dados: o pagamento do contrato')
    expect(d.podeDefinirPagamento).toBe(true)
    expect(d.podeCompletar).toBe(false)
    expect(d.valorDoAtendimento).toBe(450)
  })

  it('falta o CPF e o pagamento: os dois caminhos', async () => {
    const { documentoNaJanela } = await import('@/lib/documentos/na-janela')
    const d = documentoNaJanela({ ...contrato, faltando: ['Cliente · CPF', 'Pagamento · Forma de pagamento'] }, { colhe: true, completa: true, clienteId: 'c1' })
    expect(d.situacao).toBe('Faltam dados: CPF, o pagamento do contrato')
    expect(d.podeDefinirPagamento).toBe(true)
    expect(d.podeCompletar).toBe(true)
  })

  it('quem não colhe não ganha o botão (a action recusa: assertColheOsDocumentos)', async () => {
    const { documentoNaJanela } = await import('@/lib/documentos/na-janela')
    expect(documentoNaJanela(contrato, { colhe: false, completa: true, clienteId: 'c1' }).podeDefinirPagamento).toBe(false)
  })

  it('o pagamento já definido, o assinado e o termo: nada a definir', async () => {
    const { documentoNaJanela } = await import('@/lib/documentos/na-janela')
    const quem = { colhe: true, completa: true, clienteId: 'c1' }
    const combinado = { rotulo: 'À vista, no Pix', valor: { forma: 'AVISTA' as const, metodo: 'PIX' }, desconto: 0 }
    expect(documentoNaJanela({ ...contrato, status: 'PENDENTE', faltando: [], pagamento: combinado }, quem).podeDefinirPagamento).toBe(false)
    expect(documentoNaJanela({ ...contrato, status: 'ASSINADO', faltando: [], pagamento: combinado }, quem).podeDefinirPagamento).toBe(false)
    expect(documentoNaJanela({ ...contrato, tipo: 'TERMO', pedePagamento: false, faltando: ['Cliente · CPF'] }, quem).podeDefinirPagamento).toBe(false)
  })

  it('a janela usa a mesma regra e o mesmo formulário da ficha (DefinirPagamento → definirPagamentoDoContrato)', () => {
    const acao = ler('actions/documentos-da-janela.ts')
    expect(acao).toMatch(/documentoNaJanela\(d, \{ colhe, completa, clienteId: ap\.client_id \}\)/)
    const tela = ler('components/branch/documentos-da-janela.tsx')
    expect(tela).toMatch(/d\.podeDefinirPagamento && /)
    expect(tela).toContain('<DefinirPagamento')
    expect(tela).toContain('Definir pagamento')
  })
})

describe('D4: a tela de assinar define o pagamento ali, em vez de mandar à ficha', () => {
  const doc = {
    id: 'd1', titulo: 'Contrato do micro', tipo: 'CONTRATO' as const, status: 'INCOMPLETO', faltando: ['Pagamento · Forma de pagamento'],
    codigo: null, cliente: { nome: 'Rosemary' }, conteudo: null, pdfUrl: null, assinatura: null, motivo: null,
    pagamento: { pede: true, valor: null, desconto: 0, total: 450 },
  }

  it('só falta o pagamento: "Definir pagamento", sem "Completar o cadastro" nem o recado da ficha', async () => {
    const { TelaDeAssinatura } = await import('@/components/shared/tela-de-assinatura')
    const html = renderToStaticMarkup(createElement(TelaDeAssinatura, { doc, podeColher: true, rotaDoCliente: '/unidade/clients/c1', podeCompletar: true }))
    expect(html).toContain('Definir pagamento')
    expect(html).not.toContain('Completar o cadastro')
    expect(html).not.toContain('se define na ficha')
    expect(html).not.toContain('Complete o cadastro')
  })

  it('falta o CPF também: os dois, e a lista do cadastro sem o pagamento', async () => {
    const { TelaDeAssinatura } = await import('@/components/shared/tela-de-assinatura')
    const html = renderToStaticMarkup(createElement(TelaDeAssinatura, {
      doc: { ...doc, faltando: ['Cliente · CPF', 'Pagamento · Forma de pagamento'] }, podeColher: true, rotaDoCliente: '/unidade/clients/c1', podeCompletar: true,
    }))
    expect(html).toContain('Definir pagamento')
    expect(html).toContain('Completar o cadastro')
    expect(html).toContain('Cliente · CPF')
    expect(html).not.toContain('Pagamento · Forma de pagamento')
  })

  it('a página de assinar leva o combinado do contrato à tela', () => {
    expect(ler('app/_shared/assinatura-de-documento.tsx')).toMatch(/pagamento:\s+doc\.resumo\.pedePagamento/)
  })
})

describe('D4: a tela Documentos leva ao pagamento, não ao cadastro', () => {
  it('as contas do que falta: o cadastro e o pagamento, separados', async () => {
    const { faltaNoCadastro, faltaOPagamento } = await import('@/lib/documentos/o-que-falta')
    expect(faltaNoCadastro(['o pagamento do contrato'])).toBe(false)
    expect(faltaOPagamento(['o pagamento do contrato'])).toBe(true)
    expect(faltaNoCadastro(['CPF', 'o pagamento do contrato'])).toBe(true)
    expect(faltaOPagamento(['CPF'])).toBe(false)
  })

  it('o painel: "Completar o cadastro" só com dado do cadastro; o pagamento leva à ficha, em Documentos', () => {
    const painel = ler('components/shared/painel-de-documentos.tsx')
    expect(painel).toMatch(/l\.podeCompletar && l\.clienteId && faltaNoCadastro\(l\.faltando\)/)
    expect(painel).toMatch(/faltaOPagamento\(l\.faltando\)[\s\S]{0,400}\?aba=documentos[\s\S]{0,300}Definir pagamento/)
  })
})

describe('D7: o combinado do contrato não fala da taxa da maquininha', () => {
  const estado = { forma: 'AVISTA' as const, metodo: 'CREDIT_CARD', entrada: '', parcelas: 3, data: '2026-12-28', vencimento: '', vezes: 2, bandeira: '', maquininha: '', outras: [] }

  it('no contrato (semMaquininha), nem o aviso de taxa faltando nem a taxa', async () => {
    const { CamposDoPagamento } = await import('@/components/shared/campos-do-pagamento')
    const html = renderToStaticMarkup(createElement(CamposDoPagamento, {
      estado, aoMudar: () => {}, formas: ['NADA_AGORA', 'AVISTA', 'PARCELADO', 'A_RECEBER'], total: 450, doQue: 'do atendimento', semMaquininha: true,
    }))
    expect(html).toContain('Vezes no cartão')
    expect(html).not.toContain('data-aviso-taxa')
    expect(html).not.toContain('data-liquido-do-cartao')
  })

  it('no débito do contrato, também não', async () => {
    const { CamposDoPagamento } = await import('@/components/shared/campos-do-pagamento')
    const html = renderToStaticMarkup(createElement(CamposDoPagamento, {
      estado: { ...estado, metodo: 'DEBIT_CARD', vezes: 1 }, aoMudar: () => {}, formas: ['AVISTA'], total: 450, semMaquininha: true,
    }))
    expect(html).toContain('Bandeira (opcional)')
    expect(html).not.toContain('data-taxa-do-debito')
  })

  it('controle: na venda (o dinheiro entra), o aviso segue — sem a bandeira, a venda sai a 0% (MQ-10)', async () => {
    const { CamposDoPagamento } = await import('@/components/shared/campos-do-pagamento')
    const credito = renderToStaticMarkup(createElement(CamposDoPagamento, { estado, aoMudar: () => {}, formas: ['AVISTA'], total: 450 }))
    expect(credito).toContain('data-aviso-taxa')
    const debito = renderToStaticMarkup(createElement(CamposDoPagamento, { estado: { ...estado, metodo: 'DEBIT_CARD', vezes: 1 }, aoMudar: () => {}, formas: ['AVISTA'], total: 450 }))
    expect(debito).toContain('data-taxa-do-debito')
  })
})

describe('A13: a janela aberta lê os documentos de novo', () => {
  it('assina o sinal da agenda (o documento montado de novo o marca) e relê depois de definir o pagamento', () => {
    const tela = ler('components/branch/documentos-da-janela.tsx')
    expect(tela).toMatch(/useSinais\(\['agenda'\], recarregar/)
    expect(tela).toMatch(/aoTerminar=\{\(\) => \{ setPagando\(null\); recarregar\(\) \}\}/)
  })
})
