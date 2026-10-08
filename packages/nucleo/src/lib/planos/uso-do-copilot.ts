import { createAdminClient } from '../supabase/admin'
import { ler } from '../db'
import { cotaDoCopilot, lerRecursos, percentualDaCota } from './recursos'
import { lerAdicionais, recursosEfetivos } from './adicionais'

/**
 * O consumo do Copilot no mês (de Brasília) — `copilot_uso_mensal`, somado a
 * cada pedido pela clínica. Lido pela clínica (a cota que barra, a aba
 * Assinatura) e pelo sistema (a tela da rede). A cota vem do retrato do plano
 * (`cotas.copilot`, em tokens; null = sem limite).
 */

type Admin = ReturnType<typeof createAdminClient>

export function mesDeBrasilia(agora = new Date()): string {
  const [ano, mes] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .format(agora).split('-')
  return `${ano}-${mes}-01`
}

export interface UsoDoCopilot {
  tokens: number
  /** null = sem limite. */
  cota: number | null
  /** 0 a 100 (null sem cota). */
  percentual: number | null
}

export async function usoDoCopilot(admin: Admin, tenantId: string, recursos: { cotas?: { copilot: number | null } } | null): Promise<UsoDoCopilot> {
  const linha = await ler(admin.from('copilot_uso_mensal').select('tokens')
    .eq('tenant_id', tenantId).eq('mes', mesDeBrasilia()).maybeSingle(), 'ler o uso do Copilot') as { tokens: number } | null
  const tokens = Number(linha?.tokens ?? 0)
  const cota = cotaDoCopilot(recursos)
  return { tokens, cota, percentual: percentualDaCota(tokens, cota) }
}

/** "600 tokens · 100% da cota" / "1,2 mi tokens · sem limite". */
export function descreverUsoDoCopilot(u: UsoDoCopilot): string {
  const t = u.tokens >= 1_000_000
    ? `${(u.tokens / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi tokens`
    : `${u.tokens.toLocaleString('pt-BR')} tokens`
  return `${t} · ${u.percentual === null ? 'sem limite' : `${u.percentual}% da cota`}`
}

// ─── Todas as redes (a tela "Uso do Copilot" do sistema, 2026-10-08) ─────────

export interface UsoDaRede {
  tenantId: string
  nome: string
  plano: string | null
  tokens: number
  pedidos: number
  /** null = sem custo conhecido (antes da coluna, ou modelo fora da tabela de preços). */
  custoUsd: number | null
  cota: number | null
  percentual: number | null
  /** O Copilot está no plano efetivo (o plano ou o adicional). */
  noPlano: boolean
}

/**
 * O uso de CADA rede no mês (`AAAA-MM-01`): as que usaram e as que têm o
 * Copilot no plano (com zero), da que mais gastou para a que menos.
 */
export async function usoDoCopilotDasRedes(admin: Admin, mes: string): Promise<UsoDaRede[]> {
  const [usos, redes, subs] = await Promise.all([
    ler(admin.from('copilot_uso_mensal').select('tenant_id, tokens, pedidos, custo_usd').eq('mes', mes), 'ler o uso do Copilot'),
    ler(admin.from('tenants').select('id, name, plan_name'), 'ler as redes'),
    ler(admin.from('tenant_subscriptions').select('tenant_id, recursos, adicionais'), 'ler as assinaturas'),
  ]) as [
    { tenant_id: string; tokens: number; pedidos: number; custo_usd: number | string | null }[] | null,
    { id: string; name: string; plan_name: string | null }[] | null,
    { tenant_id: string; recursos: unknown; adicionais: unknown }[] | null,
  ]
  const usoDa = new Map((usos ?? []).map(u => [u.tenant_id, u]))
  const subDa = new Map((subs ?? []).map(s => [s.tenant_id, s]))
  const linhas: UsoDaRede[] = []
  for (const r of redes ?? []) {
    const s = subDa.get(r.id)
    const efetivo = s ? recursosEfetivos(lerRecursos(s.recursos), lerAdicionais(s.adicionais)) : null
    const noPlano = !!efetivo?.funcionalidades.includes('copilot')
    const u = usoDa.get(r.id)
    if (!noPlano && !u) continue
    const tokens = Number(u?.tokens ?? 0)
    const cota = cotaDoCopilot(efetivo)
    linhas.push({
      tenantId: r.id, nome: r.name, plano: r.plan_name, tokens, pedidos: Number(u?.pedidos ?? 0),
      custoUsd: u?.custo_usd === null || u?.custo_usd === undefined ? null : Number(u.custo_usd),
      cota, percentual: percentualDaCota(tokens, cota), noPlano,
    })
  }
  return linhas.sort((a, b) => b.tokens - a.tokens || a.nome.localeCompare(b.nome, 'pt-BR'))
}

export interface MesDoCopilot { mes: string; redes: number; pedidos: number; tokens: number; custoUsd: number | null }

/**
 * Os últimos `quantos` meses até `ate` (inclusive), somados — só das redes
 * que `contar` aceita (a tela tira as de teste). Mês sem uso aparece com zero.
 */
export async function historicoDoCopilot(
  admin: Admin, ate: string, quantos: number, contar: (tenantId: string) => boolean,
): Promise<MesDoCopilot[]> {
  const meses = mesesAte(ate, quantos)
  const linhas = await ler(admin.from('copilot_uso_mensal').select('tenant_id, mes, tokens, pedidos, custo_usd')
    .gte('mes', meses[meses.length - 1]!).lte('mes', ate), 'ler o histórico do Copilot') as
    { tenant_id: string; mes: string; tokens: number; pedidos: number; custo_usd: number | string | null }[] | null
  return meses.map(mes => {
    const doMes = (linhas ?? []).filter(l => l.mes === mes && contar(l.tenant_id))
    const comCusto = doMes.filter(l => l.custo_usd !== null)
    return {
      mes,
      redes: doMes.length,
      pedidos: doMes.reduce((s, l) => s + Number(l.pedidos), 0),
      tokens: doMes.reduce((s, l) => s + Number(l.tokens), 0),
      custoUsd: comCusto.length ? comCusto.reduce((s, l) => s + Number(l.custo_usd), 0) : null,
    }
  })
}

/** Os `quantos` meses (`AAAA-MM-01`) até `ate`, do mais novo para o mais velho. */
export function mesesAte(ate: string, quantos: number): string[] {
  const [ano, mes] = ate.split('-').map(Number)
  return Array.from({ length: quantos }, (_, i) => new Date(Date.UTC(ano!, mes! - 1 - i, 1)).toISOString().slice(0, 10))
}

/** "outubro de 2026". */
export function nomeDoMes(mes: string): string {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${mes}T12:00:00Z`))
}
