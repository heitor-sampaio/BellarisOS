import { banco } from './banco'

/**
 * Apaga uma rede que o TESTE criou pelo /sistema (ou pelo cadastro): sem
 * unidade, com o responsável, os cargos-sistema, o contrato padrão, a
 * assinatura e o registro da plataforma. Devolve o que não conseguiu apagar —
 * quem chama confere (`expect(falhas).toEqual([])`).
 */
export async function apagarRedeCriada(tenantId: string): Promise<string[]> {
  const db = banco()
  const falhas: string[] = []
  const passo = async (o: string, p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p
    if (error) falhas.push(`${o}: ${error.message}`)
  }
  const { data: membros } = await db.from('users').select('id, auth_id').eq('tenant_id', tenantId)
  for (const m of (membros ?? []) as { id: string; auth_id: string | null }[]) {
    await passo('notificações', db.from('user_notifications').delete().eq('user_id', m.id))
  }
  await passo('faturas', db.from('subscription_invoices').delete().eq('tenant_id', tenantId))
  await passo('assinatura', db.from('tenant_subscriptions').delete().eq('tenant_id', tenantId))
  await passo('registro da plataforma', db.from('platform_audit_log').delete().eq('tenant_id', tenantId))
  await passo('membros', db.from('users').delete().eq('tenant_id', tenantId))
  for (const m of (membros ?? []) as { id: string; auth_id: string | null }[]) {
    if (m.auth_id) {
      const { error } = await db.auth.admin.deleteUser(m.auth_id)
      if (error && !/not found/i.test(error.message)) falhas.push(`login: ${error.message}`)
    }
  }
  await passo('versões de documento', db.from('document_template_versions').delete().eq('tenant_id', tenantId))
  await passo('modelos de documento', db.from('document_templates').delete().eq('tenant_id', tenantId))
  await passo('permissões', db.from('role_permissions').delete().eq('tenant_id', tenantId))
  await passo('cargos', db.from('tenant_roles').delete().eq('tenant_id', tenantId))
  await passo('eventos', db.from('domain_events').delete().eq('tenant_id', tenantId))
  await passo('rede', db.from('tenants').delete().eq('id', tenantId))
  return falhas
}
