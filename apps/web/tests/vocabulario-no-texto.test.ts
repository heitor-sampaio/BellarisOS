import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'

/**
 * Bloco Vocabulário (V0, V1, V2) e Bloco Cargos (CG1, CG2) do plano de
 * adaptação — a revisão do Heitor, 2026-11-13 (CLAUDE.md §1, "Vocabulário"):
 * - "Clinica é a mesma coisa que rede e não deve existir no sistema." (V1,
 *   com o PO2 e o CA1): na tela é "a rede" ou o NOME dela.
 * - "Filial sai de vez." (V2): a palavra é "unidade".
 * - "não quero mais tu falando nomes de cargos como se fossem cargos fixos, o
 *   que define quem gerencia é permissão, ponto" (V0): nada de "a recepção",
 *   "a gerente", "a contadora" como quem faz — fala-se em permissão, em "a
 *   equipe" ou em "quem atende". Os NOMES dos cargos-modelo (Gerente,
 *   Recepcionista…) seguem como nomes de cargos editáveis.
 * - "Recebimentos" virou "PDV" (CG1) e "Termos e contratos", "Documentos"
 *   (CG2/DC1).
 *
 * A trava lê o TEXTO que se lê, como a do PR3 (`ficha-de-saude-no-texto`) e a
 * do CR1 (`oportunidade-no-texto`): o texto do JSX e as strings de frase (com
 * espaço, ou começando por maiúscula), pela árvore do TypeScript, nos três
 * apps da plataforma (a clínica, o sistema, o suporte) e no núcleo. O
 * comentário, o identificador (que tem a trava dele, abaixo), a chave em maiúsculas
 * (`'CLINICA'`), o nome de variável de ambiente (`CLINICA_URL`), o caminho
 * (`/auth/clinicas`), as colunas de uma consulta e o log não contam. O site
 * (`apps/site`) fica de fora: lá "clínica de estética" é o mercado (SI1).
 */

const RAIZ = join(__dirname, '..')
const MONO = join(RAIZ, '..', '..')

function arquivos(dir: string, saida: string[] = []): string[] {
  if (!existsSync(dir)) return saida
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) { if (!['node_modules', '.next', 'dist'].includes(nome)) arquivos(caminho, saida) }
    else if (/\.(ts|tsx)$/.test(nome) && !/\.d\.ts$/.test(nome)) saida.push(caminho)
  }
  return saida
}

const PASTAS = [
  ...['app', 'actions', 'lib', 'components'].map(d => join(RAIZ, d)),
  ...['sistema', 'suporte'].flatMap(a => ['app', 'actions', 'lib', 'components'].map(d => join(MONO, 'apps', a, d))),
  join(MONO, 'packages', 'nucleo', 'src'),
  join(MONO, 'packages', 'types', 'src'),
]

/**
 * "Clínica" como o NOME do negócio — não o adjetivo ("anotação clínica",
 * "foto clínica", "fichas clínicas", "evolução clínica": é o dado clínico,
 * que fica). Nem dentro de identificador, chave, caminho ou e-mail.
 */
const ADJETIVO = '(?<!\\b(?:fotos?|fichas?|anota[çc](?:ão|ões)|evolu[çc](?:ão|ões)|partes?|observa[çc](?:ão|ões)|informa[çc](?:ão|ões)|avalia[çc](?:ão|ões)|hist[óo]rias?|condutas?|[áa]reas?|decis(?:ão|ões)|rotinas?)\\s)'
const CLINICA = new RegExp(`${ADJETIVO}(?<![\\w/@._-])cl[íi]nicas?(?![\\w_/-]|\\.\\w)`, 'i')

/** "Filial" e "filiais", em qualquer caixa. */
const FILIAL = /(?<![\w/_-])filia(?:l|is)(?![\w_-])/i

/** Os nomes velhos do módulo: "Termos e contratos" (CG2/DC1) e "Recebimentos" (CG1). */
// "Recebimentos" com maiúscula: é o NOME do módulo. "os recebimentos de antes de…"
// (o dinheiro recebido) é palavra comum e fica.
const NOMES_VELHOS = /[Tt]ermos e contratos|TERMOS E CONTRATOS|(?<![\w-])Recebimentos(?![\w-])/

/**
 * O cargo como quem faz (V0): "a recepção", "pela recepcionista", "a gerente",
 * "a contadora". Nem como EXEMPLO de nome (15ª simulação: "Ex.: Recepção" lia
 * como um cargo fixo) — o exemplo do nome do cargo e do número fala do que a
 * pessoa faz ("Agenda e caixa", "Principal, Comercial…").
 */
