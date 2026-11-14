import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import * as utils from '@estetica-os/utils'
import { ROTULOS_DE_NO, NODES } from '@estetica-os/types'
import { camposDoDestino } from '@/lib/importacao/campos'

/**
 * A regra das Tags (o Heitor, 2026-11-13 — CLAUDE.md §1, "Tags"; o "Bloco:
 * Tags" do plano de adaptação, T1–T4): "O sistema não coloca tag nenhuma
 * automaticamente em ninguém por nenhum motivo". Tag é filtro da rede: quem
 * grava é a PESSOA (a ficha, o card, o painel do inbox, a planilha que ela
 * importa, o Copilot que ela manda) ou a ação "Adicionar tag" de uma
 * automação que a rede montou. E não existe "tag de unidade" (H16): nenhum
 * caminho lê uma tag como "a unidade da cliente".
 *
 * Esta é a trava: um caminho NOVO que grava `tags` entra na lista abaixo com
 * o porquê — ou é o sistema pondo tag sozinho, e não entra.
 */

const RAIZ = join(__dirname, '..')
const MONO = join(RAIZ, '..', '..')

function arquivos(dir: string, saida: string[] = []): string[] {
  if (!existsSync(dir)) return saida
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) { if (!['node_modules', '.next', 'dist'].includes(nome)) arquivos(caminho, saida) }
    else if (/\.(ts|tsx)$/.test(nome)) saida.push(caminho)
  }
  return saida
}

const codigo = [
  ...['app', 'actions', 'lib', 'components'].map(d => join(RAIZ, d)),
  join(MONO, 'packages', 'nucleo', 'src'), join(MONO, 'packages', 'utils', 'src'), join(MONO, 'packages', 'types', 'src'),
].flatMap(d => arquivos(d))
  .map(f => ({ arquivo: relative(MONO, f).split(sep).join('/'), texto: readFileSync(f, 'utf8') }))

/** O argumento de uma chamada, a partir do `(`: os parênteses equilibrados. */
function argumento(texto: string, abre: number): string {
  let fundo = 0
  for (let i = abre; i < texto.length; i++) {
    if (texto[i] === '(') fundo++
    else if (texto[i] === ')') { fundo--; if (fundo === 0) return texto.slice(abre + 1, i) }
  }
  return texto.slice(abre + 1)
}

/**
 * Os arquivos que gravam `tags` numa das tabelas da pessoa (clients, contacts,
 * leads, conversations) por insert/update/upsert com `tags` no corpo. O corpo
 * montado longe da chamada (`.update(colunas)`) escapa desta busca — por isso
 * a lista abaixo traz também esses caminhos, conferidos à mão, e o E2E
 * `tags-sem-unidade.spec.ts` prova no banco que o agendamento não põe tag.
 */
function gravamTags(): string[] {
  const achados = new Set<string>()
  for (const c of codigo) {
    const re = /\.from\(\s*'(clients|contacts|leads|conversations)'\s*\)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(c.texto))) {
      const resto = c.texto.slice(m.index, m.index + 400)
      const op = /\.(insert|update|upsert)\(/.exec(resto)
      if (!op) continue
      const corpo = argumento(c.texto, m.index + op.index + op[0].length - 1)
      if (/\btags\b/.test(corpo)) achados.add(c.arquivo)
    }
  }
  return [...achados].sort()
}

/** Quem grava `tags`, e por que é a PESSOA (ou a ação que a rede montou). */
const QUEM_PODE: Record<string, string> = {
  'apps/web/actions/clients.ts': 'o cadastro e a ficha: as tags que a pessoa marcou',
  'apps/web/actions/leads.ts': 'o card da oportunidade: as tags que a pessoa marcou',
  'apps/web/actions/inbox.ts': 'o painel do inbox: as tags da pessoa, marcadas por quem atende',
  'apps/web/lib/clients/atualizar.ts': 'a ficha (atualizarClienteCore): as tags que a pessoa marcou',
  'apps/web/lib/clients/ja-existe.ts': 'o "Unificar": junta as tags que a pessoa marcou nas duas fichas',
  'apps/web/lib/crm/oportunidade.ts': 'a oportunidade criada: as tags que a pessoa marcou (a origem não vira tag)',
  'apps/web/lib/importacao/processar.ts': 'a planilha: a coluna de tags que a pessoa importa',
  'apps/web/lib/automacoes/acoes-crm.ts': 'a ação "Adicionar tag" da automação que a rede montou',
  'apps/web/lib/copilot/ferramentas/clientes-escrita.ts': 'o Copilot: a tag que a pessoa pediu',
}

