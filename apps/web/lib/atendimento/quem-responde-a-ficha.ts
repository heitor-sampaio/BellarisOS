import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { can } from '@/lib/auth'
import { quemRespondeAFichaDeSaude } from '@/lib/equipe/quem-desfaz'
import { textoDeQuemRespondeAFicha } from '@/lib/equipe/textos-de-quem-pode'

/**
 * A8 da 25ª simulação (princípio 7; atendimento.md, "Quem não vê o clínico"):
 * quem conclui (ou gera o plano) sem o Prontuário em Gerenciar para na
 * obrigatória da ficha de saúde em branco — a regra fica —, e a recusa diz
 * QUEM a responde. Para `oQueFaltaParaSeguir`: só lê os nomes se faltar.
 * Com o Prontuário em Gerenciar, nada a acrescentar (é ela quem responde).
 */
export function aQuemPedirAFichaDeSaude(ctx: TenantContext, branchId: string | null): (() => Promise<string>) | undefined {
  return can(ctx, 'medical_records', 'MANAGE') ? undefined
    : async () => textoDeQuemRespondeAFicha(await quemRespondeAFichaDeSaude(ctx.tenantId!, branchId))
}