const CARGO_FIXO = /(?<![\w-])(?:recep[çc][ãa]o|recepcionistas?|gerentes?|contadoras?)(?![\w-])/i

/** A string é frase (texto que alguém lê) — e não chave, caminho ou id? */
function ehFrase(s: string): boolean {
  if (/^[A-Z0-9_]+$/.test(s)) return false // a chave: 'CLINICA', 'FOTO_CLINICA'
  return /\s/.test(s) || /^[A-ZÀ-Ú]/.test(s)
}

/** Fora da tela? O log, o import, o tipo literal e as colunas de uma consulta do PostgREST. */
function foraDaTela(no: ts.Node): boolean {
  if (ts.isLiteralTypeNode(no.parent)) return true
  // O texto GRAVADO de antes, comparado para ser trocado na tela (a nota velha
  // da transferência): é dado, não fala da tela.
  if (ts.isBinaryExpression(no.parent) && /^[!=]==?$/.test(no.parent.operatorToken.getText())) return true
  if (ts.isCallExpression(no.parent) && no.parent.arguments[0] === no && /\.(startsWith|endsWith|includes)$/.test(no.parent.expression.getText())) return true
  for (let p = no.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      const alvo = p.expression.getText()
      if (/^console\./.test(alvo)) return true
      if (p.arguments[0] === no && ts.isPropertyAccessExpression(p.expression) && /^(select|or)$/.test(p.expression.name.text)) return true
    }
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true
  }
  return false
}

