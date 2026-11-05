import fs from 'node:fs'
import path from 'node:path'
import { banco, PREFIXO } from './banco'

/**
 * A limpeza da rede de teste numa passada só no servidor — e, na completa,
 * ADIADA para o fim da rodada (F25, 2026-11-05).
 *
 * Por que existe: as completas de 2026-11-04/05 travaram o Supabase da
 * produção (instância pequena, checkpoints de ~150 s) com a própria limpeza.
 * Cada `afterAll` apagava a rede de teste dele em ~45 DELETEs pelo PostgREST
 * — ~17 mil na rodada, 400 a 700 por minuto — ENQUANTO os outros testes
 * rodavam: consultas de 6 a 35 s, `auth.admin.createUser` em 504, actions
 * "sem resposta". Agora:
 *
 * - `apagarRedeDeTeste` chama `e2e_apagar_rede` (migration 20261105000101):
 *   a rede inteira numa transação, achada pelas chaves estrangeiras — o que o
 *   teste criou nela e o `limpar()` antigo não conhecia (a segunda unidade, o
 *   pacote) também sai. A função RECUSA a rede que não é de teste;
 * - na completa (`E2E_LIMPEZA_ADIADA=1`) a rede é só ANOTADA no registro
 *   (`adiarRede`, ao nascer), o `limpar()` dela e o dos membros e clientes
 *   dela não escrevem nada, e o fim da rodada apaga todas
 *   (`apagarRedesAdiadas`, pelo `playwright.limpeza.config.ts`). O teste segue
 *   isolado: a rede é dele, ninguém mais a lê;
 * - no spec avulso (`pnpm test:e2e`), nada muda de lugar: o `limpar()` apaga
 *   na hora — só que numa chamada, não em quarenta e cinco.
 *
 * Se a rodada morrer no meio, o registro fica: o fim da próxima o lê, e a
 * varredura do começo leva toda rede `[e2e]` com mais de uma hora.
 */

type Falha = { o_que: string; erro: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A completa adia a limpeza; o spec avulso, não. */
export function limpezaAdiada(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): boolean {
  return env.E2E_LIMPEZA_ADIADA === '1'
}

/** A pasta do registro. `E2E_LIMPEZA_DIR` troca (o teste do próprio registro usa uma temporária). */
export function dirDoRegistro(): string {
  return process.env.E2E_LIMPEZA_DIR ?? path.resolve(__dirname, '..', '.limpeza')
}

/**
 * Anota a rede para o fim da rodada. Um arquivo por processo (os workers da
 * completa anotam ao mesmo tempo): ninguém escreve no arquivo do outro.
 */
export function adiarRede(tenantId: string, dir = dirDoRegistro()): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.appendFileSync(path.join(dir, `redes-${process.pid}.txt`), `${tenantId}\n`)
}

/** As redes anotadas, de todos os processos, sem repetir. */
export function lerRegistro(dir = dirDoRegistro()): string[] {
  let arquivos: string[]
  try { arquivos = fs.readdirSync(dir).filter(a => a.endsWith('.txt')) } catch { return [] }
  const ids = new Set<string>()
  for (const a of arquivos) {
    for (const linha of fs.readFileSync(path.join(dir, a), 'utf8').split(/\r?\n/)) {
      if (UUID.test(linha.trim())) ids.add(linha.trim().toLowerCase())
    }
  }
  return [...ids]
}

/** Tira do registro o que saiu; o que ficou (`restam`) continua anotado para a próxima. */
export function esvaziarRegistro(dir: string, restam: string[]): void {
  let arquivos: string[]
  try { arquivos = fs.readdirSync(dir).filter(a => a.endsWith('.txt')) } catch { return }
  for (const a of arquivos) fs.rmSync(path.join(dir, a), { force: true })
  if (restam.length) {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'redes-restantes.txt'), restam.map(r => `${r}\n`).join(''))
  }
}

/** A rede é da completa e vai sair no fim: quem limpa dentro dela não escreve nada agora. */
export function redeAdiada(tenantId: string | null | undefined, dir = dirDoRegistro()): boolean {
  if (!tenantId || !limpezaAdiada()) return false
  return lerRegistro(dir).includes(tenantId.toLowerCase())
}

/**
 * A MESMA trava de `e2e_eh_rede_de_teste` (no banco é ela que decide; esta é
 * a do lado de cá, para a varredura nem pedir). O prefixo `[e2e]` no começo do
 * nome — ou, para a rede que a tela renomeou, o endereço E o e-mail que o
 * `criarOutraRede` dá. `[sim]` nunca.
 */
