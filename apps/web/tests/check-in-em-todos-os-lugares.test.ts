import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'

/**
 * O nome da situação ARRIVED e do gesto que a marca é "Check-in", em todo
 * lugar (o Heitor, 27/11, à pergunta do botão da tela do atendimento —
 * "Check-in" ou "Chegou"?: "Fica "Check-in"", com o comentário "Fica
 * Check-in em todos os lugares"). A agenda, as listas, o painel, os
 * relatórios, o app da cliente, a linha do tempo, os avisos, o Copilot e as
 * frases da Auditoria dizem "Check-in" — não "Chegou" nem "chegada".
 *
 * A trava lê o TEXTO que se lê, pela árvore do TypeScript (como a do
 * vocabulário): o texto do JSX e as strings de frase, nos apps da
 * plataforma, no núcleo e nos tipos. O comentário e o identificador
 * (`chegarEIniciar`, `semChegada`, `lib/agenda/chegada.ts`) não contam: só o
 * texto à vista muda. "Chegou"/"chegada" em OUTRO sentido (o e-mail que não
 * chegou, o plano que chegou ao limite, a entrada de mercadoria) fica na
 * lista abaixo, uma a uma, com o começo do texto.
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
  ...['sistema', 'suporte', 'site'].flatMap(a => ['app', 'actions', 'lib', 'components'].map(d => join(MONO, 'apps', a, d))),
  join(MONO, 'packages', 'nucleo', 'src'),
  join(MONO, 'packages', 'types', 'src'),
]

/** "Chegou", "chegou", "chegada", "chegadas", "chegar" (a chegada da cliente). */
const CHEGADA = /(?<![\w-])cheg(?:ou|ada|adas|ar)(?![\w-])/i

/** Fora da tela: o log, o import, o tipo literal, a comparação com o dado gravado. */
function foraDaTela(no: ts.Node): boolean {
  if (ts.isLiteralTypeNode(no.parent)) return true
  if (ts.isBinaryExpression(no.parent) && /^[!=]==?$/.test(no.parent.operatorToken.getText())) return true
  for (let p = no.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && /^console\./.test(p.expression.getText())) return true
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true
  }
  return false
}

