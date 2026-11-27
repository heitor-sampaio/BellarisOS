import type { TenantContext } from '@estetica-os/types'
import type { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { propagarDadosDaPessoa } from '@/lib/contatos/propagar'

type Admin = ReturnType<typeof createAdminClient>

/**
 * A cliente cadastrada (ou a ficha que já existia, unificada ou reativada)
 * PELA CONVERSA ou pelo card do quadro: o contato dela passa a ter o nome e o e-mail da ficha (D4 da
 * 38ª simulação; crm-inbox:CL-14 e IN-06, princípio 3 — uma pessoa, um dado).
 * Quem cadastra pela conversa já disse quem é, e o efeito é o do "Sim, é a
 * mesma pessoa" (`ligarPessoaDoCrmAoCliente`): a conversa seguia "Lena ✨" com
 * a ficha "Helena Zanella", e a busca pelo nome da ficha não a achava.
 *
 * O nome vai pela mesma porta da ficha renomeada (`propagarDadosDaPessoa`): à
 * pessoa, às conversas e às oportunidades dela. O e-mail, só ao contato (a
 * oportunidade tem a cópia dela), e só quando a ficha tem um. O contato que já
 * é de OUTRA ficha não muda (nunca se religa). Não mexe na ficha, no login nem
 * na senha.
 */
export async function levarAFichaAoContato(
  admin: Admin, ctx: TenantContext, de: { conversationId?: string | null; leadId?: string | null }, clientId: string,
): Promise<void> {
  const tenantId = ctx.tenantId!
  // A pessoa da conversa; sem conversa, a do card (o cadastro pelo quadro, que também já disse quem é).
  const origem = de.conversationId
    ? await ler(admin.from('conversations').select('contato_id')
      .eq('id', de.conversationId).eq('tenant_id', tenantId).maybeSingle(), 'buscar o contato da conversa')
    : de.leadId
      ? await ler(admin.from('leads').select('contato_id')
        .eq('id', de.leadId).eq('tenant_id', tenantId).maybeSingle(), 'buscar o contato da oportunidade')
      : null
  const contatoId = (origem as { contato_id: string | null } | null)?.contato_id ?? null
  if (!contatoId) return

  const [contato, ficha] = await Promise.all([
    ler(admin.from('contacts').select('client_id, name, email')
      .eq('id', contatoId).eq('tenant_id', tenantId).maybeSingle(), 'buscar o contato') as Promise<{ client_id: string | null; name: string | null; email: string | null } | null>,
    ler(admin.from('clients').select('name, email')
      .eq('id', clientId).eq('tenant_id', tenantId).maybeSingle(), 'buscar a ficha') as Promise<{ name: string | null; email: string | null } | null>,
  ])
  if (!contato || !ficha) return
  if (contato.client_id && contato.client_id !== clientId) return

  const email = ficha.email?.trim().toLowerCase() || null
  const patch: Record<string, unknown> = {}
  if (!contato.client_id) patch.client_id = clientId
  if (email && email !== (contato.email ?? '').trim().toLowerCase()) patch.email = email
  if (Object.keys(patch).length) {
    await gravar(admin.from('contacts').update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', contatoId).eq('tenant_id', tenantId), 'levar o e-mail da ficha ao contato')
  }

  const nome = ficha.name?.replace(/\s+/g, ' ').trim() ?? ''
  if (nome && nome !== (contato.name ?? '').trim()) await propagarDadosDaPessoa(admin, ctx, contatoId, { nome })
}
