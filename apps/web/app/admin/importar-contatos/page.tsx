import { getTenantContext, assertAnyPermission, can } from '@/lib/auth'
import { ImportarContatos } from '@/app/_shared/importar-contatos'

/**
 * Importar contatos pelo portal da rede: a unidade dos clientes é escolhida.
 * Fora de `clients/` de propósito: o layout de lá pede `clients: VIEW`, e quem
 * só tem o CRM (a SDR com uma lista de leads) também importa.
 */
export default async function AdminImportarContatosPage() {
  const ctx = await getTenantContext()
  assertAnyPermission(ctx, ['clients', 'crm'], 'MANAGE')
  return <ImportarContatos unidadeFixa={null} voltarPara={can(ctx, 'clients', 'VIEW') ? '/admin/clients' : '/admin/oportunidades'} />
}