describe('Tags: só a pessoa (ou a ação "Adicionar tag") grava (T1–T4)', () => {
  it('nenhum caminho grava tags fora da lista de quem pode', () => {
    const fora = gravamTags().filter(a => !(a in QUEM_PODE))
    expect(fora, 'grava tag sem ser a pessoa — ou entra na lista com o porquê').toEqual([])
  })

  it('não existe "tag de unidade": ninguém monta nem lê a "Unidade: X" (H16, T1)', () => {
    const PADROES = /\bunitTag\b|\bisUnitTag\b|\bunitTagName\b|UNIT_TAG_PREFIX|tags_das_unidades|\bunidadeDaTag\b|getCachedBranchClients|ForaDaUnidade|Unidade: \$\{|'Unidade: ' *\+/
    const achados = codigo.filter(c => PADROES.test(c.texto)).map(c => c.arquivo)
    expect(achados).toEqual([])
    expect(Object.keys(utils)).not.toContain('unitTag')
    expect(Object.keys(utils)).not.toContain('isUnitTag')
  })

  it('a origem do anúncio não vira tag da conversa (T2)', () => {
    const d = utils.deriveLeadSource({ referral: { ctwaClid: 'c1' } }) as unknown as Record<string, unknown>
    expect(d.source).toBe('Meta Ads')
    expect(d).not.toHaveProperty('tags')
    const r = utils.resolveLeadSource({}, 'Indicação') as unknown as Record<string, unknown>
    expect(r).not.toHaveProperty('tags')
    const conversa = codigo.find(c => c.arquivo === 'apps/web/lib/inbox/resolve-conversation.ts')!
    expect(conversa.texto).not.toMatch(/derived\.tags/)
  })

  it('a importação não transforma a coluna "Origem" em tag (T3)', () => {
    // A coluna "Tags" é a da PESSOA (as tags que ela importa) e fica; a origem
    // sem oportunidade, que entrava como "Origem (vira tag da pessoa)", sai.
    const campos = camposDoDestino('contatos')
    expect(campos.map(c => c.chave)).not.toContain('op_origem')
    expect(campos.map(c => c.rotulo).join(' | ')).not.toMatch(/vira tag/i)
    const proc = codigo.find(c => c.arquivo === 'apps/web/lib/importacao/processar.ts')!
    expect(proc.texto).not.toMatch(/mergeTags\([^)]*origem/)
  })

  it('a ação da automação se chama "Adicionar tag" e só adiciona (T4)', () => {
    expect(ROTULOS_DE_NO[NODES.ACAO_TAG_CLIENTE]).toBe('Adicionar tag')
    const painel = codigo.find(c => c.arquivo === 'apps/web/components/admin/automacoes/painel-do-no.tsx')!
    expect(painel.texto).not.toMatch(/Remover a tag/)
    const acao = codigo.find(c => c.arquivo === 'apps/web/lib/automacoes/acoes-crm.ts')!
    expect(acao.texto).not.toMatch(/'remover'/)
  })
})

describe('Tags no banco: o gatilho da "Unidade: X" saiu, e ela é uma tag como as outras (T1)', () => {
  const pasta = join(MONO, 'supabase', 'migrations')
  const migrations = readdirSync(pasta).filter(n => n.endsWith('.sql')).sort()
    .map(n => ({ nome: n, sql: readFileSync(join(pasta, n), 'utf8') }))

  /** A ÚLTIMA definição de cada função nas migrations (a que vale). */
  function ultimaDefinicao(funcao: string): string | null {
    // `create function` também: a assinatura que mudou nasce de um drop + create.
    const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+${funcao.replace('.', '\\.')}\\s*\\(`, 'i')
    let achada: string | null = null
    for (const m of migrations) {
      const i = m.sql.search(re)
      if (i < 0) continue
      // Até o fim do corpo: o segundo marcador `$…$` igual ao primeiro.
      const resto = m.sql.slice(i)
      const abre = /\$[a-z_]*\$/i.exec(resto)
      if (!abre) { achada = resto.slice(0, 4000); continue }
      const fecha = resto.indexOf(abre[0], abre.index + abre[0].length)
      achada = resto.slice(0, fecha < 0 ? 4000 : fecha + abre[0].length)
    }
    return achada
  }

  it('trg_appointment_unit_tag foi apagado depois de criado', () => {
    const cria = migrations.filter(m => /create\s+trigger\s+trg_appointment_unit_tag/i.test(m.sql)).map(m => m.nome)
    const apaga = migrations.filter(m => /drop\s+trigger\s+(if\s+exists\s+)?trg_appointment_unit_tag/i.test(m.sql)).map(m => m.nome)
    expect(apaga.length, 'há uma migration que apaga o gatilho').toBeGreaterThan(0)
    expect(apaga.at(-1)! > cria.at(-1)!, 'o drop vem depois do último create').toBe(true)
  })

  it('o vocabulário registra também a "Unidade: …" (registrar_tags não a pula)', () => {
    const def = ultimaDefinicao('private.registrar_tags')
    expect(def).not.toBeNull()
    expect(def!).not.toMatch(/Unidade: /)
  })

  it('nenhuma conta de indicador nem público lê a tag como unidade', () => {
    for (const f of ['public.metrics_core', 'public.metrics_by_branch', 'public.metrics_new_clients_series',
      'public.metrics_clientes_para_reativar', 'public.clientes_do_publico']) {
      const def = ultimaDefinicao(f)
      expect(def, f).not.toBeNull()
      expect(def!, f).not.toMatch(/tags_das_unidades|'Unidade: '|p_tag\b/)
    }
  })
})
