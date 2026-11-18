import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { EVENTOS, ROTULOS_DE_EVENTO, CAMPOS_DO_EVENTO, NODES } from '@estetica-os/types'

/**
 * "Marque o ganho" fora do cron (auditoria das regras, 2026-11-18). As falas:
 * r2-cfg-04 ("toda e qualquer automação deve ser feita através dos módulos de
 * automações") e o princípio 6 ("automação nasce como modelo desligado; a
 * rede liga se quiser"). O cron `crm-lembretes` mandava o aviso a todas as
 * redes, sem desligar. Agora: o fato `lead.cliente_comprou` (gatilho no
 * banco), o modelo "Marque o ganho" (rascunho, como todo modelo) e o "Avisar a
 * equipe" com o alvo "quem cuida da oportunidade". O lembrete de RETORNO
 * fica no cron.
 */

const raiz = path.join(__dirname, '..')

const pedidos: { op: string; args: unknown[] }[][] = []
function construtor() {
  const ops: { op: string; args: unknown[] }[] = []
  pedidos.push(ops)
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'or']) b[op] = (...args: unknown[]) => { ops.push({ op, args }); return b }
  b.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [{ id: 'u9' }], error: null }).then(ok)
  return b
}
const avisos: unknown[] = []
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor }) }))
vi.mock('@/lib/notifications/notify', () => ({ notifyUser: vi.fn(async (_a: unknown, id: string, n: unknown) => { avisos.push({ id, n }) }) }))
vi.mock('@/lib/lead-events', () => ({ registrarEventoLead: vi.fn() }))

beforeEach(() => { pedidos.length = 0; avisos.length = 0 })

describe('o fato "a cliente da oportunidade comprou"', () => {
  it('está no catálogo, com rótulo e campos', () => {
    expect(EVENTOS.LEAD_CLIENTE_COMPROU).toBe('lead.cliente_comprou')
    expect(ROTULOS_DE_EVENTO['lead.cliente_comprou']).toBe('Cliente da oportunidade comprou')
    expect(CAMPOS_DO_EVENTO['lead.cliente_comprou'].map(c => c.caminho)).toContain('evento.dados.compra')
  })
})

describe('o modelo "Marque o ganho"', () => {
  it('assina o fato e avisa quem cuida da oportunidade', async () => {
    const { modeloDeAutomacao } = await import('@/lib/automacoes/modelos')
    const m = modeloDeAutomacao('marque-o-ganho')
    expect(m?.nome).toBe('Marque o ganho')
    const g = m!.grafo()
    const gatilho = g.nos.find(n => n.tipo === NODES.GATILHO_EVENTO)
    expect((gatilho?.config as { evento?: string }).evento).toBe('lead.cliente_comprou')
    const aviso = g.nos.find(n => n.tipo === NODES.ACAO_NOTIFICAR_EQUIPE)
    expect((aviso?.config as { alvo?: string }).alvo).toBe('responsavel')
    const { validarGrafo } = await import('@/lib/automacoes/validar')
    expect(validarGrafo(g).filter(p => p.grau === 'erro')).toEqual([])
  })
})

describe('Avisar a equipe: quem cuida da oportunidade', () => {
  it('avisa o responsável do card', async () => {
    const { notificarEquipe } = await import('@/lib/automacoes/acoes')
    const r = await notificarEquipe('t1', { alvo: 'responsavel', alvoId: null, responsavelId: 'u9', titulo: 'Marque o ganho', corpo: 'x', automacao: 'Marque o ganho' })
    expect(r).toMatchObject({ avisados: 1 })
    expect(pedidos[0]!.some(o => o.op === 'eq' && o.args[0] === 'id' && o.args[1] === 'u9')).toBe(true)
  })

  it('sem responsável, não avisa ninguém e diz por quê', async () => {
    const { notificarEquipe } = await import('@/lib/automacoes/acoes')
    const r = await notificarEquipe('t1', { alvo: 'responsavel', alvoId: null, responsavelId: null, titulo: 't', corpo: 'x', automacao: 'a' })
    expect(r).toEqual({ avisados: 0, motivo: 'A oportunidade não tem responsável.' })
    expect(avisos).toEqual([])
  })
})

describe('o cron do CRM não lembra mais o ganho', () => {
  it('só o retorno fica no cron', () => {
    const cron = readFileSync(path.join(raiz, 'app/api/cron/crm-lembretes/route.ts'), 'utf8')
    expect(cron).not.toMatch(/crm_lembretes_de_ganho/)
    expect(cron).not.toMatch(/Marque o ganho/)
    expect(cron).toMatch(/retorno_avisado_em/)
  })
})
