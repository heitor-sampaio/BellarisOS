import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Os atritos da 20ª simulação (2026-11-16) de montar a rede — cargos,
 * importação, procedimento, unidade, equipe — e do CRM e do Dashboard, que se
 * provam sem tela: a regra pura e o que a tela passa a usar.
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')

describe('A18: o cargo escolhido fica escolhido ao voltar à tela [3]', () => {
  const cargos = [
    { id: 'adm', is_system: true },
    { id: 'fin', is_system: false },
    { id: 'novo', is_system: false },
  ]
  it('o cargo pedido no endereço (?cargo=) abre escolhido', async () => {
    const { cargoEscolhido } = await import('@/lib/cargos/cargo-escolhido')
    expect(cargoEscolhido(cargos, 'novo')).toBe('novo')
    expect(cargoEscolhido(cargos, 'adm')).toBe('adm')
  })
  it('sem pedido, ou com um que não existe (o excluído), o primeiro editável', async () => {
    const { cargoEscolhido } = await import('@/lib/cargos/cargo-escolhido')
    expect(cargoEscolhido(cargos, null)).toBe('fin')
    expect(cargoEscolhido(cargos, 'apagado')).toBe('fin')
    expect(cargoEscolhido([{ id: 'adm', is_system: true }], null)).toBe('adm')
    expect(cargoEscolhido([], null)).toBeNull()
  })
  it('a tela lê o ?cargo= e o grava ao escolher', () => {
    const f = ler('components/admin/roles-editor.tsx')
    expect(f).toContain('cargoEscolhido(')
    expect(f).toMatch(/searchParams\.get\('cargo'\)|get\('cargo'\)/)
    expect(f).toContain("'cargo'")
  })
})

describe('A19: a importação diz a coluna que fica de fora [3]', () => {
  it('as colunas em "Não importar", pelo cabeçalho', async () => {
    const { colunasQueNaoEntram } = await import('@/lib/importacao/o-que-entra')
    expect(colunasQueNaoEntram(['nome', 'telefone', 'origem'], ['name', 'phone', null])).toEqual(['origem'])
    expect(colunasQueNaoEntram(['nome', 'origem', 'obs'], ['name', null, null])).toEqual(['origem', 'obs'])
    expect(colunasQueNaoEntram(['nome', ''], ['name', null]), 'a coluna sem cabeçalho diz o número').toEqual(['Coluna 2'])
    expect(colunasQueNaoEntram(['nome'], ['name'])).toEqual([])
  })
  it('a prévia mostra', () => {
    const f = ler('components/branch/importador-de-contatos.tsx')
    expect(f).toContain('colunasQueNaoEntram(')
    expect(f).toContain('data-colunas-de-fora')
  })
})

// Auditoria das regras (2026-11-18): a A20 escondia o termo e o contrato de
// "Outros documentos" até haver um escolhido no campo próprio — contra o PC7
// ("qualquer documento que tenha sido criado ou anexado no sistema"). Este
// bloco travava isso; agora trava o PC7.
describe('PC7: "Outros documentos" oferece todo documento da rede (a A20 estreitava)', () => {
  const lista = [
    { id: 'd1', nome: 'Autorização de imagem', tipo: 'DOCUMENTO', ativo: true },
    { id: 't1', nome: 'Termo da toxina', tipo: 'TERMO', ativo: true },
    { id: 't2', nome: 'Termo do peeling', tipo: 'TERMO', ativo: true },
    { id: 'k1', nome: 'Contrato avulso', tipo: 'CONTRATO', ativo: true },
  ]
  it('sem termo nem contrato escolhidos, todos', async () => {
    const { outrosDocumentosOferecidos } = await import('@/lib/documentos/outros-do-procedimento')
    expect(outrosDocumentosOferecidos(lista, { termo: '', contrato: '', marcados: [] }).map(o => o.id)).toEqual(['d1', 't1', 't2', 'k1'])
  })
  it('o escolhido no campo próprio não se repete aqui (A36 da 15ª)', async () => {
    const { outrosDocumentosOferecidos } = await import('@/lib/documentos/outros-do-procedimento')
    expect(outrosDocumentosOferecidos(lista, { termo: 't1', contrato: '', marcados: [] }).map(o => o.id)).toEqual(['d1', 't2', 'k1'])
    expect(outrosDocumentosOferecidos(lista, { termo: 't1', contrato: 'k1', marcados: [] }).map(o => o.id)).toEqual(['d1', 't2'])
  })
  it('o que já está marcado fica (sumir apagaria o vínculo ao salvar)', async () => {
    const { outrosDocumentosOferecidos } = await import('@/lib/documentos/outros-do-procedimento')
    expect(outrosDocumentosOferecidos(lista, { termo: 't2', contrato: '', marcados: ['t2'] }).map(o => o.id)).toEqual(['d1', 't1', 't2', 'k1'])
  })
  it('o cadastro do procedimento usa', () => {
    expect(ler('components/admin/procedure-form.tsx')).toContain('outrosDocumentosOferecidos(')
  })
})

