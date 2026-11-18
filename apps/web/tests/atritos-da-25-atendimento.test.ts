import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Os atritos da 25ª simulação (2026-11-18) da sessão de atendimento e da
 * agenda que se provam sem tela.
 *
 * A8 (princípio 7; atendimento.md, "Quem não vê o clínico"): quem conclui sem
 * o Prontuário para na ficha de saúde obrigatória em branco — e a recusa só
 * dizia o nome da pergunta, não QUEM a responde (quem tem o Prontuário em
 * Gerenciar, ou a cliente).
 * A9 (princípio 3): "quem conclui" deixava de fora a profissional do próprio
 * agendamento que tem o Atendimento em Gerenciar "só os meus" — ela conclui o
 * dela.
 * A10 (princípio 3; A6 da 17ª): "Mandada ao app da cliente ao agendar" para a
 * cliente sem acesso ao app.
 * A11 (princípio 3): o motivo do cancelamento vai no aviso à cliente, e o
 * campo não dizia.
 */

const ler = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

// ─── O banco de mentira (só o que estas leituras pedem) ─────────────────────
type Resultado = { data: unknown; error: { message: string } | null }
interface Pedido { tabela: string; ops: { op: string; args: unknown[] }[] }
const pedidos: Pedido[] = []
let responder: (p: Pedido) => Resultado = () => ({ data: [], error: null })
function construtor(tabela: string) {
  const p: Pedido = { tabela, ops: [] }
  pedidos.push(p)
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'neq', 'in', 'is', 'or', 'not', 'order', 'range', 'limit', 'maybeSingle', 'single']) {
    b[op] = (...args: unknown[]) => { p.ops.push({ op, args }); return b }
  }
  b.then = (ok: (r: Resultado) => unknown, falhou?: (e: unknown) => unknown) => Promise.resolve(responder(p)).then(ok, falhou)
  return b
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor }) }))
beforeEach(() => { pedidos.length = 0; responder = () => ({ data: [], error: null }) })
const modulosDo = (p: Pedido) => p.ops.find(o => o.op === 'in' && o.args[0] === 'module')?.args[1] as string[] | undefined

describe('A8: a recusa pela ficha de saúde diz quem a responde', () => {
  it('o texto', async () => {
    const { textoDeQuemRespondeAFicha } = await import('@/lib/equipe/textos-de-quem-pode')
    expect(textoDeQuemRespondeAFicha(['Ana Lima']))
      .toBe('Quem responde a ficha de saúde é quem tem o Prontuário em Gerenciar (Ana Lima), ou a cliente, pelo app ou pelo link.')
    expect(textoDeQuemRespondeAFicha([]))
      .toBe('Quem responde a ficha de saúde é quem tem o Prontuário em Gerenciar, ou a cliente, pelo app ou pelo link.')
  })
  it('quem responde é quem tem o Prontuário em Gerenciar', async () => {
    const { quemRespondeAFichaDeSaude } = await import('@/lib/equipe/quem-desfaz')
    await quemRespondeAFichaDeSaude('rede', null)
    const perms = pedidos.find(p => p.tabela === 'role_permissions')
    expect(modulosDo(perms!)).toEqual(['medical_records'])
    expect(perms!.ops).toContainEqual({ op: 'in', args: ['level', ['MANAGE']] })
  })
  it('a conferência do servidor acrescenta o texto só à falta da ficha de saúde', () => {
    const f = ler('lib/atendimento/obrigatorias-no-servidor.ts')
    expect(f).toMatch(/aQuemPedirAFicha\?: \(\) => Promise<string>/)
    expect(f).toMatch(/if \(falta\) return o\.aQuemPedirAFicha \? `\$\{falta\.mensagem\} \$\{await o\.aQuemPedirAFicha\(\)\}` : falta\.mensagem/)
  })
  it('o Finalizar e o Gerar plano passam o texto a quem não tem o Prontuário em Gerenciar', () => {
    for (const arquivo of ['actions/appointments.ts', 'actions/treatment-plans.ts']) {
      const f = ler(arquivo)
      const chamadas = f.split('oQueFaltaParaSeguir(admin, {').slice(1)
      expect(chamadas.length, arquivo).toBeGreaterThan(0)
      for (const c of chamadas) expect(c.slice(0, 600), arquivo).toContain('aQuemPedirAFicha: aQuemPedirAFichaDeSaude(ctx')
    }
    expect(ler('lib/atendimento/quem-responde-a-ficha.ts')).toMatch(/can\(ctx, 'medical_records', 'MANAGE'\) \? undefined/)
  })
})

