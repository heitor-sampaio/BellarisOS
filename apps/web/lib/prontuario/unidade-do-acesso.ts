import type { TenantContext } from '@estetica-os/types'
import { alcancaUnidade } from '@/lib/auth'
import { slugDoCaminho } from '@/lib/clientes/ficha-da-requisicao'

/**
 * A unidade em que o prontuário foi ABERTO (A32 da 18ª simulação): a do
 * endereço (`x-bellaris-caminho`, "MÉTODO /slug/…"), quando é uma unidade da
 * rede ao alcance de quem abriu; senão, a do contexto (a unidade em que a
 * pessoa está, ou nula na rede, no /admin). O "Abriu o prontuário" do Dr.
 * Henrique em Derby saía sem unidade e não entrava no filtro por Derby.
 */
export function unidadeDoAcessoAoProntuario(
  ctx: Pick<TenantContext, 'branchId' | 'unidades'>, caminho: string, unidadesDaRede: readonly { id: string; slug: string }[],
): string | null {
  const slug = slugDoCaminho(caminho)
  const doEndereco = slug ? unidadesDaRede.find(u => u.slug === slug) ?? null : null
  if (doEndereco && alcancaUnidade(ctx, doEndereco.id)) return doEndereco.id
  return ctx.branchId ?? null
}