function achados(arquivo: string, texto: string, padrao: RegExp): string[] {
  const fonte = ts.createSourceFile(arquivo, texto, ts.ScriptTarget.Latest, true, arquivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const saida: string[] = []
  const anotar = (no: ts.Node, s: string) => {
    if (!padrao.test(s)) return
    const { line } = fonte.getLineAndCharacterOfPosition(no.getStart())
    saida.push(`${line + 1}: ${s.replace(/\s+/g, ' ').trim().slice(0, 120)}`)
  }
  const visitar = (no: ts.Node) => {
    if (ts.isJsxText(no)) anotar(no, no.text)
    else if ((ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) && !foraDaTela(no)) {
      const naPropriedade = ts.isJsxAttribute(no.parent) && /^(placeholder|title|aria-label|alt|label)$/i.test(no.parent.name.getText())
      const noTernario = ts.isConditionalExpression(no.parent) && no.parent.condition !== no
      if (naPropriedade || noTernario || ehFrase(no.text)) anotar(no, no.text)
    } else if (ts.isTemplateExpression(no) && !foraDaTela(no)) {
      const partes = [no.head.text, ...no.templateSpans.map(s => s.literal.text)].join('…')
      if (ehFrase(partes)) anotar(no, partes)
    }
    ts.forEachChild(no, visitar)
  }
  visitar(fonte)
  return saida
}

/**
 * As exceções, uma a uma, com o motivo (arquivo, começo do texto):
 * - o prompt do Copilot cita as palavras proibidas para mandar NÃO usá-las;
 * - o topbar dá o RÓTULO dos cargos-modelo antigos pela chave (nome de cargo,
 *   que a rede edita — V0 deixa o nome do cargo-modelo);
 * - o app sistema tem os papéis FIXOS da equipe da plataforma (ADMIN e
 *   GERENTE, docs/regras/plataforma.md) — lá o cargo é fixo de verdade.
 */
const EXCECOES: readonly (readonly [string, string])[] = [
  ['apps/web/lib/copilot/prompt.ts', 'Você é o Copilot, a secretária virtual do BellarisOS'],
  ['apps/web/components/shared/topbar.tsx', 'Gerente'],
  ['apps/web/components/shared/topbar.tsx', 'Recepcionista'],
  ['apps/web/components/shared/topbar.tsx', 'Gerente comercial'],
  ['apps/sistema/app/(painel)/layout.tsx', 'Só para ver: o Gerente não edita.'],
  ['apps/sistema/components/suporte/equipe-da-plataforma.tsx', 'Gerente (só vê o sistema)'],
]

function errados(padrao: RegExp): string[] {
  const saida: string[] = []
  for (const pasta of PASTAS) {
    for (const f of arquivos(pasta)) {
      const rel = relative(MONO, f).split(sep).join('/')
      for (const a of achados(f, readFileSync(f, 'utf8'), padrao)) {
        const texto = a.slice(a.indexOf(': ') + 2)
        if (EXCECOES.some(([arq, ini]) => arq === rel && texto.startsWith(ini))) continue
        saida.push(`${rel}:${a}`)
      }
    }
  }
  return saida
}

/**
 * Os NOMES internos (V1/V2, 16/11): identificador (variável, função, tipo,
 * componente, atributo `data-*`) e nome de arquivo também dizem "rede" e
 * "unidade". Ficam: o adjetivo ("foto clínica": `foto_clinica`,
 * `FOTO_CLINICA`, `CATEGORIAS_CLINICAS`, `includes_clinical`), a chave
 * gravada no banco (`CLINICA` do canal de assinatura e da regra da comissão,
 * `aguardando_clinica` da situação do chamado),
 * a variável de ambiente (`CLINICA_URL`), a rota que já existe
 * (`/auth/clinicas`) e as migrations (o nome de arquivo é histórico). O site
 * (`apps/site`) fica de fora, como na trava do texto: lá é o mercado.
 */
const NOME_VELHO = /filia(?:l|is)|(?<!(?:foto|FOTO|CATEGORIAS)[_-]?)cl[ií]nicas?(?!l|mente)/i
const NOMES_QUE_FICAM = new Set(['CLINICA', 'CLINICA_URL', 'aguardando_clinica'])
const ROTAS_QUE_FICAM = /\/app\/auth\/clinicas\//
/** Campo que espelha a chave do JSON de uma função do banco (`r.clinica` de `*_link_espiar`). */
const CHAVES_DO_BANCO: readonly (readonly [string, string])[] = [
  ['apps/web/lib/documentos/link-publico.ts', 'clinica'],
  ['apps/web/lib/pre-atendimento/link-publico.ts', 'clinica'],
]
/** As travas do vocabulário nomeiam a palavra que procuram. */
const TRAVAS_DO_VOCABULARIO = /(?:vocabulario-no-texto|vocabulario-de-uma-unidade)\.test\.ts$|rede-de-uma-unidade\.spec\.ts$/

function identificadoresErrados(arquivo: string, texto: string): string[] {
  const fonte = ts.createSourceFile(arquivo, texto, ts.ScriptTarget.Latest, true, arquivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const saida: string[] = []
  const visitar = (no: ts.Node) => {
    if ((ts.isIdentifier(no) || ts.isPrivateIdentifier(no)) && NOME_VELHO.test(no.text) && !NOMES_QUE_FICAM.has(no.text)) {
      const { line } = fonte.getLineAndCharacterOfPosition(no.getStart())
      saida.push(`${line + 1}: ${no.text}`)
    }
    ts.forEachChild(no, visitar)
  }
  visitar(fonte)
  return saida
}

function nomesErrados(): string[] {
  const pastas = [...PASTAS, join(RAIZ, 'e2e'), join(RAIZ, 'e2e-site'), join(RAIZ, 'tests'), join(RAIZ, 'scripts')]
  const saida: string[] = []
  for (const pasta of pastas) {
    for (const f of arquivos(pasta)) {
      const rel = relative(MONO, f).split(sep).join('/')
      if (NOME_VELHO.test(rel.replace(ROTAS_QUE_FICAM, '/'))) saida.push(`${rel}: o nome do arquivo`)
      if (TRAVAS_DO_VOCABULARIO.test(rel)) continue
      for (const a of identificadoresErrados(f, readFileSync(f, 'utf8'))) {
        const nome = a.slice(a.indexOf(': ') + 2)
        if (CHAVES_DO_BANCO.some(([arq, n]) => arq === rel && n === nome)) continue
        saida.push(`${rel}:${a}`)
      }
    }
  }
  return saida
}

/**
 * V0 nos TÍTULOS dos testes: o título diz quem faz pela PERMISSÃO ("quem tem a
 * Agenda sem o Prontuário") ou pela abrangência ("quem tem só a unidade B"),
 * nunca pelo cargo ("a recepção", "a gerente", "a contadora", "o SDR"). Ficam:
 * o NOME de um cargo-modelo dito como modelo ("o Gerente modelo", "o modelo
 * Recepcionista"), os papéis FIXOS da equipe da plataforma (ADMIN, GERENTE,
 * SUPORTE — `apps/sistema`) e o nome que a rede deu a um número de WhatsApp.
 */
const CARGO_NO_TITULO = /(?<![\w-])(?:recep[çc][ãa]o|recepcionistas?|gerentes?|contadoras?|SDRs?)(?![\w-])/i
/** O nome do cargo-modelo como modelo: some antes de procurar. */
const CARGO_MODELO = /\b(?:modelos?|cargo-modelo)\s+["“]?(?:Gerente|Recepcionista)\b|\b(?:Gerente|Recepcionista)["”]?\s+modelo\b/g
/** Os arquivos da equipe da PLATAFORMA (o papel é fixo de verdade) e a própria trava. */
const TITULOS_DA_PLATAFORMA = /(?:^|\/)(?:e2e\/plataforma-gerente\.spec|e2e\/sistema-[\w-]+\.spec|e2e\/planos-comparativo\.spec|tests\/plataforma-hosts\.test|tests\/vocabulario-no-texto\.test)\.ts$/
/** O nome que a rede deu a um número de WhatsApp (arquivo, começo do título). */
const TITULOS_COM_NOME: readonly (readonly [string, string])[] = [
  ['apps/web/e2e/whatsapp-remover-numero.spec.ts', 'r3-f14-11: o filtro "Número" escolhe VÁRIOS números — Recepção + Comercial'],
]

/** Os títulos (o primeiro argumento de test/it/describe e variações) que falam no cargo. */
function titulosComCargo(arquivo: string, texto: string): string[] {
  const fonte = ts.createSourceFile(arquivo, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const saida: string[] = []
  const visitar = (no: ts.Node) => {
    if (ts.isCallExpression(no) && /^(?:test|it|describe)(?:\.\w+)*$/.test(no.expression.getText(fonte))) {
      const arg = no.arguments[0]
      let titulo: string | null = null
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) titulo = arg.text
      else if (arg && ts.isTemplateExpression(arg)) titulo = [arg.head.text, ...arg.templateSpans.map(s => s.literal.text)].join('…')
      if (arg && titulo !== null && CARGO_NO_TITULO.test(titulo.replace(CARGO_MODELO, ''))) {
        const { line } = fonte.getLineAndCharacterOfPosition(arg.getStart(fonte))
        saida.push(`${line + 1}: ${titulo.replace(/\s+/g, ' ').trim()}`)
      }
    }
    ts.forEachChild(no, visitar)
  }
  visitar(fonte)
  return saida
}

function titulosErrados(): string[] {
  const alvos: [string, RegExp][] = [[join(RAIZ, 'e2e'), /\.spec\.ts$/], [join(RAIZ, 'tests'), /\.test\.ts$/]]
  const saida: string[] = []
  for (const [pasta, fim] of alvos) {
    for (const f of arquivos(pasta)) {
      if (!fim.test(f)) continue
      const rel = relative(MONO, f).split(sep).join('/')
      if (TITULOS_DA_PLATAFORMA.test(rel)) continue
      for (const a of titulosComCargo(f, readFileSync(f, 'utf8'))) {
        const titulo = a.slice(a.indexOf(': ') + 2)
        if (TITULOS_COM_NOME.some(([arq, ini]) => arq === rel && titulo.startsWith(ini))) continue
        saida.push(`${rel}:${a}`)
      }
    }
  }
  return saida
}

describe('Vocabulário: o texto que se lê fala o sistema revisado', { timeout: 120_000 }, () => {
  it('V1 / PO2 / CA1: nenhuma tela, aviso, e-mail ou erro diz "clínica"', () => {
    expect(errados(CLINICA), 'é "a rede" ou o nome dela ("clínica" só no site, como mercado)').toEqual([])
  })

  it('V2: nenhum texto diz "filial"', () => {
    expect(errados(FILIAL), 'a palavra é "unidade"').toEqual([])
  })

  it('CG1 / CG2: nada de "Recebimentos" nem "Termos e contratos"', () => {
    expect(errados(NOMES_VELHOS), 'é "PDV" e "Documentos"').toEqual([])
  })

  it('FC1 fora das Configurações: nada de "ficha do procedimento" — é "ficha de atendimento"', () => {
    expect(errados(/fichas? d[eo]s? procedimentos?/i), 'é "ficha de atendimento"').toEqual([])
  })

  it('V0: nenhum cargo como se fosse fixo ("a recepção", "a gerente", "a contadora")', () => {
    expect(errados(CARGO_FIXO), 'fala-se em permissão, em "a equipe" ou em "quem atende"').toEqual([])
  })

  it('V0 nos títulos dos testes: quem faz é dito pela permissão, nunca pelo cargo', () => {
    expect(titulosErrados(), 'diga a permissão ("quem tem a Agenda sem o Prontuário") ou a abrangência ("quem tem só a unidade B")').toEqual([])
  })

  it('a trava dos títulos enxerga o cargo e deixa o cargo-modelo e o que não é título', () => {
    const exemplo = [
      "test('a recepção arquiva a cliente', async () => {})",
      "test.describe.serial('o SDR de unidade agenda', () => {})",
      "it(`a contadora baixa o CSV de ${mes}`, () => {})",
      "test('o Gerente modelo da rede nova nasce com Configurações em Gerenciar', async () => {})",
      "test('o modelo Recepcionista vê as próprias comissões', async () => {})",
      "const nome = 'a recepção'; expect(nome).toBe('a gerente')",
      "test('quem tem a Agenda sem o Prontuário não recebe a anamnese', async () => {})",
      "test('a gerente de unidade fixa, no cargo modelo, abre a aba Unidade', async () => {})",
    ].join('\n')
    expect(titulosComCargo('exemplo.spec.ts', exemplo).map(l => l.split(':')[0])).toEqual(['1', '2', '3', '8'])
    expect(TITULOS_DA_PLATAFORMA.test('apps/web/e2e/plataforma-gerente.spec.ts')).toBe(true)
    expect(TITULOS_DA_PLATAFORMA.test('apps/web/e2e/permissoes-config-de-quem-tem-uma-unidade.spec.ts')).toBe(false)
  })

  it('o crédito vendido tem UM nome na equipe: "Crédito interno" (o rótulo de INTERNAL_CREDIT), nunca "Crédito na rede"', () => {
    expect(errados(/cr[ée]dito na rede/i), 'é "Crédito interno" (e "Seu crédito" no app da cliente)').toEqual([])
  })

  it('V1 / V2 nos nomes internos: nenhum identificador nem arquivo diz "clínica" ou "filial"', () => {
    expect(nomesErrados(), 'é "rede" ou "unidade" também no código (16/11)').toEqual([])
  })

  it('a trava dos nomes internos enxerga o identificador e deixa o adjetivo, a chave e o env', () => {
    const exemplo = [
      'const recusaDaConfigDaClinica = 1',
      'let filial = 2',
      'type Filial = { id: string }',
      'const x = <p data-a-clinica />',
      "const k = { CLINICA: 'na tela' }",
      'const u = process.env.CLINICA_URL',
      "const f = 'foto_clinica'; const FOTO_CLINICA = 1; const CATEGORIAS_CLINICAS = 2",
      'const includes_clinical = true',
    ].join('\n')
    expect(identificadoresErrados('exemplo.tsx', exemplo).map(l => l.split(':')[0])).toEqual(['1', '2', '3', '4'])
    expect(NOME_VELHO.test('apps/web/app/auth/clinicas/page.tsx'.replace(ROTAS_QUE_FICAM, ''))).toBe(false)
    expect(NOME_VELHO.test('cartao-da-clinica.tsx')).toBe(true)
    expect(NOME_VELHO.test('atendimento-foto-clinica.spec.ts')).toBe(false)
  })

  it('a trava de "clínica" enxerga o nome e deixa o adjetivo e o código', () => {
    const exemplo = [
      'const a = <p>Crédito na clínica</p>',
      "const b = 'Fale com a clínica.'",
      'const c = `Esta ${x} é da clínica toda`',
      "const d = 'A anotação clínica fica no prontuário.'",
      "const e = 'Nova foto clínica'",
      "const f = { origem: 'CLINICA', env: 'CLINICA_URL não configurada' }",
      "const g = aClinicaDoEndereco(slug) // a clínica",
      "const h = '/auth/clinicas'",
      "console.error('[clinica] falhou')",
      "const i = 'Clínicas'",
    ].join('\n')
    const r = achados('exemplo.tsx', exemplo, CLINICA)
    expect(r.map(l => l.split(':')[0])).toEqual(['1', '2', '3', '10'])
  })

  it('a trava de cargo pega também o exemplo de nome de cargo', () => {
    const exemplo = [
      "const a = 'Fale com a recepção.'",
      '<input placeholder="Ex.: Recepção" />',
      "const b = 'O pagamento é confirmado pela recepcionista.'",
      "const c = <p>A contadora baixa o CSV</p>",
    ].join('\n')
    expect(achados('exemplo.tsx', exemplo, CARGO_FIXO).map(l => l.split(':')[0])).toEqual(['1', '2', '3', '4'])
  })
})
