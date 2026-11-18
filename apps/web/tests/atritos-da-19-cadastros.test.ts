import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { avisoDoCustoDaEntrada } from '@/lib/estoque/custo-da-entrada'
import { chipDaComissao } from '@/lib/comissoes/chip-do-membro'
import { resumoDoEditorDeHorario } from '@/lib/unidades/horario-no-editor'

/**
 * Os atritos de montar a rede na 19ª simulação (2026-11-16): o estoque, o
 * insumo do procedimento, a Equipe e as comissões.
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')
const sp = (s: string | null | undefined) => s?.replace(/\s/g, ' ') ?? null

// ─── A19: o custo fora do comum avisa; o "Desfazer entrada" se acha ──────────
describe('A19: avisoDoCustoDaEntrada', () => {
  it('mais de 10 vezes o custo do produto: avisa (não recusa — princípio 2)', () => {
    expect(sp(avisoDoCustoDaEntrada(90000, { custo: 90, venda: 180 })))
      .toBe('R$ 90.000,00 é mais de 10 vezes o custo deste produto (R$ 90,00). Confira o custo unitário: se estiver certo, a entrada vale assim.')
  })
  it('sem custo, compara com o preço de venda', () => {
    expect(sp(avisoDoCustoDaEntrada(5000, { custo: 0, venda: 120 })))
      .toBe('R$ 5.000,00 é mais de 10 vezes o preço de venda deste produto (R$ 120,00). Confira o custo unitário: se estiver certo, a entrada vale assim.')
  })
  it('perto do de sempre, vazio, ou sem referência: nada (princípio 4)', () => {
    expect(avisoDoCustoDaEntrada(95, { custo: 90, venda: 180 })).toBeNull()
    expect(avisoDoCustoDaEntrada(900, { custo: 90, venda: null })).toBeNull()
    expect(avisoDoCustoDaEntrada(null, { custo: 90, venda: 180 })).toBeNull()
    // Regra mudada na 24ª (A10): sem referência, o custo pequeno não avisa; o de R$ 10.000 ou mais avisa (correcoes-da-24-area3).
    expect(avisoDoCustoDaEntrada(900, { custo: 0, venda: null })).toBeNull()
  })
  it('a Entrada mostra o aviso, e o lápis do produto diz onde desfazer a entrada', () => {
    const modal = ler('components/admin/admin-stock-manage-modal.tsx')
    expect(modal).toMatch(/avisoDoCustoDaEntrada\(/)
    expect(modal).toMatch(/data-custo-fora-do-comum/)
    const lapis = ler('components/branch/stock-product-modal.tsx')
    expect(lapis).toMatch(/data-desfazer-entrada/)
    expect(lapis).toMatch(/Desfazer entrada/)
  })
})

// ─── A21: a quantidade do insumo em branco diz o que falta ───────────────────
describe('A21: a quantidade do insumo', () => {
  it('nasce em branco (A13 da 15ª), e a linha diz que é preciso preencher', () => {
    const form = ler('components/admin/procedure-form.tsx')
    expect(form).toMatch(/quantity: null/)
    expect(form).toMatch(/data-quantidade-em-branco/)
    expect(form).toMatch(/quanto sai a cada atendimento/)
  })
})

// ─── A22: o chip da comissão diz qual comissão falta ─────────────────────────
describe('A22: chipDaComissao', () => {
  it('quem atende sem padrão: "Sem comissão de atendimento"', () => {
    expect(chipDaComissao({ padrao: null, excecoes: 0, vendaPct: null, atende: true })).toBe('Sem comissão de atendimento')
    expect(chipDaComissao({ padrao: null, excecoes: 0, vendaPct: 3, atende: true })).toBe('Sem comissão de atendimento · venda 3%')
  })
  it('quem não atende: a de venda', () => {
    // A6 da 24ª: sem a dela, vale a do pacote, do produto ou da rede (era "Sem comissão de venda").
    expect(chipDaComissao({ padrao: null, excecoes: 0, vendaPct: null, atende: false })).toBe('Venda: a do pacote, produto ou rede')
    expect(chipDaComissao({ padrao: null, excecoes: 0, vendaPct: 2.5, atende: false })).toBe('Venda 2,5%')
  })
  it('com padrão, como antes', () => {
    expect(chipDaComissao({ padrao: '25%', excecoes: 2, vendaPct: 3, atende: true })).toBe('Comissão 25% · 2 exceções · venda 3%')
    expect(chipDaComissao({ padrao: null, excecoes: 1, vendaPct: null, atende: true })).toBe('Sem comissão padrão · 1 exceção')
  })
  it('a Equipe usa o chip', () => {
    expect(ler('components/admin/comissao-do-membro.tsx')).toMatch(/chipDaComissao\(/)
  })
})

// ─── A24: a comissão de venda do pacote ──────────────────────────────────────
describe('A24: a comissão de venda do pacote se acha e não parece zero', () => {
  it('Comissões e taxas diz que a do pacote fica no pacote', () => {
    const tela = ler('components/admin/settings-comissoes.tsx')
    expect(tela).toMatch(/Venda de pacote/)
    expect(tela).toMatch(/data-comissao-do-pacote/)
    expect(tela).toMatch(/Comercial → Pacotes/)
  })
  it('o campo do valor mostra um exemplo, não um 0', () => {
    const campo = ler('components/admin/comissao-do-membro.tsx')
    expect(campo).not.toMatch(/placeholder=\{pct \? '0' : '0,00'\}/)
    expect(campo).toMatch(/Ex\.: 10/)
  })
})

// ─── A25: o horário depois de repetir, em texto, antes de salvar ─────────────
describe('A25: resumoDoEditorDeHorario', () => {
  const todos = (de: string, ate: string) => Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map(d => [d, [{ de, ate }]]))
  it('"Fica assim: Seg a dom, 09:00–23:59"', () => {
    expect(resumoDoEditorDeHorario(todos('09:00', '23:59'))).toBe('Fica assim: Seg a dom, 09:00–23:59')
  })
  it('o domingo fechado aparece como fechado', () => {
    const dias = { ...todos('09:00', '18:00'), 0: [] }
    expect(resumoDoEditorDeHorario(dias)).toBe('Fica assim: Seg a sáb, 09:00–18:00. Domingo fechado')
  })
  it('tudo fechado', () => {
    expect(resumoDoEditorDeHorario(Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map(d => [d, []]))))
      .toBe('Fica assim: fechado todos os dias')
  })
  it('o editor mostra o resumo à vista', () => {
    const editor = ler('components/shared/editor-de-horario.tsx')
    expect(editor).toMatch(/data-resumo-do-horario/)
    expect(editor).toMatch(/resumoDoEditorDeHorario\(/)
  })
})
