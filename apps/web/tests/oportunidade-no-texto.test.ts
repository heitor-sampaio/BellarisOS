import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'

/**
 * CR1 do bloco CRM (a revisão do Heitor, 2026-11-13): "leads e oportunidades
 * sao entidades diferentes, pq lead é a pessoa" — e a tela chamava o CARD de
 * "lead" porque a tabela das oportunidades se chama `leads`. A pessoa é o
 * CONTATO, o card é a OPORTUNIDADE: "lead" sai de todo texto que se lê (as
 * telas, os avisos e os erros das actions, os rótulos de evento, as respostas
 * e as ferramentas do Copilot, os relatórios, as importações). O nome no
 * CÓDIGO e no BANCO fica (`leads`, `lead_events`, `leadId`).
 *
 * A trava lê o TEXTO que se lê, como a do PR3 (`ficha-de-saude-no-texto`):
 * o texto do JSX e as strings de frase (com espaço, ou começando por
 * maiúscula), pela árvore do TypeScript — o comentário, o identificador
 * (`leadId`), a chave (`'lead'`, `'lead.created'`), a coluna do PostgREST
 * (`'id, lead_id'`), o caminho e o log não contam.
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

/**
 * O nome velho, na frase: "lead" e "leads", em qualquer caixa — não `leadId`,
 * `lead_id`, `/leads/`, `lead.created`, `?lead=`, `lead:${id}`.
 */
const NOME_VELHO = /(?<![/\w.?&=-])leads?(?![\w.=-]|:\S)/i

/** A string é frase (texto que alguém lê) — e não chave, caminho ou id? */
function ehFrase(s: string): boolean {
  return /\s/.test(s) || /^[A-ZÀ-Ú]/.test(s)
}

/**
 * Fora da tela? O log (console.*), o import, o tipo (`'Lead'`, o nome do
 * evento da Meta) e as colunas de uma consulta do PostgREST (`.select(…)`,
 * `.or(…)`) não são texto que alguém lê.
 */
function dentroDoLog(no: ts.Node): boolean {
  if (ts.isLiteralTypeNode(no.parent)) return true
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

/**
 * Os SINÔNIMOS do cabeçalho na importação (`lib/importacao/campos.ts`, o
 * terceiro argumento de `p(…)`/`o(…)`): é como a planilha de outro sistema
 * costuma vir ("nome do lead"), não texto da tela — e tirá-los faria a
 * importação deixar de reconhecer a coluna.
 */
function sinonimoDaImportacao(no: ts.Node): boolean {
  const lista = no.parent
  if (!ts.isArrayLiteralExpression(lista) || !ts.isCallExpression(lista.parent)) return false
  const chamada = lista.parent
  return ts.isIdentifier(chamada.expression) && /^[po]$/.test(chamada.expression.text)
    && chamada.arguments[2] === lista && /importacao[\/]campos\.ts$/.test(no.getSourceFile().fileName)
}

function achados(arquivo: string, texto: string): string[] {
  const fonte = ts.createSourceFile(arquivo, texto, ts.ScriptTarget.Latest, true, arquivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const saida: string[] = []
  const anotar = (no: ts.Node, s: string) => {
    if (!NOME_VELHO.test(s)) return
    const { line } = fonte.getLineAndCharacterOfPosition(no.getStart())
    saida.push(`${line + 1}: ${s.replace(/\s+/g, ' ').trim().slice(0, 120)}`)
  }
  const visitar = (no: ts.Node) => {
    if (ts.isJsxText(no)) anotar(no, no.text)
    else if ((ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) && !dentroDoLog(no) && !sinonimoDaImportacao(no)) {
      const naPropriedade = ts.isJsxAttribute(no.parent) && /^(placeholder|title|aria-label|alt|label)$/i.test(no.parent.name.getText())
      // A palavra solta que é o RESULTADO de um ternário é texto: o plural
      // (`n === 1 ? 'lead' : 'leads'`) e a escolha de nome (`? 'contato' : 'lead'`).
      const noTernario = ts.isConditionalExpression(no.parent) && no.parent.condition !== no
      if (naPropriedade || noTernario || ehFrase(no.text)) anotar(no, no.text)
    } else if (ts.isTemplateExpression(no) && !dentroDoLog(no)) {
      // O pedaço de código vira '…', sem espaço: `lead:${id}` não é frase.
      const partes = [no.head.text, ...no.templateSpans.map(s => s.literal.text)].join('…')
      if (ehFrase(partes)) anotar(no, partes)
    }
    ts.forEachChild(no, visitar)
  }
  visitar(fonte)
  return saida
}

describe('CR1: "Contato" e "Oportunidade" em todo texto que se lê', { timeout: 60_000 }, () => {
  it('nenhuma tela, aviso, rótulo ou resposta do Copilot diz "lead"', () => {
    const errados: string[] = []
    for (const pasta of PASTAS) {
      for (const f of arquivos(pasta)) {
        const rel = relative(MONO, f).split(sep).join('/')
        for (const a of achados(f, readFileSync(f, 'utf8'))) errados.push(`${rel}:${a}`)
      }
    }
    expect(errados, 'o texto diz "Contato" ou "Oportunidade" (o nome no código e no banco fica)').toEqual([])
  })

  it('a trava enxerga o texto e deixa o código', () => {
    const exemplo = [
      'const a = <p>Nenhum lead disponível</p>',
      "const b = 'Lead não encontrado.'",
      'const c = `${n} leads no funil`',
      'const d = leadId ?? lead.id // o lead',
      'const e = `/${slug}/leads/${id}`',
      "const f = { tipo: 'lead', evento: 'lead.created', alias: `lead:${id}` }",
      "const g = q.select('id, leads!conversations_lead_id_fkey(name)')",
      "type H = 'Lead' | 'Schedule'",
      'const i = `${base}/oportunidades?lead=${id}`',
      "console.error('[lead] falhou ao gravar')",
      "import { x } from '@/lib/crm/lead'",
      "const j = await ler(consulta, 'carregar os leads') // vira \"Não consegui carregar os leads.\"",
      "const k = n === 1 ? 'lead' : 'leads'",
      "const l = alvo === 'lead' ? 1 : 2",
    ].join('\n')
    const r = achados('exemplo.tsx', exemplo)
    expect(r.map(l => l.split(':')[0])).toEqual(['1', '2', '3', '12', '13', '13'])
  })

  it('o Copilot é instruído a falar "contato" e "oportunidade"', () => {
    const prompt = readFileSync(join(RAIZ, 'lib', 'copilot', 'prompt.ts'), 'utf8')
    expect(prompt).toMatch(/a pessoa é o "contato" e o card do funil é a "oportunidade"/)
  })
})
