import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A19, A20 e A21 da 21ª simulação (2026-11-17), Configurações → Importações:
 * - A19: os 9 contatos importados sem oportunidade só se achavam pela busca
 *   (Ctrl K) — Clientes, Oportunidades e Inbox vazios, e o fim da importação
 *   não dizia onde eles estavam;
 * - A20: "A coluna “origem” não será importada" não dizia que, com
 *   oportunidade, ela vira a origem da oportunidade;
 * - A21: não havia "Importar" na lista de Clientes.
 */

const ler = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('A19: o fim da importação diz onde estão os importados', () => {
  it('contatos sem oportunidade: na busca, em "Contatos do CRM"', async () => {
    const { ondeEstaoOsImportados } = await import('@/lib/importacao/o-que-entra')
    const r = ondeEstaoOsImportados({ destino: 'contatos', comOportunidade: false, podeCriarOportunidade: true })
    expect(r.link).toBe('busca')
    expect(r.texto).toBe('Os contatos sem oportunidade não aparecem em Clientes, Oportunidades nem Inbox: ache cada um na busca do topo (Ctrl K), em “Contatos do CRM” — abrir cria a oportunidade dele.')
  })
  it('sem poder criar oportunidade, a busca não os mostra: aparecem no Inbox quando a conversa começar', async () => {
    const { ondeEstaoOsImportados } = await import('@/lib/importacao/o-que-entra')
    const r = ondeEstaoOsImportados({ destino: 'contatos', comOportunidade: false, podeCriarOportunidade: false })
    expect(r.link).toBeNull()
    expect(r.texto).toBe('Os contatos sem oportunidade ficam no CRM e aparecem no Inbox quando a conversa começar.')
  })
  it('com oportunidade: no quadro; clientes: na lista de Clientes', async () => {
    const { ondeEstaoOsImportados } = await import('@/lib/importacao/o-que-entra')
    expect(ondeEstaoOsImportados({ destino: 'contatos', comOportunidade: true, podeCriarOportunidade: true }))
      .toEqual({ texto: 'Os contatos estão no quadro de Oportunidades, cada um com a sua.', link: 'oportunidades' })
    expect(ondeEstaoOsImportados({ destino: 'clientes', comOportunidade: false, podeCriarOportunidade: true }))
      .toEqual({ texto: 'As fichas estão em Clientes.', link: 'clientes' })
  })
  it('a tela mostra, no fim, o texto e o link (e a busca abre por um evento)', () => {
    const f = ler('components/branch/importador-de-contatos.tsx')
    expect(f).toContain('ondeEstaoOsImportados(')
    expect(f).toContain('data-onde-estao-os-importados')
    expect(f).toContain('abrirABusca(')
    expect(ler('components/shared/busca-universal.tsx')).toContain('EVENTO_DE_ABRIR_A_BUSCA')
  })
})

describe('A20: a coluna de fora que a oportunidade levaria', () => {
  it('“origem” sem oportunidade: diz que com oportunidade ela vira a origem da oportunidade', async () => {
    const { colunasQueAOportunidadeLeva, avisoDasColunasDaOportunidade } = await import('@/lib/importacao/o-que-entra')
    const cab = ['nome', 'telefone', 'origem']
    const levadas = colunasQueAOportunidadeLeva(cab, ['name', 'phone', null], 'contatos')
    expect(levadas).toEqual([{ coluna: 'origem', chave: 'op_origem', rotulo: 'Origem' }])
    expect(avisoDasColunasDaOportunidade(levadas)).toBe('Importando com oportunidade (passo 1), ela vira a origem da oportunidade.')
  })
  it('mais de uma: diz em que campo do card cada uma entra', async () => {
    const { colunasQueAOportunidadeLeva, avisoDasColunasDaOportunidade } = await import('@/lib/importacao/o-que-entra')
    const levadas = colunasQueAOportunidadeLeva(['nome', 'telefone', 'origem', 'valor', 'cor favorita'], ['name', 'phone', null, null, null], 'contatos')
    expect(levadas.map(l => l.coluna)).toEqual(['origem', 'valor'])
    expect(avisoDasColunasDaOportunidade(levadas)).toBe('Importando com oportunidade (passo 1), elas entram no card: “origem” como Origem e “valor” como Valor estimado.')
    expect(avisoDasColunasDaOportunidade([])).toBeNull()
    const so = colunasQueAOportunidadeLeva(['nome', 'telefone', 'origem', 'cor favorita'], ['name', 'phone', null, null], 'contatos')
    expect(avisoDasColunasDaOportunidade(so, 2), 'com duas de fora, o "ela" cita a coluna')
      .toBe('Importando com oportunidade (passo 1), “origem” vira a origem da oportunidade.')
  })
  it('a prévia mostra o aviso só sem oportunidade e para quem pode criá-la', () => {
    const f = ler('components/branch/importador-de-contatos.tsx')
    expect(f).toMatch(/!comOportunidade && p\.podeOportunidade[\s\S]{0,200}colunasQueAOportunidadeLeva\(/)
  })
})

describe('A21: "Importar" na lista de Clientes, para quem importa', () => {
  it('os dois layouts passam o atalho só com Clientes em Gerenciar e “A rede inteira”', () => {
    for (const rel of ['app/[slug]/clients/layout.tsx', 'app/admin/clients/layout.tsx']) {
      const f = ler(rel)
      expect(f, rel).toMatch(/importarHref=\{can\(ctx, 'clients', 'MANAGE'\) && ctx\.branchId === null/)
      expect(f, rel).toContain('/settings?tab=importacoes')
    }
  })
  it('a lista mostra o link com texto', () => {
    const f = ler('components/branch/clients-sidebar.tsx')
    expect(f).toContain('data-importar-clientes')
    expect(f).toContain('Importar planilha')
  })
})
