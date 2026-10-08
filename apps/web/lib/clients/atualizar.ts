import 'server-only'
import { revalidatePath, revalidateTag } from 'next/cache'
import type { TenantContext } from '@estetica-os/types'
import { EVENTOS } from '@estetica-os/types'
import type { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { emitirEventoDeCliente } from '@/lib/events/cliente'
import { camposAlterados } from '@/lib/events/emitir'

type Admin = ReturnType<typeof createAdminClient>

const COLUNAS_DO_EVENTO = 'name, phone, email, birth_date, document, tags, gender, notes, city'

/**
 * Atualizar o cadastro de um cliente — o núcleo que a ficha
 * (`updateClientContactData`) e o Copilot dividem (2026-10-08). Não confere o
 * MÓDULO (quem chama confere); confere a rede, o CPF repetido, e emite o
 * "dados alterados" só quando algo mudou.
 *
 * `colunas` já vêm no formato do banco (dígitos, e-mail normalizado) e são
 * PARCIAIS: só o que veio muda.
 */
export async function atualizarClienteCore(
  admin: Admin, ctx: TenantContext, clientId: string, colunas: Record<string, unknown>,
  /** A unidade de onde saiu a edição — a ficha existe nos dois portais. */
  slug?: string | null,
): Promise<{ error?: string }> {
  // O estado ANTERIOR, para o evento poder dizer O QUE mudou — a automação
  // pergunta "foi o telefone?", não só "mudou?".
  const antes = await ler(admin.from('clients').select(COLUNAS_DO_EVENTO)
    .eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cliente')
  if (!antes) return { error: 'Cliente não encontrado.' }

  if (colunas.document) {
    const dup = await ler(admin.from('clients').select('id, name')
      .eq('tenant_id', ctx.tenantId!).eq('document', colunas.document as string).neq('id', clientId)
      .limit(1).maybeSingle(), 'buscar o cliente')
    if (dup) return { error: `CPF já cadastrado para ${dup.name}.` }
  }

  await gravar(admin.from('clients').update({ ...colunas, updated_at: new Date().toISOString() })
    .eq('id', clientId).eq('tenant_id', ctx.tenantId!), 'atualizar o cliente')

  const depois = await ler(admin.from('clients').select(COLUNAS_DO_EVENTO)
    .eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cliente')
  const alterou = camposAlterados(antes ?? {}, depois ?? {})
  // Salvar sem mexer em nada é comum — abriu a aba, clicou em salvar. Emitir
  // aí faria toda automação de "dados alterados" disparar à toa.
  if (alterou.length > 0) {
    await emitirEventoDeCliente(EVENTOS.CLIENTE_DADOS_ALTERADOS, clientId, ctx, { alterou })
  }

  if (slug) revalidatePath(`/${slug}/clients/${clientId}`)
  revalidatePath(`/admin/clients/${clientId}`)
  revalidateTag(`clients:${ctx.tenantId!}`, 'max')
  return {}
}