export function ehRedeDeTeste(r: { name: string | null; slug: string | null; email: string | null }): boolean {
  const nome = r.name ?? ''
  if (nome.startsWith('[sim]')) return false
  if (nome.startsWith(PREFIXO)) return true
  return (r.slug ?? '').startsWith('e2e-') && /^e2e-.*@bellaris\.invalid$/.test(r.email ?? '')
}

/** O que a varredura do começo leva: rede de teste com mais de `idadeMin` minutos (a mais nova pode ser de uma rodada em curso). */
export function redesDaVarredura(
  redes: { id: string; name: string | null; slug: string | null; email: string | null; created_at: string }[],
  agora: Date,
  idadeMin: number,
): string[] {
  const limite = agora.getTime() - idadeMin * 60_000
  return redes.filter(r => ehRedeDeTeste(r) && new Date(r.created_at).getTime() < limite).map(r => r.id)
}

/** O login que a limpeza apaga: só o de teste (domínio `.invalid`, que não existe, ou `e2e-…`). */
export function loginDeTeste(email: string | null | undefined): boolean {
  if (!email) return false
  return /^e2e-/i.test(email) || /\.invalid$/i.test(email)
}

interface Resultado {
  ausente?: boolean
  incompleto?: boolean
  apagou?: Record<string, number>
  restam?: Record<string, string>
  logins?: { id: string; email: string | null }[]
  arquivos?: Record<string, string[]>
}

/**
 * Apaga a rede de teste INTEIRA: a função do banco (que devolve os logins que
 * ficaram sem dono e os arquivos do Storage), depois os arquivos e os logins.
 * A função para em ~5 s e diz `incompleto` (o PostgREST corta em 8 s): chama
 * de novo até acabar. Devolve o que não saiu — quem chama confere ou avisa.
 */
export async function apagarRedeDeTeste(tenantId: string): Promise<Falha[]> {
  const db = banco()
  const falhas: Falha[] = []
  for (let vez = 1; vez <= 6; vez++) {
    const { data, error } = await db.rpc('e2e_apagar_rede', { p_tenant: tenantId })
    if (error) { falhas.push({ o_que: `rede de teste ${tenantId}`, erro: error.message }); break }
    const r = (data ?? {}) as Resultado
    for (const [bucket, caminhos] of Object.entries(r.arquivos ?? {})) {
      if (!caminhos?.length) continue
      const { error: e } = await db.storage.from(bucket).remove(caminhos)
      if (e) falhas.push({ o_que: `arquivos de ${bucket}`, erro: e.message })
    }
    for (const l of r.logins ?? []) {
      if (!loginDeTeste(l.email)) { falhas.push({ o_que: `login ${l.email}`, erro: 'ficou: não é um login de teste' }); continue }
      const { error: e } = await db.auth.admin.deleteUser(l.id)
      if (e && !/not found/i.test(e.message)) falhas.push({ o_que: `login ${l.email}`, erro: e.message })
    }
    if (r.incompleto) continue
    for (const [tabela, erro] of Object.entries(r.restam ?? {})) falhas.push({ o_que: `rede de teste: ${tabela}`, erro })
    return falhas
  }
  if (!falhas.length) falhas.push({ o_que: `rede de teste ${tenantId}`, erro: 'não terminou em seis passadas' })
  return falhas
}

/**
 * O fim da rodada: apaga as redes anotadas, UMA DE CADA VEZ, com uma pausa
 * entre elas — a instância é pequena, e a produção continua no ar. A que não
 * sai fica anotada para a próxima. Não lança: devolve as falhas.
 */
export async function apagarRedesAdiadas(opcoes: { dir?: string; pausaMs?: number } = {}): Promise<{ redes: number; falhas: Falha[] }> {
  const dir = opcoes.dir ?? dirDoRegistro()
  const pausa = opcoes.pausaMs ?? 250
  const ids = lerRegistro(dir)
  const falhas: Falha[] = []
  const restam: string[] = []
  for (const [i, id] of ids.entries()) {
    if (i && pausa) await new Promise(ok => setTimeout(ok, pausa))
    const f = await apagarRedeDeTeste(id)
    if (f.length) { restam.push(id); falhas.push(...f) }
  }
  esvaziarRegistro(dir, restam)
  return { redes: ids.length - restam.length, falhas }
}
