import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, tentar } from '@/lib/db'

/**
 * O nascimento de uma rede (clínica cliente), depois do login do responsável
 * já existir no Auth. UM caminho só: o cadastro público (`registerAction`) e o
 * "Nova rede" do `/sistema` passam por aqui — senão a rede criada por um e a
 * criada pelo outro ficam diferentes.
 *
 * Grava, nesta ordem, e desfaz tudo se algo falhar (senão sobra uma clínica
 * vazia que ninguém consegue abrir):
 *  1. a rede (os gatilhos do banco semeiam os cargos-sistema);
 *  2. o responsável como membro NETWORK_ADMIN;
 *  3. as claims do JWT (`set_user_claims`) — sem elas a RLS inteira nega;
 *  4. o contrato de plano padrão (acessório: falhar não desfaz o cadastro).
 * A unidade e o resto do onboarding ficam para o `/setup`, que o responsável
 * faz no primeiro acesso.
 */
export interface NovaRede {
  authId:            string
  email:             string
  nomeDoResponsavel: string
  nomeDaRede:        string
  documento?:        string | null
  telefone?:         string | null
  /** Base do slug da rede (ex.: o domínio do e-mail ou o nome). */
  slugBase:          string
  planStatus:        'trial' | 'active'
  trialEndsAt:       string | null
}

export type ResultadoDaRede = { ok: true; tenantId: string } | { ok: false; error: string }

export function paraSlug(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40) || 'clinica'
}

/** Só os dígitos do CPF/CNPJ (é assim que a coluna única compara). */
export function soDigitos(v: string | null | undefined): string | null {
  const d = (v ?? '').replace(/\D/g, '')
  return d || null
}

export async function semearRede(n: NovaRede): Promise<ResultadoDaRede> {
  const admin = createAdminClient()
  const slug = `${paraSlug(n.slugBase)}-${n.authId.slice(0, 6)}`

  const { data: tenant, error: eTenant } = await admin.from('tenants')
    .insert({
      name: n.nomeDaRede.trim(), slug, email: n.email,
      document: soDigitos(n.documento), phone: n.telefone?.trim() || null,
      plan_status: n.planStatus, trial_ends_at: n.trialEndsAt,
    })
    .select('id').single()
  if (eTenant || !tenant) {
    if (eTenant?.code === '23505') {
      return { ok: false, error: /document/.test(eTenant.message) ? 'Já existe uma rede com este CPF/CNPJ.' : 'Já existe uma rede com este endereço.' }
    }
    console.error('[semearRede] rede:', eTenant?.message)
    return { ok: false, error: 'Não consegui criar a rede.' }
  }

  try {
    // O cargo-sistema NETWORK_ADMIN é semeado pelo gatilho after-insert em tenants.
    const cargo = await ler(admin.from('tenant_roles').select('id')
      .eq('tenant_id', tenant.id).eq('key', 'NETWORK_ADMIN').single(), 'buscar o cargo de administrador')

    await gravar(admin.from('users').insert({
      auth_id: n.authId, tenant_id: tenant.id, branch_id: null,
      name: n.nomeDoResponsavel.trim() || n.email, email: n.email, role_id: cargo?.id ?? null,
    }), 'criar o responsável pela rede')

    await gravar(admin.rpc('set_user_claims', {
      p_auth_id: n.authId, p_tenant_id: tenant.id, p_branch_id: null, p_role_id: cargo?.id ?? null,
    }), 'gravar o acesso do responsável')

    // O contrato de plano padrão (§9.4.1). Acessório: sem ele a rede funciona e
    // monta o seu em Configurações → Documentos.
    await tentar(admin.rpc('documentos_modelos_padrao', { p_tenant: tenant.id }), 'semear o contrato de plano padrão')
  } catch (e) {
    console.error('[semearRede]', (e as Error).message)
    await tentar(admin.from('users').delete().eq('tenant_id', tenant.id), 'desfazer o responsável')
    await tentar(admin.from('tenants').delete().eq('id', tenant.id), 'desfazer a rede')
    return { ok: false, error: 'Não consegui configurar a rede.' }
  }
  return { ok: true, tenantId: tenant.id }
}

/** O fim do teste de uma rede que nasce hoje, pelos dias da configuração da plataforma. */
export async function fimDoTesteParaHoje(dias?: number | null): Promise<string | null> {
  let d = dias
  if (d == null) {
    const cfg = await ler(createAdminClient().from('platform_settings').select('dias_de_teste').eq('id', 1).maybeSingle(),
      'ler os dias de teste') as { dias_de_teste: number } | null
    d = cfg?.dias_de_teste ?? 14
  }
  if (d <= 0) return null
  // Fim do dia, no fuso das clínicas.
  const alvo = new Date(Date.now() + d * 86_400_000)
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(alvo)
  return `${ymd}T23:59:59-03:00`
}
