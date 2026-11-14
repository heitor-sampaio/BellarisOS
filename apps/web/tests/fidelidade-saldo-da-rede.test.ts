import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * FD3 do plano de adaptação (o Heitor, 2026-11-13: "concordo"): "pontos só na
 * unidade" saiu. A cliente é da rede e qualquer unidade a atende; o saldo é
 * sempre UM, da rede. Saíram junto a escolha "Onde os pontos valem" (a
 * `scope_per_branch`), o saldo por unidade (`saldos_por_unidade`) e o
 * parâmetro de unidade das contas do saldo (`saldo_de_pontos`,
 * `pontos_expirando`, `fidelidade_a_expirar`). O `branch_id` de cada
 * lançamento continua: é o FATO de onde ele aconteceu (o extrato o mostra),
 * nunca um recorte do saldo.
 *
 * Esta é a trava: o código e a ÚLTIMA definição de cada função nas
 * migrations não podem trazer a opção nem o saldo por unidade de volta.
 */

const RAIZ = join(__dirname, '..')
const MONO = join(RAIZ, '..', '..')
const MIGRATIONS = join(MONO, 'supabase', 'migrations')

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
  join(MONO, 'apps', 'sistema'), join(MONO, 'apps', 'suporte'),
  join(MONO, 'packages', 'nucleo', 'src'), join(MONO, 'packages', 'types', 'src'),
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

/** A última definição de cada função nas migrations (a que vale no banco), pelo nome. */
function ultimasDefinicoes(): Map<string, { arquivo: string; corpo: string }> {
  const defs = new Map<string, { arquivo: string; corpo: string }>()
  const nomes = readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort()
  for (const nome of nomes) {
    const texto = readFileSync(join(MIGRATIONS, nome), 'utf8')
    const re = /create\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\(/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(texto))) {
      const funcao = m[1]!.replace(/"/g, '').toLowerCase()
      const chave = funcao.includes('.') ? funcao : `public.${funcao}`
      // O corpo vai do nome até o fim do dólar-quote que abre depois dele.
      const resto = texto.slice(m.index)
      const abre = /\$(\w*)\$/.exec(resto)
      if (!abre) continue
      const fim = resto.indexOf(abre[0], abre.index + abre[0].length)
      defs.set(chave, { arquivo: nome, corpo: resto.slice(0, fim < 0 ? undefined : fim + abre[0].length) })
    }
    // Função apagada (drop function) deixa de valer.
    const drop = /drop\s+function\s+(?:if\s+exists\s+)?([\w."]+)/gi
    while ((m = drop.exec(texto))) {
      const funcao = m[1]!.replace(/"/g, '').toLowerCase()
      const chave = funcao.includes('.') ? funcao : `public.${funcao}`
      const atual = defs.get(chave)
      // Só a apaga se a definição não veio DEPOIS do drop, no mesmo arquivo.
      if (atual && (atual.arquivo !== nome || texto.indexOf(atual.corpo) < m.index)) defs.delete(chave)
    }
  }
  return defs
}

describe('FD3: o saldo de pontos é um só, da rede', () => {
  it('o código não fala mais da abrangência por unidade', () => {
    const proibidos = /scope_per_branch|saldos_por_unidade|saldosPorUnidade|redeTemLancamentos|abrangencia-travada|saldo-por-unidade/
    const achados = codigo.filter(c => proibidos.test(c.texto)).map(c => c.arquivo)
    expect(achados, 'a opção "só na unidade" e o saldo por unidade saíram (FD3)').toEqual([])
  })

  it('nenhuma conta do saldo recebe unidade (rpc sem p_unidade)', () => {
    const achados: string[] = []
    for (const c of codigo) {
      const re = /\.rpc\(\s*'(saldo_de_pontos|pontos_expirando|fidelidade_a_expirar)'/g
      let m: RegExpExecArray | null
      while ((m = re.exec(c.texto))) {
        const abre = c.texto.indexOf('(', m.index + 4)
        if (/p_unidade/.test(argumento(c.texto, abre))) achados.push(`${c.arquivo}: ${m[1]}`)
      }
    }
    expect(achados).toEqual([])
  })

  it('saldoDoCliente e pontosVencendo não têm o parâmetro da unidade', () => {
    const leitura = readFileSync(join(RAIZ, 'lib', 'fidelidade', 'leitura.ts'), 'utf8')
    expect(leitura).toMatch(/export async function saldoDoCliente\(clientId: string, admin/)
    expect(leitura).toMatch(/export async function pontosVencendo\(clientId: string, dias = 30, admin/)
  })

  it('a última definição de cada função no banco não lê a abrangência nem o saldo por unidade', () => {
    const defs = ultimasDefinicoes()
    const achados = [...defs.entries()]
      .filter(([, d]) => /scope_per_branch|saldos_por_unidade/.test(d.corpo))
      .map(([nome, d]) => `${nome} (${d.arquivo})`)
    expect(achados, 'função que ainda recorta o saldo por unidade').toEqual([])
    expect(defs.has('public.saldos_por_unidade'), 'saldos_por_unidade saiu').toBe(false)
    for (const f of ['public.saldo_de_pontos', 'public.pontos_expirando', 'public.fidelidade_a_expirar']) {
      const d = defs.get(f)
      expect(d, `${f} existe`).toBeDefined()
      expect(/p_unidade/.test(d!.corpo), `${f} sem p_unidade (${d!.arquivo})`).toBe(false)
    }
  })

  it('a coluna da abrangência sai da tabela da configuração', () => {
    const nomes = readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort()
    const drop = nomes.find(n => /alter\s+table\s+public\.loyalty_configs\s+drop\s+column\s+(if\s+exists\s+)?scope_per_branch/i
      .test(readFileSync(join(MIGRATIONS, n), 'utf8')))
    expect(drop, 'uma migration dropa loyalty_configs.scope_per_branch').toBeDefined()
    // E nenhuma depois dela a recria.
    for (const n of nomes.filter(n => n > drop!)) {
      expect(/add\s+column\s+(if\s+not\s+exists\s+)?scope_per_branch/i.test(readFileSync(join(MIGRATIONS, n), 'utf8')), n).toBe(false)
    }
  })
})