describe('A9: a profissional do agendamento, com o Atendimento em Gerenciar "só os meus", conclui o dela', () => {
  it('os nomes de quem conclui ESTE atendimento incluem a profissional dele', async () => {
    const { nomesDeQuemConclui } = await import('@/lib/equipe/textos-de-quem-pode')
    expect(nomesDeQuemConclui(['Carla'], { id: 'p1', nome: 'Bruna' }, ['p1'])).toEqual(['Bruna', 'Carla'])
    // Sem o Atendimento em Gerenciar, não entra.
    expect(nomesDeQuemConclui(['Carla'], { id: 'p2', nome: 'Dani' }, ['p1'])).toEqual(['Carla'])
    // Já está na lista: não repete.
    expect(nomesDeQuemConclui(['Carla'], { id: 'p1', nome: 'Carla' }, ['p1'])).toEqual(['Carla'])
    // Nulo: não se aplica (a tela não mostra).
    expect(nomesDeQuemConclui(null, { id: 'p1', nome: 'Bruna' }, ['p1'])).toBeNull()
  })
  it('quem conclui os próprios: o Atendimento em Gerenciar em qualquer escopo, com a Agenda (Ver ou Gerenciar)', async () => {
    const { idsQueConcluemOsProprios } = await import('@/lib/equipe/quem-desfaz')
    responder = p => {
      if (p.tabela === 'role_permissions') {
        const m = modulosDo(p)
        if (m?.includes('atendimento')) return { data: [{ role_id: 'so-os-meus' }, { role_id: 'sem-agenda' }], error: null }
        if (m?.includes('agenda')) return { data: [{ role_id: 'so-os-meus' }], error: null }
      }
      if (p.tabela === 'users') return { data: [{ id: 'prof-1' }], error: null }
      return { data: [], error: null }
    }
    expect(await idsQueConcluemOsProprios('rede')).toEqual(['prof-1'])
    const atd = pedidos.find(p => p.tabela === 'role_permissions' && modulosDo(p)?.includes('atendimento'))!
    expect(atd.ops.some(o => o.op === 'or')).toBe(false)
    const cargos = pedidos.filter(p => p.tabela === 'users').flatMap(p => p.ops)
      .find(o => o.op === 'in' && o.args[0] === 'role_id')?.args[1] as string[]
    expect(cargos).toEqual(['so-os-meus'])
  })
  it('a sessão e a janela da agenda juntam a profissional do agendamento', () => {
    expect(ler('app/_shared/sessao-de-atendimento.tsx')).toMatch(/quemConclui=\{[^}]*nomesDeQuemConclui\(/)
    expect(ler('components/branch/appointment-sheet.tsx')).toMatch(/textoDeQuemConclui\(nomesDeQuemConclui\(quemConclui, \{ id: appointment\.professionalId \?\? null, nome: appointment\.professionalName \}, concluemOsProprios\)\)/)
    for (const p of ['app/[slug]/agenda/page.tsx', 'app/admin/agenda/page.tsx']) {
      expect(ler(p), p).toMatch(/concluemOsProprios=\{[^\n]*idsQueConcluemOsProprios\(ctx\.tenantId!\)/)
    }
    for (const v of ['components/branch/agenda-calendar.tsx', 'components/admin/admin-agenda-view.tsx']) {
      expect(ler(v), v).toContain('concluemOsProprios={concluemOsProprios}')
    }
  })
  it('o atendimento de outra pessoa diz também a profissional dele', async () => {
    const { textoDeQuemConcluiODeOutra } = await import('@/lib/equipe/textos-de-quem-pode')
    expect(textoDeQuemConcluiODeOutra(['Carla'], 'Bruna'))
      .toBe('Quem conclui é Bruna, que atende, ou quem tem o Atendimento em Gerenciar e a Agenda de todos (Carla).')
    expect(textoDeQuemConcluiODeOutra(['Carla']))
      .toBe('Quem conclui é quem tem o Atendimento em Gerenciar e a Agenda de todos (Carla).')
  })
})

describe('A10: "Mandada ao app" só para quem tem o acesso ao app', () => {
  it('a situação da ficha lê o acesso e só então diz quando foi ao app', () => {
    const f = ler('actions/pre-atendimento.ts')
    expect(f).toMatch(/from\('clients'\)\.select\('document, birth_date, auth_id'\)/)
    expect(f).toContain('noAppEm: cliente?.auth_id ? (noApp?.created_at ?? null) : null')
  })
})

describe('A11: o campo do motivo do cancelamento diz que ele vai à cliente', () => {
  it('na janela da agenda e na sessão', () => {
    for (const arquivo of ['components/branch/appointment-sheet.tsx', 'components/branch/appointment-session.tsx']) {
      const f = ler(arquivo)
      expect(f, arquivo).toMatch(/data-motivo-vai-a-cliente[^>]*>\s*Vai também no aviso à cliente\.\s*</)
    }
  })
})