describe('A21: a unidade sem UF avisa (não recusa) [2]', () => {
  it('com a cidade e sem a UF, o aviso; com as duas, ou sem endereço, nada', async () => {
    const { avisoDaUfQueFalta } = await import('@/lib/cep')
    expect(avisoDaUfQueFalta({ cidade: 'Belém', uf: '' })).toBe('Falta a UF: os documentos da unidade saem sem ela.')
    expect(avisoDaUfQueFalta({ cidade: 'Belém', uf: 'PA' })).toBeNull()
    expect(avisoDaUfQueFalta({ cidade: '', uf: '' })).toBeNull()
    expect(avisoDaUfQueFalta({ cidade: null, uf: null })).toBeNull()
  })
  it('a Nova unidade, a edição e o /setup mostram', () => {
    for (const f of ['components/admin/branch-form.tsx', 'components/admin/branch-edit-form.tsx', 'components/setup/setup-wizard.tsx']) {
      // A28 da 22ª: o aviso da UF chega pelo do endereço (que também pede a cidade que o CEP não trouxe).
      expect(ler(f), f).toContain('avisoDoEnderecoQueFalta(')
    }
  })
})

describe('A22: a comissão de quem não atende não fala em atendimento, e a janela só existe aberta [7]', () => {
  it('quem não atende: só a de venda', async () => {
    const { resumoDaComissaoDoMembro } = await import('@/lib/equipe/textos-do-cadastro')
    expect(resumoDaComissaoDoMembro({ tipo: 'NENHUMA', valor: '', venda: '', atende: false })).toBe('Comissão: nenhuma.')
    expect(resumoDaComissaoDoMembro({ tipo: 'NENHUMA', valor: '', venda: '10', atende: false })).toBe('Comissão: 10% de cada venda.')
    // Quem atende segue como era.
    expect(resumoDaComissaoDoMembro({ tipo: 'NENHUMA', valor: '', venda: '', atende: true })).toBe('Comissão: nenhuma por atendimento.')
  })
  it('o formulário da comissão só monta com a janela aberta (o texto não se empilha na Equipe)', () => {
    const f = ler('components/admin/comissao-do-membro.tsx')
    expect(f).toMatch(/\{aberta && \(?\s*<Formulario/)
    expect(f).toContain('resumoDaComissaoDoMembro({ tipo, valor, venda, atende })')
  })
})

describe('A24: o desativado não tem o selo "Atende" [3]', () => {
  it('o selo', async () => {
    const { seloDoAtende } = await import('@/lib/equipe/atende')
    expect(seloDoAtende({ ativo: true, atende: true, onde: ['Nazaré', 'Umarizal'], variasUnidades: true })).toBe('Atende em Nazaré e Umarizal')
    expect(seloDoAtende({ ativo: true, atende: true, onde: ['Nazaré'], variasUnidades: false })).toBe('Atende')
    expect(seloDoAtende({ ativo: false, atende: true, onde: ['Nazaré', 'Umarizal'], variasUnidades: true })).toBeNull()
    expect(seloDoAtende({ ativo: true, atende: false, onde: [], variasUnidades: true })).toBeNull()
  })
  it('as duas Equipes usam', () => {
    expect(ler('app/admin/team/page.tsx')).toContain('seloDoAtende(')
    expect(ler('app/[slug]/team/page.tsx')).toContain('seloDoAtende(')
  })
})

describe('A28: a etapa nova entra antes do Ganho e do Perdido [7]', () => {
  const funil = [
    { id: 'novo', position: 0, outcome: 'OPEN' as const },
    { id: 'contato', position: 1, outcome: 'OPEN' as const },
    { id: 'ganho', position: 2, outcome: 'WON' as const },
    { id: 'perdido', position: 3, outcome: 'LOST' as const },
  ]
  it('a aberta entra antes do bloco de fechamento, que anda uma casa', async () => {
    const { posicaoDaEtapaNova } = await import('@/lib/crm/posicao-da-etapa')
    expect(posicaoDaEtapaNova(funil, 'OPEN')).toEqual({ posicao: 2, renumerar: [{ id: 'ganho', position: 3 }, { id: 'perdido', position: 4 }] })
  })
  it('a de ganho ou perda vai para o fim', async () => {
    const { posicaoDaEtapaNova } = await import('@/lib/crm/posicao-da-etapa')
    expect(posicaoDaEtapaNova(funil, 'LOST')).toEqual({ posicao: 4, renumerar: [] })
  })
  it('sem etapa de fechamento no fim, a aberta vai para o fim', async () => {
    const { posicaoDaEtapaNova } = await import('@/lib/crm/posicao-da-etapa')
    expect(posicaoDaEtapaNova(funil.slice(0, 2), 'OPEN')).toEqual({ posicao: 2, renumerar: [] })
    expect(posicaoDaEtapaNova([], 'OPEN')).toEqual({ posicao: 0, renumerar: [] })
  })
  it('a numeração com buraco ou repetida sai em ordem', async () => {
    const { posicaoDaEtapaNova } = await import('@/lib/crm/posicao-da-etapa')
    const torto = [
      { id: 'a', position: 0, outcome: 'OPEN' as const },
      { id: 'g', position: 5, outcome: 'WON' as const },
      { id: 'p', position: 5, outcome: 'LOST' as const },
    ]
    expect(posicaoDaEtapaNova(torto, 'OPEN')).toEqual({ posicao: 1, renumerar: [{ id: 'g', position: 2 }, { id: 'p', position: 3 }] })
  })
  it('a action usa', () => {
    expect(ler('actions/crm-stages.ts')).toContain('posicaoDaEtapaNova(')
  })
})

describe('A29: o "Agendar" está no menu do card [7]', () => {
  it('o card oferece e o editor abre o agendar pelo card', () => {
    const quadro = ler('components/branch/crm-board.tsx')
    expect(quadro).toContain('data-agendar-do-card')
    expect(quadro).toContain('editRef.current?.agendar()')
    expect(ler('components/branch/crm-lead-modal.tsx')).toMatch(/agendar: \(\) =>/)
  })
})

describe('A30: o bloco do funil no Dashboard abre no funil com oportunidades [7]', () => {
  const funis = [
    { id: 'vendas', is_default: true },
    { id: 'corporal', is_default: false },
    { id: 'facial', is_default: false },
  ]
  const total: Record<string, number> = { vendas: 0, corporal: 4, facial: 2 }
  const lerFunil = async (id: string) => ({ id, total: total[id] ?? 0 })
  it('o padrão vazio cede ao primeiro com oportunidades', async () => {
    const { funilDoDashboard } = await import('@/lib/crm/funil-do-dashboard')
    const r = await funilDoDashboard({ funis, pedido: null, lerFunil, total: e => e.total })
    expect(r.funil?.id).toBe('corporal')
    expect(r.etapas).toEqual({ id: 'corporal', total: 4 })
  })
  it('o pedido no endereço vale, mesmo vazio', async () => {
    const { funilDoDashboard } = await import('@/lib/crm/funil-do-dashboard')
    expect((await funilDoDashboard({ funis, pedido: 'vendas', lerFunil, total: e => e.total })).funil?.id).toBe('vendas')
  })
  it('o padrão com oportunidades fica; todos vazios, o padrão', async () => {
    const { funilDoDashboard } = await import('@/lib/crm/funil-do-dashboard')
    const cheio = async (id: string) => ({ id, total: 1 })
    expect((await funilDoDashboard({ funis, pedido: null, lerFunil: cheio, total: e => e.total })).funil?.id).toBe('vendas')
    const vazio = async (id: string) => ({ id, total: 0 })
    expect((await funilDoDashboard({ funis, pedido: null, lerFunil: vazio, total: e => e.total })).funil?.id).toBe('vendas')
  })
  it('o Dashboard usa', () => {
    expect(ler('app/admin/dashboard/page.tsx')).toContain('funilDoDashboard(')
  })
})

describe('A3 da 20ª: a comissão da Equipe não fala no feminino fixo', () => {
  it('"cada atendimento da pessoa", nos dois cadastros', () => {
    for (const f of ['components/admin/team-form.tsx', 'components/branch/team-form.tsx']) {
      const src = ler(f)
      expect(src, f).not.toContain('cada atendimento dela')
      expect(src, f).toContain('Percentual sobre cada atendimento da pessoa.')
    }
  })
})
