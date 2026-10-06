import { createAdminClient } from '@estetica-os/nucleo/lib/supabase/admin'
import { ler } from '@estetica-os/nucleo/lib/db'

/**
 * O diagnóstico de uma rede para o suporte — o que costuma explicar "não está
 * funcionando" sem precisar entrar na conta de ninguém.
 *
 * Lista FECHADA do que sai daqui: das caixas e integrações, só o estado (nunca
 * token, PIN ou segredo — `CAMPOS_DA_CAIXA`); dos eventos, só o nome, a
 * entidade, quem e quando (os `dados` carregam retrato de cliente, e o painel
 * da rede não depende de autorização da clínica); das automações, o erro; do
 * LGPD, a contagem por situação.
 */
const CAMPOS_DA_CAIXA = ['conexao', 'modo', 'connectedName', 'connectedPhone', 'instanceName', 'webhookAppliedAt'] as const

export interface CaixaNoDiagnostico {
  id: string; provider: string; label: string; phone: string | null
  isActive: boolean; isDefault: boolean; managed: boolean
  estado: Partial<Record<typeof CAMPOS_DA_CAIXA[number], string>>
  atualizadaEm: string | null
}

export interface DiagnosticoDaRede {
  caixas:      CaixaNoDiagnostico[]
  integracoes: { provider: string; isActive: boolean; atualizadaEm: string | null }[]
  eventos:     { nome: string; entidade: string; atorNome: string | null; origem: string; em: string }[]
  falhas:      { id: string; automacao: string; erro: string | null; tentativas: number; em: string }[]
  lgpd:        { status: string; quantos: number }[]
}

export async function diagnosticoDaRede(tenantId: string): Promise<DiagnosticoDaRede> {
  const admin = createAdminClient()
  const [caixas, integracoes, eventos, falhas, lgpd] = await Promise.all([
    ler(admin.from('whatsapp_numbers')
      .select('id, provider, label, phone_e164, is_active, is_default, managed, config, updated_at')
      .eq('tenant_id', tenantId).order('created_at'), 'carregar as caixas da rede'),
    ler(admin.from('integration_configs')
      .select('provider, is_active, updated_at')
      .eq('tenant_id', tenantId), 'carregar as integrações da rede'),
    ler(admin.from('domain_events')
      .select('nome, entidade, ator_nome, origem, ocorrido_em')
      .eq('tenant_id', tenantId).order('ocorrido_em', { ascending: false }).limit(30), 'carregar os eventos da rede'),
    ler(admin.from('automation_runs')
      .select('id, erro, tentativas, created_at, automations(nome)')
      .eq('tenant_id', tenantId).eq('status', 'falhou').eq('simulacao', false)
      .order('created_at', { ascending: false }).limit(20), 'carregar as automações com falha'),
    ler(admin.from('lgpd_requests')
      .select('status')
      .eq('tenant_id', tenantId), 'carregar os pedidos de LGPD'),
  ])

  const contagem = new Map<string, number>()
  for (const r of (lgpd ?? []) as { status: string }[]) contagem.set(r.status, (contagem.get(r.status) ?? 0) + 1)

  return {
    caixas: ((caixas ?? []) as {
      id: string; provider: string; label: string; phone_e164: string | null; is_active: boolean | null
      is_default: boolean | null; managed: boolean | null; config: Record<string, unknown> | null; updated_at: string | null
    }[]).map(c => ({
      id: c.id, provider: c.provider, label: c.label, phone: c.phone_e164,
      isActive: !!c.is_active, isDefault: !!c.is_default, managed: !!c.managed,
      estado: estadoDaCaixa(c.config),
      atualizadaEm: c.updated_at,
    })),
    integracoes: ((integracoes ?? []) as { provider: string; is_active: boolean | null; updated_at: string | null }[])
      .map(i => ({ provider: i.provider, isActive: !!i.is_active, atualizadaEm: i.updated_at })),
    eventos: ((eventos ?? []) as { nome: string; entidade: string; ator_nome: string | null; origem: string; ocorrido_em: string }[])
      .map(e => ({ nome: e.nome, entidade: e.entidade, atorNome: e.ator_nome, origem: e.origem, em: e.ocorrido_em })),
    falhas: ((falhas ?? []) as unknown as { id: string; erro: string | null; tentativas: number; created_at: string; automations: { nome: string } | null }[])
      .map(r => ({ id: r.id, automacao: r.automations?.nome ?? '—', erro: r.erro, tentativas: r.tentativas, em: r.created_at })),
    lgpd: [...contagem.entries()].map(([status, quantos]) => ({ status, quantos })),
  }
}

/** Só os campos de estado da lista fechada, e só os que são texto. */
export function estadoDaCaixa(config: Record<string, unknown> | null | undefined): CaixaNoDiagnostico['estado'] {
  const estado: CaixaNoDiagnostico['estado'] = {}
  for (const campo of CAMPOS_DA_CAIXA) {
    const v = config?.[campo]
    if (typeof v === 'string' && v.trim() !== '') estado[campo] = v
  }
  return estado
}
