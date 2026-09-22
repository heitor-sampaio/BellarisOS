import { createAdminClient } from '@/lib/supabase/admin'

/** O clique de anúncio que trouxe esta pessoa, e o anúncio. */
export interface CliqueDeAnuncio {
  ctwaClid: string
  adId:     string | null
}

/**
 * De qual clique de anúncio veio um cliente.
 *
 * A ordem das tentativas é da mais barata para a mais cara, e é também da mais
 * confiável para a menos: o carimbo em `clients.ctwa_clid` é o que foi gravado
 * quando o contato virou cliente; a conversa é a fonte original; e só então as
 * mensagens, que é onde o dado nasce mas exige varrer o histórico.
 *
 * Devolve `null` quando a pessoa não veio de anúncio — o caso comum, e não um
 * erro. Quem chama simplesmente não manda evento.
 */
export async function cliqueDoCliente(
  tenantId: string,
  clientId: string,
): Promise<CliqueDeAnuncio | null> {
  const admin = createAdminClient()

  const { data: cliente } = await admin
    .from('clients')
    .select('ctwa_clid')
    .eq('id', clientId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (cliente?.ctwa_clid) {
    // O anúncio vem da conversa; o clique sozinho já basta para atribuir.
    const ad = await adDaConversaDoCliente(tenantId, clientId)
    return { ctwaClid: cliente.ctwa_clid as string, adId: ad }
  }

  // Sem carimbo: a conversa do contato ainda pode saber. Acontece com quem
  // virou cliente antes de esta coluna existir.
  const { data: conv } = await admin
    .from('conversations')
    .select('attribution')
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const atr = (conv?.attribution ?? {}) as Record<string, string | undefined>
  if (atr.ctwa_clid) return { ctwaClid: atr.ctwa_clid, adId: atr.ad_id ?? null }

  return null
}

/** O anúncio da conversa deste cliente, quando houver. */
async function adDaConversaDoCliente(tenantId: string, clientId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('conversations')
    .select('attribution')
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const atr = (data?.attribution ?? {}) as Record<string, string | undefined>
  return atr.ad_id ?? null
}

/**
 * Telefone e e-mail do cliente, para a Meta casar a pessoa.
 *
 * Vão com hash no envio (`lib/ads/capi.ts`); aqui saem crus porque é quem
 * monta o payload que decide o hash — e assim este módulo não precisa saber
 * das regras de normalização da Meta.
 */
export async function contatoDoCliente(
  tenantId: string,
  clientId: string,
): Promise<{ phone: string | null; email: string | null }> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('clients')
    .select('phone, email')
    .eq('id', clientId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return { phone: data?.phone ?? null, email: data?.email ?? null }
}
