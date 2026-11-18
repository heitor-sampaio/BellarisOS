import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O D1 e os atritos da 22ª simulação (2026-11-17) de atendimento, agenda e
 * plano que se provam sem tela.
 *
 * D1 [3]: "quem conclui" citava a Dra. Lívia (o Prontuário de todos, a Agenda
 * só a própria), que não abre o atendimento da Nádia.
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

const UNIDADE = '11111111-1111-4111-8111-111111111111'

describe('D1: quem conclui é quem ALCANÇA o atendimento — o Prontuário em Gerenciar de todos E a Agenda de todos', () => {
  it('o cargo com o Prontuário de todos e a Agenda só a própria não entra', async () => {
    const { quemConcluiOAtendimento } = await import('@/lib/equipe/quem-desfaz')
    responder = p => {
      if (p.tabela === 'role_permissions') {
        const m = modulosDo(p)
        if (m?.includes('medical_records')) return { data: [{ role_id: 'so-prontuario' }, { role_id: 'os-dois' }], error: null }
        if (m?.includes('agenda')) return { data: [{ role_id: 'os-dois' }, { role_id: 'so-agenda' }], error: null }
      }
      if (p.tabela === 'tenant_roles') return { data: [{ id: 'admin-da-rede' }], error: null }
      return { data: [], error: null }
    }
    await quemConcluiOAtendimento('rede', UNIDADE)
    const daAgenda = pedidos.find(p => p.tabela === 'role_permissions' && modulosDo(p)?.includes('agenda'))
    expect(daAgenda, 'a Agenda também é lida').toBeTruthy()
    expect(daAgenda!.ops).toContainEqual({ op: 'in', args: ['level', ['VIEW', 'MANAGE']] })
    expect(daAgenda!.ops).toContainEqual({ op: 'or', args: ['scope.is.null,scope.eq.ALL'] })
    const cargos = pedidos.filter(p => p.tabela === 'users').flatMap(p => p.ops)
      .find(o => o.op === 'in' && o.args[0] === 'role_id')?.args[1] as string[]
    expect([...cargos].sort()).toEqual(['admin-da-rede', 'os-dois'])
  })
  it('quem marca a chegada segue só pela Agenda (o mesmo laço, sem o segundo módulo)', async () => {
    const { quemMarcaAChegada } = await import('@/lib/equipe/quem-desfaz')
    responder = p => ({ data: p.tabela === 'role_permissions' ? [{ role_id: 'cargo' }] : [], error: null })
    await quemMarcaAChegada('rede', UNIDADE)
    expect(pedidos.filter(p => p.tabela === 'role_permissions')).toHaveLength(1)
  })
})

describe('A18: as dores dizem, no campo, que são obrigatórias para gerar o plano', () => {
  it('o cartão das dores', () => {
    const f = ler('components/branch/appointment-session.tsx')
    expect(f).toContain('data-obrigatorio-para-o-plano')
    expect(f).toContain('obrigatório para gerar o plano')
  })
})

describe('A19: o Planejamento e o Tratamento dizem o primeiro passo', () => {
  it('a janela diz por onde começar', () => {
    // A21 da 23ª: o texto mora em textoDoPlanoNaTela (e diz as dores antes, quando faltam).
    expect(ler('components/branch/planejamento-tratamento.tsx')).toContain('textoDoPlanoNaTela({ faltamAsDores })')
    expect(ler('lib/plano-de-tratamento/textos.ts')).toContain('use “Nova sessão” para escolher o procedimento.')
  })
  it('o Tratamento vazio diz o primeiro passo, e o "Ir ao Tratamento" põe o foco nele', () => {
    const editor = ler('components/branch/treatment-plan-editor.tsx')
    expect(editor).toContain('data-nova-sessao')
    expect(editor).toContain('Nenhuma sessão ainda: comece em “Nova sessão” e escolha o procedimento.')
    expect(ler('components/branch/appointment-session.tsx')).toContain("[data-editor-do-tratamento] [data-nova-sessao]")
  })
})

describe('A21: o plano não fala em avaliação fora dela, e antes de iniciar é opcional', () => {
  it('o título do concluído não diz "desta avaliação"', () => {
    const f = ler('components/branch/appointment-session.tsx')
    expect(f).not.toContain('Montar plano desta avaliação')
    expect(f).toContain('Montar um plano')
  })
  it('antes de iniciar, o "Aceitar plano" não é a ação grande, e o cartão diz que é opcional', () => {
    const f = ler('components/branch/appointment-session.tsx')
    expect(f).toMatch(/const planoAntesDeIniciar = /)
    expect(f).toMatch(/const planoSecundario = isPackageSession \|\| aguardaOPagamento \|\| planoAntesDeIniciar/)
    expect(f).toContain('data-plano-antes-de-iniciar')
    expect(f).toContain('Propor um plano (opcional)')
  })
})

describe('A22: as contagens da Minha agenda dizem que somam as unidades dela', () => {
  it('os rótulos', async () => {
    const { rotulosDaMinhaAgenda } = await import('@/lib/agenda/minha-agenda')
    expect(rotulosDaMinhaAgenda({ deOutraUnidade: false, unidade: 'Cohama' }))
      .toEqual({ hoje: 'Hoje', semana: 'Esta semana', ocupacao: 'Ocupação hoje' })
    expect(rotulosDaMinhaAgenda({ deOutraUnidade: true, unidade: 'Cohama' }))
      .toEqual({ hoje: 'Hoje · suas unidades', semana: 'Esta semana · suas unidades', ocupacao: 'Ocupação hoje · Cohama' })
  })
  it('a Minha agenda usa', () => {
    expect(ler('components/branch/professional-agenda.tsx')).toContain('rotulosDaMinhaAgenda(')
  })
})

describe('A23: o atendimento de outra pessoa não fala no feminino fixo', () => {
  it('o título', () => {
    const f = ler('components/branch/atendimento-de-outra-profissional.tsx')
    expect(f).not.toContain('Este atendimento é de outra profissional')
    expect(f).toContain('Este atendimento é de outra pessoa que atende')
  })
})

describe('A24: o agendar pela oportunidade diz que os horários são os livres', () => {
  it('o rótulo dos horários', () => {
    expect(ler('components/admin/inbox-lead-panel.tsx')).toContain('Horários livres')
  })
})

describe('A26: o bloqueio na semana quebra a linha em vez de cortar', () => {
  it('a etiqueta', () => {
    const f = ler('components/shared/bloqueio-da-agenda.tsx')
    const etiqueta = f.slice(f.indexOf('export function EtiquetaDoBloqueio'), f.indexOf('export function JanelaDoBloqueio'))
    expect(etiqueta).not.toContain("whiteSpace: 'nowrap'")
    expect(etiqueta).not.toContain("textOverflow: 'ellipsis'")
    expect(etiqueta).toContain("overflowWrap: 'anywhere'")
  })
})
