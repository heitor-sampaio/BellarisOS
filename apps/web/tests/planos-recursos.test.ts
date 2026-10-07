import { describe, it, expect } from 'vitest'
import {
  FUNCIONALIDADES, normalizarRecursos, lerRecursos, temFuncionalidade, limiteDe, modulosForaDoPlano, TUDO_LIBERADO,
} from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * O que um plano da plataforma inclui (2026-10-06): funcionalidades (liga ou
 * desliga) e limites (1 a 10, ou ilimitado). O catálogo é fechado no código;
 * o que vem do navegador passa por `normalizarRecursos`, e o que vem do banco
 * (o retrato da rede) por `lerRecursos`.
 */
describe('o catálogo', () => {
  it('tem as funcionalidades do sistema e o Copilot (em breve)', () => {
    const chaves = FUNCIONALIDADES.map(f => f.chave)
    for (const c of ['agenda', 'prontuario', 'documentos', 'estoque', 'portal', 'fidelidade', 'pacotes', 'pre_pago',
      'planos_de_tratamento', 'inbox', 'oportunidades', 'campanhas', 'templates', 'automacoes', 'anuncios',
      'financeiro', 'comissoes', 'relatorios', 'cargos', 'copilot']) expect(chaves).toContain(c)
    expect(new Set(chaves).size).toBe(chaves.length)
    expect(FUNCIONALIDADES.find(f => f.chave === 'copilot')?.emBreve).toBe(true)
  })
})

describe('normalizarRecursos (o que vem do navegador)', () => {
  it('aceita funcionalidades do catálogo e limites de 1 a 10 ou ilimitado', () => {
    const r = normalizarRecursos({ funcionalidades: ['agenda', 'inbox', 'agenda'], limites: { unidades: 3, membros: null, whatsapp: 1 } })
    expect(r).toEqual({ ok: true, recursos: { funcionalidades: ['agenda', 'inbox'], limites: { unidades: 3, membros: null, whatsapp: 1 }, adicionais: {} } })
  })
  it('recusa funcionalidade fora do catálogo', () => {
    expect(normalizarRecursos({ funcionalidades: ['agenda', 'inventada'], limites: { unidades: 1, membros: 1, whatsapp: 1 } }).ok).toBe(false)
  })
  it('recusa limite fora de 1 a 10 (ou não inteiro)', () => {
    for (const v of [0, 11, 2.5, -1, '3']) {
      expect(normalizarRecursos({ funcionalidades: [], limites: { unidades: v, membros: null, whatsapp: null } }).ok, String(v)).toBe(false)
    }
  })
  it('recusa limites que não são objeto (sem estourar)', () => {
    for (const limites of ['x', 5, null, [1, 2, 3]]) {
      expect(normalizarRecursos({ funcionalidades: [], limites }).ok, JSON.stringify(limites)).toBe(false)
    }
  })
  it('recusa limite que falta', () => {
    expect(normalizarRecursos({ funcionalidades: [], limites: { unidades: 1, membros: 1 } }).ok).toBe(false)
  })
})

describe('lerRecursos (o retrato gravado)', () => {
  it('sem retrato: tudo liberado', () => {
    expect(lerRecursos(null)).toBeNull()
    expect(temFuncionalidade(null, 'pacotes')).toBe(true)
    expect(limiteDe(null, 'unidades')).toBeNull()
  })
  it('ignora chave desconhecida, e limite que falta é ilimitado', () => {
    const r = lerRecursos({ funcionalidades: ['agenda', 'removida'], limites: { unidades: 2 } })!
    expect(r.funcionalidades).toEqual(['agenda'])
    expect(r.limites).toEqual({ unidades: 2, membros: null, whatsapp: null })
  })
  it('liga e desliga pelo retrato', () => {
    const r = lerRecursos({ funcionalidades: ['agenda'], limites: { unidades: 1, membros: 5, whatsapp: null } })
    expect(temFuncionalidade(r, 'agenda')).toBe(true)
    expect(temFuncionalidade(r, 'pacotes')).toBe(false)
    expect(limiteDe(r, 'membros')).toBe(5)
    expect(limiteDe(r, 'whatsapp')).toBeNull()
  })
})

