'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, mensagemDoErro } from '@/lib/db'
import { semAcesso } from '@/lib/sem-acesso'
import { bloqueioDoSuporte } from '@/lib/suporte/travas'
import { ADICIONAIS } from '@estetica-os/nucleo/lib/planos/recursos'
import { getCachedRede, tagDaRede } from '@estetica-os/nucleo/lib/redes/cache'
import { registrarAutomatico } from '@estetica-os/nucleo/lib/redes/assinatura'
import { pedirAoSistemaLevarValor } from '@/lib/assinatura/levar-valor'

/**
 * A CLÍNICA contrata, muda ou tira um adicional do plano (2026-10-07, decisão
 * do Heitor: a clínica e o sistema contratam). Configurações → Assinatura.
 *
 * - Contrata quem é da REDE (sem unidade fixa) com configurações MANAGE: é a
 *   mensalidade da rede inteira. A sessão de suporte não contrata.
 * - O preço é sempre o do plano (ou o já contratado): a clínica não dá preço.
 * - A regra inteira (cabe no plano, a quantidade, tirar com números em uso)
 *   mora em `assinatura_adicional_definir`, a mesma do sistema.
 * - O Asaas recebe o total pelo sistema (`pedirAoSistemaLevarValor`); falhou,
 *   o cron de lá leva.
 */
export async function contratarAdicional(chave: string, quantidade: number): Promise<{ ok: true; aviso?: string } | { error: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  if (ctx.branchId !== null) throw semAcesso()
  const bloqueio = bloqueioDoSuporte(ctx, 'mudar a assinatura')
  if (bloqueio) return { error: bloqueio }
  if (!ADICIONAIS.some(a => a.chave === chave) || !Number.isInteger(quantidade)) return { error: 'Pedido inválido.' }

  const tenantId = ctx.tenantId!
  const rede = await getCachedRede(tenantId)
  if (rede?.planStatus === 'canceled') return { error: 'A assinatura está cancelada. Fale com o BellarisOS pela Ajuda.' }

  try {
    const r = await gravar(createAdminClient().rpc('assinatura_adicional_definir', {
      p_tenant: tenantId, p_chave: chave, p_quantidade: quantidade, p_valor_centavos: null,
    }), 'mudar o adicional') as { antes: unknown; depois: unknown; pendente_no_asaas: boolean }
    // O limite e as funcionalidades mudam já na próxima tela.
    updateTag(tagDaRede(tenantId))
    try {
      await registrarAutomatico('assinatura.adicional', tenantId, {
        chave, origem: 'clinica', ator: { id: ctx.internalUserId, nome: ctx.userName }, antes: r.antes, depois: r.depois,
      })
    } catch (e) { console.error('[contratarAdicional] registro:', mensagemDoErro(e)) }
    // O Asaas não confirmou agora: está gravado, e o cron do sistema leva em até uma hora.
    const levado = r.pendente_no_asaas ? await pedirAoSistemaLevarValor(tenantId) : true
    revalidatePath('/admin/settings')
    return levado ? { ok: true } : { ok: true, aviso: 'Feito. O valor novo chega à cobrança em até uma hora.' }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
