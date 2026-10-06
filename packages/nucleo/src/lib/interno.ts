import { timingSafeEqual } from 'node:crypto'

/**
 * A conversa ENTRE os apps (2026-10-06). O sistema e o suporte mudam coisas
 * cujo CACHE mora no processo da clínica — a situação da rede (`rede:<id>`,
 * lida a cada tela pelo `buildContext`) e a sessão de suporte
 * (`suporte-sessao:<id>`). O `updateTag` de um processo não chega ao outro:
 * eles pedem à clínica, por `/api/interno/expirar`.
 *
 * A rota é pública no proxy (como toda `/api/*`): se defende pelo segredo
 * (`INTERNO_SECRET`, 32+ caracteres, comparado em tempo constante; sem ele,
 * recusa tudo) e só expira o que a lista fechada deixa — nada de tag de
 * permissão ou de outro cache. A lista: `rede:`, `suporte-sessao:`, `user:`
 * (o membro, que o suporte reativa) e `plataforma:` (o atendente, que o
 * sistema desativa e cujo cache mora também no suporte). O mesmo handler
 * atende os três apps (`rotaDeExpirar`, em `plataforma/expirar-na-clinica.ts`).
 *
 * É ACESSÓRIO: o TTL (60 s da rede, 15 s da sessão) e a RLS, que barra na
 * hora pelo estado no banco, seguem valendo se o aviso falhar. Isto é para a
 * TELA não ficar atrasada.
 */
export function segredoInternoConfere(cabecalho: string | null | undefined, segredo = process.env.INTERNO_SECRET): boolean {
  if (!segredo || segredo.length < 32 || !cabecalho?.startsWith('Bearer ')) return false
  const a = Buffer.from(cabecalho.slice('Bearer '.length))
  const b = Buffer.from(segredo)
  return a.length === b.length && timingSafeEqual(a, b)
}

const TAG_PERMITIDA = /^(rede|suporte-sessao|user|plataforma):[0-9a-f-]{36}$/

/** As tags do pedido, se TODAS forem da lista fechada; senão, null (recusa o pedido inteiro). */
export function tagsParaExpirar(corpo: unknown): string[] | null {
  const tags = (corpo as { tags?: unknown } | null)?.tags
  if (!Array.isArray(tags) || tags.length === 0 || tags.length > 50) return null
  if (!tags.every(t => typeof t === 'string' && TAG_PERMITIDA.test(t))) return null
  return tags as string[]
}
