import { comAviso } from '@/lib/aviso-da-url'

/**
 * D5 da 30ª simulação (plataforma:UN-13; CLAUDE.md §6, "Redirecionamento por
 * abrangência leva o motivo"; princípio 7; decisão do Claude, 25/11). Puro: o
 * layout de `[slug]`, a tela da unidade desativada e o destino do login leem
 * daqui.
 *
 * O endereço da unidade desativada dava "Página não encontrada" — sem aviso a
 * quem tem outras unidades, e sem saída a quem só tinha ela. Agora:
 * - quem tem "A rede inteira" vai ao portal da rede, com o aviso;
 * - quem tem outras vai à principal (a primeira ATIVA das dela), com o aviso
 *   "A unidade X foi desativada" (o nome sai do banco: `?desativada=<slug>`);
 * - quem só tinha unidades desativadas vai à tela que diz o fato e quem
 *   procurar, com "Sair" (`/auth/unidade-desativada`);
 * - o endereço que não existe segue 404.
 */
export interface UnidadeDaRede { id: string; slug: string; name: string; is_active: boolean }

export type SaidaDoEndereco = { tipo: 'nao-existe' } | { tipo: 'abre' } | { tipo: 'redirecionar'; para: string }

/** As unidades da pessoa, na ordem dela (a principal primeiro), lidas da rede. */
function dela(todas: readonly UnidadeDaRede[], unidades: readonly string[]): UnidadeDaRede[] {
  return unidades.map(id => todas.find(u => u.id === id)).filter((u): u is UnidadeDaRede => !!u)
}

const TELA_DA_DESATIVADA = '/auth/unidade-desativada'

/** A tela de quem não tem unidade ativa: com a unidade pedida (se é dela), senão a principal. */
function paraATela(pedida: UnidadeDaRede | undefined, minhas: readonly UnidadeDaRede[]): string {
  const qual = pedida && minhas.some(u => u.id === pedida.id) ? pedida : minhas[0] ?? pedida
  return qual ? `${TELA_DA_DESATIVADA}?unidade=${encodeURIComponent(qual.slug)}` : TELA_DA_DESATIVADA
}

/**
 * Para onde vai quem abre `/<slug>/…`. `unidades` = a abrangência
 * (`unidadesDoContexto`: nulo = "A rede inteira"; senão a principal primeiro).
 */
export function saidaDoEndereco(args: {
  slug: string; todas: readonly UnidadeDaRede[]; unidades: readonly string[] | null
}): SaidaDoEndereco {
  const pedida = args.todas.find(u => u.slug === args.slug)
  if (!pedida) return { tipo: 'nao-existe' }
  const alcanca = args.unidades === null || args.unidades.includes(pedida.id)
  if (pedida.is_active && alcanca) return { tipo: 'abre' }
  const desativada = `desativada=${encodeURIComponent(pedida.slug)}`
  if (args.unidades === null) return { tipo: 'redirecionar', para: comAviso(`/admin/dashboard?${desativada}`, 'unidade-desativada-rede') }
  const minhas = dela(args.todas, args.unidades)
  const ativa = minhas.find(u => u.is_active)
  if (!ativa) return { tipo: 'redirecionar', para: paraATela(pedida, minhas) }
  // A desativada é dela: o aviso diz o fato. Fora do alcance (ativa ou não), o de sempre.
  if (alcanca) return { tipo: 'redirecionar', para: comAviso(`/${ativa.slug}/dashboard?${desativada}`, 'unidade-desativada') }
  return { tipo: 'redirecionar', para: comAviso(`/${ativa.slug}/dashboard`, 'outra-unidade') }
}

/**
 * A tela da unidade desativada (`/auth/unidade-desativada`): o nome que ela
 * diz — a pedida, se é da pessoa; senão a principal dela. Quem tem uma ativa
 * (reativada depois) ou "A rede inteira" não fica presa: vai a ela.
 */
export function unidadeDaTelaDesativada(args: {
  pedida: string | null; todas: readonly UnidadeDaRede[]; unidades: readonly string[] | null
}): { tipo: 'fechada'; nome: string | null } | { tipo: 'redirecionar'; para: string } {
  if (args.unidades === null) return { tipo: 'redirecionar', para: '/admin/dashboard' }
  const minhas = dela(args.todas, args.unidades)
  const ativa = minhas.find(u => u.is_active)
  if (ativa) return { tipo: 'redirecionar', para: `/${ativa.slug}/dashboard` }
  const pedida = minhas.find(u => u.slug === args.pedida)
  return { tipo: 'fechada', nome: (pedida ?? minhas[0])?.name ?? null }
}

/**
 * A unidade em que a pessoa da equipe entra (PO1): a última usada, se ainda é
 * dela e está ativa; senão a principal ativa; senão a primeira ativa das dela;
 * sem nenhuma ativa, a principal (o layout a leva à tela da desativada). Nulo
 * quando não acha a principal.
 */
export function escolherUnidadeDeEntrada(args: {
  minhas: readonly string[]; linhas: readonly Pick<UnidadeDaRede, 'id' | 'slug' | 'is_active'>[]; ultima: string | null
}): string | null {
  const doMembro = args.minhas.map(id => args.linhas.find(b => b.id === id)).filter((b): b is NonNullable<typeof b> => !!b)
  const ultima = args.ultima ? doMembro.find(b => b.slug === args.ultima && b.is_active) : undefined
  if (ultima) return ultima.slug
  const ativa = doMembro.find(b => b.is_active)
  return (ativa ?? doMembro[0])?.slug ?? null
}