describe('modulosForaDoPlano (o corte nas permissões)', () => {
  it('sem retrato, nenhum módulo sai', () => {
    expect(modulosForaDoPlano(null)).toEqual([])
    expect(modulosForaDoPlano(TUDO_LIBERADO)).toEqual([])
  })
  it('módulo inteiro sai quando a funcionalidade dele está fora', () => {
    const fora = modulosForaDoPlano(lerRecursos({ funcionalidades: ['agenda'], limites: {} }))
    for (const m of ['medical_records', 'documents', 'stock', 'loyalty', 'automations', 'financial', 'reports', 'roles']) expect(fora).toContain(m)
    expect(fora).not.toContain('agenda')
  })
  it('crm só sai quando inbox E oportunidades estão fora; marketing, quando campanhas, templates e anúncios estão', () => {
    expect(modulosForaDoPlano(lerRecursos({ funcionalidades: ['inbox'], limites: {} }))).not.toContain('crm')
    expect(modulosForaDoPlano(lerRecursos({ funcionalidades: ['oportunidades'], limites: {} }))).not.toContain('crm')
    expect(modulosForaDoPlano(lerRecursos({ funcionalidades: [], limites: {} }))).toContain('crm')
    expect(modulosForaDoPlano(lerRecursos({ funcionalidades: ['anuncios'], limites: {} }))).not.toContain('marketing')
    expect(modulosForaDoPlano(lerRecursos({ funcionalidades: [], limites: {} }))).toContain('marketing')
  })
  it('clientes, procedimentos e equipe nunca saem (são o mínimo da clínica)', () => {
    const fora = modulosForaDoPlano(lerRecursos({ funcionalidades: [], limites: {} }))
    for (const m of ['clients', 'procedures', 'team', 'settings', 'cashier', 'forms']) expect(fora).not.toContain(m)
  })
})

describe('a migration', () => {
  it('nasce os planos antigos com TODAS as funcionalidades do catálogo (nada muda para ninguém)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const sql = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/20261006000003_planos_recursos.sql'), 'utf8')
    const lista = sql.match(/"funcionalidades": \[([\s\S]*?)\]/)![1]!.match(/"([a-z_]+)"/g)!.map(x => x.slice(1, -1))
    // As chaves que entraram depois, cada uma numa migration que decide os
    // planos e retratos existentes (marcadas "chaves novas do catálogo: [...]").
    const dir = path.resolve(__dirname, '../../../supabase/migrations')
    const novas = fs.readdirSync(dir).filter(n => n > '20261006000003').flatMap(n => {
      const m = fs.readFileSync(path.join(dir, n), 'utf8').match(/chaves novas do catálogo: \[([^\]]*)\]/)
      return m ? m[1]!.match(/"([a-z_]+)"/g)!.map(x => x.slice(1, -1)) : []
    })
    expect([...lista, ...novas].sort()).toEqual(FUNCIONALIDADES.map(f => f.chave).sort())
  })
  it('o planejador de injetáveis e a personalização de fichas são funcionalidades; o inbox é "omnichannel" (2026-10-07)', () => {
    const por = Object.fromEntries(FUNCIONALIDADES.map(f => [f.chave, f])) as Record<string, { rotulo: string; modulos: readonly string[] } | undefined>
    expect(por.injetaveis?.rotulo).toBe('Planejador de injetáveis')
    expect(por.fichas?.rotulo).toBe('Personalização de fichas de atendimento')
    expect(por.inbox?.rotulo).toBe('Inbox omnichannel')
    // Partes de módulo: o prontuário e os modelos de documento seguem para quem não as tem.
    expect(por.injetaveis?.modulos).toEqual([])
    expect(por.fichas?.modulos).toEqual([])
  })
})

describe('abasForaDoPlano (as abas de Relatórios)', () => {
  it('sem retrato, nenhuma', async () => {
    const { abasForaDoPlano } = await import('@estetica-os/nucleo/lib/planos/recursos')
    expect(abasForaDoPlano(null)).toEqual([])
  })
  it('a aba de uma funcionalidade fora do plano sai: financeiro, agenda, estoque, comercial (oportunidades)', async () => {
    const { abasForaDoPlano } = await import('@estetica-os/nucleo/lib/planos/recursos')
    const fora = abasForaDoPlano(lerRecursos({ funcionalidades: ['relatorios', 'inbox'], limites: {} }))
    expect([...fora].sort()).toEqual(['agenda', 'comercial', 'estoque', 'financeiro'])
    expect(abasForaDoPlano(lerRecursos({ funcionalidades: ['relatorios', 'agenda', 'estoque', 'financeiro', 'oportunidades'], limites: {} }))).toEqual([])
  })
})
