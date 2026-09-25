import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUser, type NotifyPayload } from '@/lib/notifications/notify'
import { ler } from '@/lib/db'
import type { AppModule } from '@/lib/permissions'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Quem tem interesse num fato — e por isso recebe a notificação no sino.
 *
 * Decisão do Heitor em 2026-09-25: "todos que forem partes interessadas no
 * evento devem receber a notificação". Até aqui só o PROFISSIONAL do
 * agendamento era avisado, e o sino de quem gerencia ficava permanentemente
 * vazio: no banco de desenvolvimento, as 108 notificações de equipe eram todas
 * de uma única profissional.
 *
 * "Parte interessada" não é uma lista escrita à mão por evento — ela sai de
 * dois eixos que o sistema já conhece:
 *
 *  - **envolvido direto**: a pessoa de quem o fato É. O profissional do
 *    agendamento recebe porque a agenda é dele, com permissão ou sem;
 *  - **responsável**: quem tem `MANAGE` no módulo que governa o fato e alcança
 *    a unidade onde ele aconteceu — a própria unidade (`users.branch_id`) ou a
 *    rede inteira (`branch_id` nulo). É a mesma abrangência do §11, e não uma
 *    regra nova só para notificação.
 *
 * `VIEW` não entra: ver o módulo é poder consultar, não ser responsável pelo
 * que acontece nele. Quem só olha não precisa ser interrompido.
 *
 * E **quem causou o fato sai da lista**: sino avisando a pessoa do que ela
 * acabou de fazer é ruído, e ruído treina a ignorar o sino.
 */
export async function interessadosNoFato(admin: Admin, params: {
  /** Módulo que governa o fato: `agenda`, `stock`, `financial`… */
  modulo:      AppModule
  /** Unidade onde aconteceu. Nulo = fato da rede, sem unidade. */
  branchId:    string | null
  /** Quem recebe por envolvimento direto, independentemente de permissão. */
  envolvidos?: (string | null | undefined)[]
  /** Quem causou o fato. */
  ator?:       string | null
}): Promise<string[]> {
  const diretos = (params.envolvidos ?? []).filter((id): id is string => !!id)

  const responsaveis = await responsaveisPeloModulo(admin, params.modulo, params.branchId)

  const todos = new Set<string>([...diretos, ...responsaveis])
  if (params.ator) todos.delete(params.ator)
  return [...todos]
}

/** Usuários ativos com MANAGE no módulo e alcance sobre a unidade. */
async function responsaveisPeloModulo(
  admin: Admin,
  modulo: AppModule,
  branchId: string | null,
): Promise<string[]> {
  // O tenant sai da unidade; sem unidade não há a quem perguntar, e o fato
  // fica com os envolvidos diretos.
  if (!branchId) return []

  const filial = await ler(admin
    .from('branches').select('tenant_id').eq('id', branchId).maybeSingle(),
    'descobrir a rede da unidade')
  const tenantId = filial?.tenant_id as string | undefined
  if (!tenantId) return []

  const cargos = await ler(admin
    .from('role_permissions')
    .select('role_id')
    .eq('tenant_id', tenantId)
    .eq('module', modulo)
    .eq('level', 'MANAGE'), 'listar os cargos responsáveis')

  const roleIds = (cargos ?? []).map(c => c.role_id as string)
  if (roleIds.length === 0) return []

  // `branch_id` nulo é quem alcança a rede inteira (§11) — e o PostgREST não
  // tem "igual a X ou nulo" sem o `or`, que é por isso que ele está aqui.
  const pessoas = await ler(admin
    .from('users')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .in('role_id', roleIds)
    .or(`branch_id.eq.${branchId},branch_id.is.null`), 'listar quem é responsável')

  return (pessoas ?? []).map(p => p.id as string)
}

/**
 * Notifica todas as partes interessadas de uma vez.
 */
export async function notificarInteressados(
  admin: Admin,
  params: Parameters<typeof interessadosNoFato>[1],
  payload: NotifyPayload,
): Promise<void> {
  try {
    const ids = await interessadosNoFato(admin, params)
    // Em paralelo e sem derrubar nada: um aparelho com token velho não pode
    // impedir os outros de serem avisados.
    await Promise.allSettled(ids.map(id => notifyUser(admin, id, payload)))
  } catch (e) {
    console.error('[notificarInteressados]', e)
  }
}
