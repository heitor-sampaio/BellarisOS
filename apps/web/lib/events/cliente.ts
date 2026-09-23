import { createAdminClient } from '@/lib/supabase/admin'
import { emitirEvento, atorDoContexto, ATOR_SISTEMA } from './emitir'
import type { NomeDeEvento, AtorDoEvento, DadosDeCliente } from '@estetica-os/types'

/**
 * Emite um evento de cliente com o retrato dele junto.
 *
 * Mesmo motivo do ajudante da agenda: são quatro eventos que precisam dos
 * mesmos nome, telefone e e-mail, e montar o retrato em cada ponto seria a
 * forma mais fácil de dois eventos do mesmo cliente saírem diferentes.
 *
 * `alterou` só faz sentido em `cliente.dados_alterados` — é ele que separa
 * "o cliente mudou" de "o TELEFONE do cliente mudou", que é a pergunta que a
 * automação realmente faz.
 */
export async function emitirEventoDeCliente(
  nome: NomeDeEvento,
  clientId: string,
  ctx: { tenantId?: string | null; internalUserId?: string | null; userName?: string | null },
  extras?: { alterou?: string[]; ator?: AtorDoEvento; origem?: 'app' | 'webhook' | 'cron' },
): Promise<void> {
  try {
    if (!ctx.tenantId) return
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('clients')
      .select('id, branch_id, name, phone, email, is_active')
      .eq('id', clientId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle()

    if (error) console.error('[eventoDeCliente] retrato:', error.message)

    const dados: DadosDeCliente = {
      nome:     (data?.name  as string) ?? null,
      telefone: (data?.phone as string) ?? null,
      email:    (data?.email as string) ?? null,
      ativo:    (data?.is_active as boolean) ?? undefined,
    }
    if (extras?.alterou?.length) dados.alterou = extras.alterou

    await emitirEvento(nome, {
      tenantId:   ctx.tenantId,
      branchId:   (data?.branch_id as string) ?? null,
      entidadeId: clientId,
      dados,
      ator:       extras?.ator ?? (ctx.internalUserId ? atorDoContexto(ctx) : ATOR_SISTEMA),
      origem:     extras?.origem ?? 'app',
      // `dados_alterados` acontece muitas vezes para o mesmo cliente e cada uma
      // é um fato novo; os outros três são marcos e não se repetem.
      chave: nome === 'cliente.dados_alterados' ? undefined : `${nome}:${clientId}`,
    })
  } catch (e) {
    console.error('[eventoDeCliente]', nome, (e as Error).message)
  }
}
