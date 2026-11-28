import type { TenantContext } from '@estetica-os/types'

/**
 * A assinatura do que o MENU mostra (LO-06; A7 da 43ª): o menu nasce no layout
 * do portal, e a navegação do Next mantém o layout — mudado o cargo (ou a
 * matriz dele, as unidades, o "Atende", o plano), o menu ficava o de antes até
 * recarregar. O layout dá esta assinatura ao `MenuEmDia`, que a cada navegação
 * pergunta a de agora (`/api/menu`) e redesenha se mudou.
 *
 * Só o que vem do cargo e da pessoa — nunca a unidade do endereço
 * (`ctx.branchId` da pessoa de várias unidades muda com a URL, e a rota da API
 * não tem endereço): da abrangência entra só "é da rede inteira".
 */
export function assinaturaDoMenu(ctx: TenantContext): string {
  const texto = JSON.stringify(ordenado({
    permissions: ctx.permissions,
    reportTabs: [...(ctx.reportTabs ?? [])].sort(),
    plano: ctx.plano ?? null,
    atende: ctx.providesServices,
    comissaoDeVenda: ctx.comissaoDeVenda ?? false,
    daRede: ctx.branchId === null,
    unidades: ctx.unidades === undefined ? null : ctx.unidades === null ? null : [...ctx.unidades].sort(),
    adminDaRede: ctx.isNetworkAdmin,
    semCargo: ctx.semCargo ?? false,
    cargo: ctx.roleLabel,
  }))
  // FNV-1a de 32 bits: curta, e igual no servidor que a calcula duas vezes.
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** As chaves em ordem, em qualquer profundidade: a mesma matriz dá o mesmo texto. */
function ordenado(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenado)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map(k => [k, ordenado((v as Record<string, unknown>)[k])]))
  }
  return v
}
