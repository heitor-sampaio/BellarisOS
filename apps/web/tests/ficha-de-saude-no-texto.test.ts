import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'

/**
 * PR3 do bloco Prontuário (a revisão do Heitor, 2026-11-13): a mesma coisa
 * aparecia como "ficha de pré-atendimento", "ficha de saúde" e "anamnese".
 * Fica "Ficha de saúde" — que a cliente entende, é ela quem responde — em
 * toda tela, mensagem e aviso: a equipe, o app da cliente, o link público,
 * Configurações → Fichas e o Copilot. O nome no CÓDIGO e no BANCO fica
 * (`pre_atendimentos`, `general_anamnesis`, `/pre-atendimento/…`).
 *
 * A trava lê o TEXTO que se lê: o texto do JSX e as strings de frase (com
 * espaço, ou começando por maiúscula), pela árvore do TypeScript — o
 * comentário e o identificador (`anamneseGeral`) não contam, nem o caminho
 * (`/cliente/pre-atendimento`) nem a chave (`'anamnese'`), nem o log.
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
  join(MONO, 'packages', 'nucleo', 'src'),
  join(MONO, 'packages', 'types', 'src'),
]

/** O nome velho, na frase: "pré-atendimento" (com ou sem acento) e "anamnese(s)". */
const NOME_VELHO = /(?<![/\w-])pr[eé]-atendimentos?(?![\w-])|(?<![/\w-])anamneses?(?![\w-])/i

/** A string é frase (texto que alguém lê) — e não chave, caminho ou id? */
function ehFrase(s: string): boolean {
  return /\s/.test(s) || /^[A-ZÀ-Ú]/.test(s) || /pré-atendimento/i.test(s)
}

/** Dentro de console.*? O log não é texto da tela. */
function dentroDoLog(no: ts.Node): boolean {
  for (let p = no.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      const alvo = p.expression.getText()
      if (/^console\./.test(alvo)) return true
    }
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true
  }
  return false
}

function achados(arquivo: string, texto: string, nomeVelho: RegExp = NOME_VELHO): string[] {
  const fonte = ts.createSourceFile(arquivo, texto, ts.ScriptTarget.Latest, true, arquivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const saida: string[] = []
  const anotar = (no: ts.Node, s: string) => {
    if (!nomeVelho.test(s)) return
    const { line } = fonte.getLineAndCharacterOfPosition(no.getStart())
    saida.push(`${line + 1}: ${s.replace(/\s+/g, ' ').trim().slice(0, 120)}`)
  }
  const visitar = (no: ts.Node) => {
    if (ts.isJsxText(no)) anotar(no, no.text)
    else if ((ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) && !dentroDoLog(no)) {
      const naPropriedade = ts.isJsxAttribute(no.parent) && /^(placeholder|title|aria-label|alt|label)$/i.test(no.parent.name.getText())
      if (naPropriedade || ehFrase(no.text)) anotar(no, no.text)
    } else if (ts.isTemplateExpression(no) && !dentroDoLog(no)) {
      const partes = [no.head.text, ...no.templateSpans.map(s => s.literal.text)].join(' … ')
      if (ehFrase(partes)) anotar(no, partes)
    }
    ts.forEachChild(no, visitar)
  }
  visitar(fonte)
  return saida
}

describe('PR3: "Ficha de saúde" em todo texto que se lê', { timeout: 60_000 }, () => {
  it('nenhuma tela, mensagem ou aviso diz "pré-atendimento" nem "anamnese"', () => {
    const errados: string[] = []
    for (const pasta of PASTAS) {
      for (const f of arquivos(pasta)) {
        const rel = relative(MONO, f).split(sep).join('/')
        for (const a of achados(f, readFileSync(f, 'utf8'))) errados.push(`${rel}:${a}`)
      }
    }
    expect(errados, 'o texto diz "Ficha de saúde" (o nome no código e no banco fica)').toEqual([])
  })

  it('a trava enxerga o texto e deixa o código', () => {
    const exemplo = [
      'const a = <p>Ficha de pré-atendimento</p>',
      "const b = 'Responda a anamnese'",
      'const c = `A ${x} respondeu a anamnese`',
      "const d = anamneseGeral.respostas // a anamnese",
      "const e = `/${slug}/cliente/pre-atendimento`",
      "const f = { referencia: 'anamnese' }",
      "console.error('[anamnese] falhou ao gravar')",
      "import { x } from '@/lib/anamnese-geral'",
    ].join('\n')
    const r = achados('exemplo.tsx', exemplo)
    expect(r.map(l => l.split(':')[0])).toEqual(['1', '2', '3'])
  })
})

/**
 * FC1 do Bloco Fichas (o Heitor, 2026-11-13): em Configurações → Fichas, as
 * fichas dos procedimentos se chamam "Fichas de atendimento" — nas abas, nos
 * botões e nas dicas — e a da cliente, "Ficha de saúde" (a trava de cima). O
 * nome velho, "ficha do procedimento", sai do texto que se lê nesta tela.
 */
const TELA_DE_FICHAS = [
  'components/admin/settings-fichas.tsx',
  'components/admin/construtor-de-ficha.tsx',
  'components/admin/settings-pre-atendimento.tsx',
].map(f => join(RAIZ, f))

const FICHA_DO_PROCEDIMENTO = /fichas? d[eo]s? procedimentos?/i

describe('FC1: "Fichas de atendimento" em Configurações → Fichas', () => {
  it('a tela não diz "ficha do procedimento" no texto que se lê', () => {
    const errados = TELA_DE_FICHAS.flatMap(f => achados(f, readFileSync(f, 'utf8'), FICHA_DO_PROCEDIMENTO).map(a => `${relative(RAIZ, f)}:${a}`))
    expect(errados).toEqual([])
  })

  it('o título, o botão de criar, o vazio e as dicas dizem "ficha de atendimento"', () => {
    const lista = readFileSync(TELA_DE_FICHAS[0]!, 'utf8')
    for (const texto of ['Fichas de atendimento', 'Nova ficha de atendimento', 'Nenhuma ficha de atendimento ainda',
      'title="Editar a ficha de atendimento"', 'title="Excluir a ficha de atendimento"']) {
      expect(lista, texto).toContain(texto)
    }
    const construtor = readFileSync(TELA_DE_FICHAS[1]!, 'utf8')
    expect(construtor).toContain('Nome da ficha de atendimento')
    expect(construtor).not.toMatch(/'(Salvar|Criar) ficha'/)
    expect(readFileSync(TELA_DE_FICHAS[2]!, 'utf8'), 'o construtor da ficha de saúde fala dela').toContain('nomeDaFicha="ficha de saúde"')
  })
})
