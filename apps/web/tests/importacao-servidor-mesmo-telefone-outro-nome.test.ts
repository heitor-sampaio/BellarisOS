import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TenantContext } from '@estetica-os/types'

/**
 * O servidor confere sozinho a regra do mesmo telefone sem CPF (o Heitor,
 * 25/11, escolheu "Vem desmarcada, a não ser que o nome case"). Até aqui a
 * importação de clientes só seguia o `nao_completar` que a prévia mandava, e
 * juntava por padrão: se o cruzamento da prévia falhasse, ou não tivesse
 * chegado quando a pessoa clicou em Importar, a linha da filha completava a
 * ficha da mãe pelo telefone. Agora, em `gravarCliente`, a ficha achada pelo
 * TELEFONE cujo nome não casa (`nomeDiferente`) só recebe a linha se a pessoa
 * marcou juntar na prévia (`importacoes.juntar`); sem a marca, a linha vira a
 * ficha dela. O nome que casa segue juntando (com o `nao_completar` para quem
 * desmarcou), e o mesmo CPF junta sempre.
 */

type Resultado = { data: unknown; error: { message: string; code?: string } | null }
interface Pedido { tabela: string; ops: { op: string; args: unknown[] }[] }

const pedidos: Pedido[] = []
let responder: (p: Pedido) => Resultado = () => ({ data: null, error: null })

function construtor(tabela: string) {
  const p: Pedido = { tabela, ops: [] }
  pedidos.push(p)
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'update', 'insert', 'delete', 'eq', 'neq', 'in', 'is', 'lt', 'order', 'limit', 'maybeSingle', 'single', 'overlaps', 'ilike']) {
    b[op] = (...args: unknown[]) => { p.ops.push({ op, args }); return b }
  }
  b.then = (ok: (r: Resultado) => unknown, falhou?: (e: unknown) => unknown) => {
    try { return Promise.resolve(responder(p)).then(ok, falhou) } catch (e) { return Promise.reject(e).then(ok, falhou) }
  }
  return b
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: construtor, rpc: (nome: string) => construtor(`rpc:${nome}`) }),
}))
vi.mock('@/lib/importacao/referencias', () => ({ referenciasDaRede: async () => ({}) }))
vi.mock('@/lib/crm/oportunidade', () => ({ criarOportunidadeCore: vi.fn() }))
vi.mock('@/lib/contatos/propagar', () => ({ propagarDadosDaPessoa: vi.fn() }))

const ctx = { tenantId: 't' } as TenantContext
const MARLENE = { id: 'f1', tenant_id: 't', name: 'Marlene Souza', phone: '(48) 99999-1111', document: null, email: null, birth_date: null }

async function importarALinha(nome: string, extra: { juntar?: number[] | null; nao_completar?: number[] | null }) {
  let linhasLidas = false
  responder = p => {
    const lendoOPedido = p.tabela === 'importacoes' && p.ops.some(o => o.op === 'maybeSingle')
    if (lendoOPedido) {
      return { data: {
        id: 'imp', tenant_id: 't', branch_id: null, destino: 'clientes', mapeamento: ['name', 'phone'], oportunidade: null,
        processadas: 0, novas: 0, completadas: 0, sem_mudanca: 0, com_erro: 0, oportunidades: 0, erros: [],
        com_aviso: 0, avisos: [], nao_completar: null, juntar: null, ...extra,
      }, error: null }
    }
    if (p.tabela === 'importacao_linhas' && p.ops.some(o => o.op === 'select')) {
      if (linhasLidas) return { data: [], error: null }
      linhasLidas = true
      return { data: [{ numero: 2, valores: [nome, '(48) 99999-1111'] }], error: null }
    }
    if (p.tabela === 'rpc:cliente_por_telefone') return { data: 'f1', error: null }
    if (p.tabela === 'clients' && p.ops.some(o => o.op === 'insert')) return { data: { id: 'nova' }, error: null }
    if (p.tabela === 'clients' && p.ops.some(o => o.op === 'maybeSingle')) return { data: MARLENE, error: null }
    if (p.tabela === 'importacoes' && p.ops.some(o => o.op === 'update')) return { data: [{ id: 'imp' }], error: null }
    return { data: null, error: null }
  }
  const { processarImportacao } = await import('@/lib/importacao/processar')
  await processarImportacao('imp', ctx)
  const criouFicha = pedidos.some(p => p.tabela === 'clients' && p.ops.some(o => o.op === 'insert'))
  const placar = pedidos.filter(p => p.tabela === 'importacoes' && p.ops.some(o => o.op === 'update'))
    .map(p => p.ops.find(o => o.op === 'update')!.args[0] as { status?: string; novas?: number; com_erro?: number }).at(-1)
  return { criouFicha, placar }
}

beforeEach(() => { pedidos.length = 0 })

describe('o servidor: a ficha do mesmo telefone com outro nome só recebe a linha marcada', () => {
  it('outro nome, sem a marca de juntar: a linha vira a ficha dela (mesmo sem o nao_completar)', async () => {
    const r = await importarALinha('Filha da Marlene', {})
    expect(r.placar).toMatchObject({ status: 'concluida', novas: 1, com_erro: 0 })
    expect(r.criouFicha).toBe(true)
  })

  it('outro nome, marcado juntar na prévia: completa a ficha que já existe', async () => {
    const r = await importarALinha('Filha da Marlene', { juntar: [2] })
    expect(r.placar).toMatchObject({ status: 'concluida', novas: 0, com_erro: 0 })
    expect(r.criouFicha).toBe(false)
  })

  it('o nome que casa (sem acento nem caixa) junta por padrão; desmarcado (nao_completar), vira ficha nova', async () => {
    expect((await importarALinha('MARLENE  souza', {})).criouFicha).toBe(false)
    pedidos.length = 0
    expect((await importarALinha('Marlene Souza', { nao_completar: [2] })).criouFicha).toBe(true)
  })
})

describe('a marca de juntar vai da prévia ao servidor', () => {
  const RAIZ = join(__dirname, '..')
  const fonte = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8')
  it('a coluna importacoes.juntar existe, numa migration que recarrega o esquema', () => {
    const dir = join(RAIZ, '..', '..', 'supabase', 'migrations')
    const nome = readdirSync(dir).filter(n => n.endsWith('.sql')).sort()
      .find(n => /add column if not exists juntar integer\[\] not null default '\{\}'/i.test(readFileSync(join(dir, n), 'utf8')))
    expect(nome).toBeTruthy()
    const sql = readFileSync(join(dir, nome!), 'utf8')
    expect(sql).toMatch(/comment on column public\.importacoes\.juntar/i)
    expect(sql.trimEnd().endsWith(`notify pgrst, 'reload schema';`)).toBe(true)
  })
  it('a action guarda o juntar com o filtro do nao_completar, e o servidor o lê', () => {
    expect(fonte('actions/importacao.ts')).toMatch(/juntar: destino === 'clientes' \? numerosDeLinha\(pedido\.juntar\) : \[\]/)
    expect(fonte('actions/importacao.ts')).toMatch(/nao_completar: destino === 'clientes' \? numerosDeLinha\(pedido\.naoCompletar\) : \[\]/)
    expect(fonte('lib/importacao/processar.ts')).toMatch(/\.select\('[^']*nao_completar, juntar[^']*'\)/)
  })
  it('a prévia manda as linhas de outro nome que a pessoa marcou', () => {
    expect(fonte('components/branch/importador-de-contatos.tsx')).toMatch(/juntar: destino === 'clientes' \? linhasDeOutroNomeQueJuntam\(/)
  })
})
