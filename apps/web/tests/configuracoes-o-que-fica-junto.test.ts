import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * Configurações, Procedimentos e Pacotes: o que fica junto, na ordem, e com o
 * nome do que é (princípio 7; o Heitor, 26/11: "Ser intuitivo é justamente o
 * contrario, ser facil de usar mesmo sem muitas explicações"). Nenhum texto
 * novo que explica — muda o agrupamento, a ordem e o nome.
 */
vi.mock('@/actions/rede', () => ({ atualizarDadosDaRede: async () => undefined }))

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

const REDE = {
  id: 'r1', name: 'Espaço Margarida', slug: 'margarida', document: null, email: null, phone: null, website: null,
  prazoPortalHoras: 24, validadeDoPlanoDias: 30, oQueAClienteAvalia: 'OS_DOIS' as const,
  regrasDoPacote: { crediarioLibera: true, vencidoCancela: false },
  planName: 'Essencial', planStatus: 'ACTIVE', criadaEm: '2026-11-01T12:00:00Z',
}

/** A posição de cada pedaço no HTML: o cartão começa no marcador, e o que vem antes do próximo é dele. */
function emOrdem(html: string, pedacos: string[]) {
  const pos = pedacos.map(p => [p, html.indexOf(p)] as const)
  for (const [p, i] of pos) expect(i, `"${p}" na tela`).toBeGreaterThanOrEqual(0)
  expect(pos.map(([p]) => p)).toEqual([...pos].sort((a, b) => a[1] - b[1]).map(([p]) => p))
}

describe('A1: Configurações → Geral separa os dados da rede das regras do app e do pacote', () => {
  it('quem edita: três cartões — Dados da rede, App da cliente, Pacotes —, cada um com os seus campos', async () => {
    const { SettingsGeral } = await import('@/components/admin/settings-geral')
    const html = renderToStaticMarkup(createElement(SettingsGeral, { rede: REDE, podeEditar: true, appDaCliente: [{ unidade: 'Centro', url: 'https://app/x/cliente' }] }))
    emOrdem(html, [
      'data-cartao-da-geral="rede"', '>Dados da rede<', 'name="name"', 'name="website"', '>Plano<',
      'data-cartao-da-geral="app"', '>App da cliente<', 'https://app/x/cliente', 'name="portal_prazo_alteracao_horas"', 'name="avaliacao_o_que"', 'name="plano_validade_dias"',
      'data-cartao-da-geral="pacotes"', '>Pacotes<', 'name="pacote_crediario_libera"', 'name="pacote_vencido_cancela"',
      '>Salvar<',
    ])
    // Um só "App da cliente" no marcador do endereço (o E2E o procura com exact).
    const app = html.slice(html.indexOf('data-app-da-cliente'), html.indexOf('data-cartao-da-geral="pacotes"'))
    expect(app.match(/>App da cliente</g)).toHaveLength(1)
  })

  it('quem só lê: os mesmos três cartões', async () => {
    const { SettingsGeral } = await import('@/components/admin/settings-geral')
    const html = renderToStaticMarkup(createElement(SettingsGeral, { rede: REDE, podeEditar: false }))
    expect(html).toContain('data-geral-so-leitura')
    emOrdem(html, [
      'data-cartao-da-geral="rede"', '>Dados da rede<', '>CNPJ ou CPF<',
      'data-cartao-da-geral="app"', '>App da cliente<', '>Prazo do portal<', '>Validade do plano proposto<',
      'data-cartao-da-geral="pacotes"', '>Pacotes<', '>Pacote com valor em aberto<', '>Pacote vencido<',
    ])
    expect(html).not.toContain('>Salvar<')
  })
})

describe('A10: Configurações sem aba pedida abre na primeira da tela que é da pessoa', () => {
  it('a Admin da rede, no portal da rede: a primeira da tela é Geral (o grupo "A rede"), não Unidades', async () => {
    const { abaInicial, ABAS_DE_CONFIGURACAO, ABAS_DA_REDE } = await import('@/lib/configuracoes/abas')
    const abas = ABAS_DE_CONFIGURACAO.filter(a => ABAS_DA_REDE.includes(a.key))
    expect(abaInicial(abas, () => true)).toBe('general')
  })
  it('no portal da unidade, a Unidade (CU-07)', async () => {
    const { abaInicial, ABAS_DE_CONFIGURACAO, ABAS_DA_UNIDADE } = await import('@/lib/configuracoes/abas')
    const abas = ABAS_DE_CONFIGURACAO.filter(a => ABAS_DA_UNIDADE.includes(a.key))
    expect(abaInicial(abas, () => true)).toBe('unidade')
  })
  it('quem não é a Admin: a primeira da tela que é dela — Tags e Importações são da rede toda (CU-07)', async () => {
    const { abaInicial, ABAS_DE_CONFIGURACAO, ABAS_DA_REDE_TODA } = await import('@/lib/configuracoes/abas')
    const abas = ABAS_DE_CONFIGURACAO.filter(a => (['tags', 'importacoes', 'lgpd'] as string[]).includes(a.key))
    expect(abaInicial(abas, k => !ABAS_DA_REDE_TODA.includes(k))).toBe('lgpd')
    // Nenhuma é dela: a primeira da tela.
    expect(abaInicial(abas.filter(a => a.key !== 'lgpd'), () => false)).toBe('tags')
  })
  it('a tela usa a conta', () => {
    expect(fonte('app/_shared/configuracoes.tsx')).toMatch(/abaInicial\(tabs, /)
  })
})

describe('A2: Configurações → Fichas — um editor por vez, e um salvar só', () => {
  it('editando uma ficha, a outra sai da tela', async () => {
    const { blocosDaAbaDeFichas } = await import('@/lib/configuracoes/fichas-na-tela')
    expect(blocosDaAbaDeFichas(null)).toEqual({ saude: true, atendimento: true })
    expect(blocosDaAbaDeFichas('atendimento')).toEqual({ saude: false, atendimento: true })
    expect(blocosDaAbaDeFichas('saude')).toEqual({ saude: true, atendimento: false })
  })
  it('a aba monta as duas pela conta, e cada uma avisa quando abre o editor', () => {
    expect(fonte('app/_shared/configuracoes.tsx')).toContain('<AbaDeFichas')
    expect(fonte('components/admin/aba-de-fichas.tsx')).toContain('blocosDaAbaDeFichas(')
    expect(fonte('components/admin/settings-fichas.tsx')).toMatch(/aoEditar\?\.\(/)
    expect(fonte('components/admin/settings-pre-atendimento.tsx')).toMatch(/aoEditar\?\.\(/)
  })
  it('o campo não tem um segundo "salvar": a janela do campo volta à ficha', () => {
    const f = fonte('components/admin/construtor-de-ficha.tsx')
    expect(f).not.toContain('className="btn-primary">Concluir</button>')
    expect(f).toContain('className="btn-secondary">Voltar à ficha</button>')
  })
})

describe('A12: o termo escolhido no procedimento não fica também em "Outros documentos"', () => {
  it('escolher o termo ou o contrato tira o mesmo documento dos marcados', async () => {
    const { semOTermoEOContrato } = await import('@/lib/documentos/outros-do-procedimento')
    expect(semOTermoEOContrato(['d1', 't1', 'k1'], { termo: 't1', contrato: '' })).toEqual(['d1', 'k1'])
    expect(semOTermoEOContrato(['d1', 't1', 'k1'], { termo: 't1', contrato: 'k1' })).toEqual(['d1'])
    expect(semOTermoEOContrato(['d1'], { termo: '', contrato: '' })).toEqual(['d1'])
  })
  it('o cadastro usa ao abrir e ao escolher', () => {
    const f = fonte('components/admin/procedure-form.tsx')
    expect(f.match(/semOTermoEOContrato\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })
})

describe('A14: o formulário do pacote diz o que é', () => {
  it('"Novo pacote" (ou "Editar pacote") no alto do formulário', () => {
    const f = fonte('components/admin/pacotes-catalogo.tsx')
    expect(f).toMatch(/<h3[^>]*>\s*\{r\.id \? 'Editar pacote' : 'Novo pacote'\}\s*<\/h3>/)
  })
})

describe('A3: Comissões e taxas — o Pix tem o rótulo próprio, como o Cartão', () => {
  it('o Pix e o Cartão, cada um no seu bloco com o nome', () => {
    const f = fonte('components/admin/settings-comissoes.tsx')
    expect(f).toMatch(/data-taxa-do-pix[\s\S]{0,200}<p className="overline">Pix<\/p>/)
    expect(f).toContain("campo('PIX', 1, 'Taxa')")
  })
})