function achados(arquivo: string, texto: string): string[] {
  const fonte = ts.createSourceFile(arquivo, texto, ts.ScriptTarget.Latest, true, arquivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const saida: string[] = []
  const anotar = (no: ts.Node, s: string) => {
    if (!CHEGADA.test(s)) return
    const { line } = fonte.getLineAndCharacterOfPosition(no.getStart())
    saida.push(`${line + 1}: ${s.replace(/\s+/g, ' ').trim().slice(0, 140)}`)
  }
  const visitar = (no: ts.Node) => {
    if (ts.isJsxText(no)) anotar(no, no.text)
    // A chave de uma palavra só em minúsculas ('chegou' de um estado da tela) não é
    // texto à vista; o rótulo de uma palavra só tem a trava dos mapas, abaixo.
    else if ((ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) && !foraDaTela(no) && !/^[a-z_]+$/.test(no.text)) anotar(no, no.text)
    else if (ts.isTemplateExpression(no) && !foraDaTela(no)) anotar(no, [no.head.text, ...no.templateSpans.map(s => s.literal.text)].join('…'))
    ts.forEachChild(no, visitar)
  }
  visitar(fonte)
  return saida
}

/**
 * Os outros sentidos de "chegou"/"chegada" (arquivo, começo do texto): não
 * é a cliente que chegou à unidade.
 */
const OUTROS_SENTIDOS: readonly (readonly [string, string])[] = [
  // o limite do plano da rede
  ['apps/web/actions/branches.ts', 'O plano da sua rede chegou ao limite'],
  ['apps/web/components/shared/tela-de-erro.tsx', 'O plano chegou ao limite'],
  ['apps/web/lib/erro-na-tela.ts', 'O plano chegou ao limite'],
  // o horário que ainda não começou (a falta só depois do início)
  ['apps/web/actions/appointments.ts', 'O horário ainda não chegou'],
  // a ficha de saúde que a cliente mandou
  ['apps/web/app/privacidade/page.tsx', '. A notificação diz que a ficha chegou'],
  ['apps/web/lib/pre-atendimento/link-publico.ts', 'Tudo certo: a sua ficha já chegou'],
  // a entrada de mercadoria no estoque
  ['apps/web/components/admin/admin-stock-manage-modal.tsx', 'Ex.: chegou com a caixa amassada'],
  // o número de WhatsApp gravado (ou não)
  ['apps/web/components/admin/conectar-whatsapp-meta.tsx', 'A conexão não terminou'],
  // o e-mail com o link da senha
  ['apps/web/lib/clients/acesso-pendente.ts', 'O acesso espera a pessoa criar a senha'],
  // o dado que veio no gatilho da automação
  ['apps/web/lib/automacoes/disponiveis.ts', 'O que chegou no gatilho'],
  ['apps/web/components/admin/automacoes/painel-do-no.tsx', 'A lista acima insere a variável'],
  // o verbo, de quem vem à unidade ou da mensagem que vem (não o nome da situação)
  ['apps/web/components/admin/inbox-quick-replies.tsx', 'Nenhuma resposta rápida ainda'],
  ['apps/web/components/admin/settings-pre-atendimento.tsx', 'As perguntas sobre a cliente'],
  ['apps/web/components/admin/uazapi-connect.tsx', 'Reaplica webhook, ritmo e proxy'],
  // a cortesia da assinatura da rede que acabou
  ['packages/nucleo/src/lib/plataforma/auditoria.ts', 'Uma cortesia ou um desconto chegou ao fim'],
  // É a situação ARRIVED, mas no checkout do plano, que outra frente estava
  // mudando em 27/11: vira "no check-in da primeira sessão" junto dela, e sai daqui.
]

function errados(): string[] {
  const saida: string[] = []
  for (const pasta of PASTAS) {
    for (const f of arquivos(pasta)) {
      const rel = relative(MONO, f).split(sep).join('/')
      for (const a of achados(f, readFileSync(f, 'utf8'))) {
        const texto = a.slice(a.indexOf(': ') + 2)
        if (OUTROS_SENTIDOS.some(([arq, ini]) => arq === rel && texto.startsWith(ini))) continue
        saida.push(`${rel}:${a}`)
      }
    }
  }
  return saida
}

/** Todo mapa de rótulo por situação (`ARRIVED: '…'`, `CHECKIN: '…'`) diz "Check-in". */
function rotulosDaSituacao(): string[] {
  const saida: string[] = []
  for (const pasta of PASTAS) {
    for (const f of arquivos(pasta)) {
      const rel = relative(MONO, f).split(sep).join('/')
      const texto = readFileSync(f, 'utf8')
      const fonte = ts.createSourceFile(f, texto, ts.ScriptTarget.Latest, true, f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
      const visitar = (no: ts.Node) => {
        // Só o mapa de NOMES (o que tem o "Agendado"/"Confirmado" ao lado), não o de cores.
        const ehMapaDeNomes = (obj: ts.Node) => ts.isObjectLiteralExpression(obj) && obj.properties.some(p =>
          ts.isPropertyAssignment(p) && /^(SCHEDULED|CONFIRMED|CREATED)$/.test(p.name.getText(fonte))
          && /agendado|confirmado/i.test(p.initializer.getText(fonte)))
        if (ts.isPropertyAssignment(no) && /^(ARRIVED|CHECKIN)$/.test(no.name.getText(fonte)) && ehMapaDeNomes(no.parent)) {
          const valor = no.initializer
          const textos: string[] = []
          if (ts.isStringLiteral(valor) || ts.isNoSubstitutionTemplateLiteral(valor)) textos.push(valor.text)
          else if (ts.isObjectLiteralExpression(valor)) {
            for (const p of valor.properties) {
              if (ts.isPropertyAssignment(p) && /^(label|rotulo)$/.test(p.name.getText(fonte))
                && (ts.isStringLiteral(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer))) textos.push(p.initializer.text)
            }
          }
          for (const t of textos) {
            // O rótulo começa por "Check-in"; a forma da frase do Copilot ("com o check-in feito") o diz no meio.
            if (!/(^|\s)check-in\b/i.test(t)) {
              const { line } = fonte.getLineAndCharacterOfPosition(no.getStart(fonte))
              saida.push(`${rel}:${line + 1}: ${t}`)
            }
          }
        }
        ts.forEachChild(no, visitar)
      }
      visitar(fonte)
    }
  }
  return saida
}

describe('"Check-in" em todos os lugares (a situação ARRIVED e o gesto que a marca)', () => {
  it('nenhum texto à vista diz "Chegou" nem "chegada" pela cliente que chegou', () => {
    expect(errados()).toEqual([])
  }, 60_000)

  it('todo rótulo da situação ARRIVED (e da ação CHECKIN do histórico) é "Check-in"', () => {
    expect(rotulosDaSituacao()).toEqual([])
  }, 60_000)

  it('o nome único da situação é "Check-in"', async () => {
    const { ROTULO_DO_STATUS } = await import('@/lib/agenda/rotulo-do-status')
    expect(ROTULO_DO_STATUS.ARRIVED).toBe('Check-in')
  })

  it('o evento da automação, a linha do tempo e a ação do histórico', async () => {
    const { ROTULOS_DE_EVENTO } = await import('@estetica-os/types')
    expect(ROTULOS_DE_EVENTO['agendamento.check_in']).toBe('Check-in feito')
    const { eventosDeConfirmacaoEChegada, rotuloDaAcao } = await import('@/lib/clients/historico-do-agendamento')
    const ev = eventosDeConfirmacaoEChegada({ id: 'x', procedureName: 'Limpeza', confirmed_at: null, arrived_at: '2026-11-27T13:00:00Z' }, null)
    expect(ev[0]!.title).toBe('Check-in: Limpeza')
    expect(rotuloDaAcao('CHECKIN', 'Check-in realizado — cliente chegou')).toBe('Check-in')
  })

  it('a Auditoria chama o campo arrived_at de "check-in"', () => {
    expect(readFileSync(join(RAIZ, 'lib/auditoria/frase.ts'), 'utf8')).toMatch(/arrived_at: 'check-in'/)
  })

  it('a Minha agenda diz o atraso de quem já fez o check-in', async () => {
    const fonte = readFileSync(join(RAIZ, 'lib/agenda/minha-agenda.ts'), 'utf8')
    expect(fonte.match(/status === 'ARRIVED' \? `([^`]*)`/)?.[1]).toBe('Check-in · atrasado ${min} min')
  })
})
