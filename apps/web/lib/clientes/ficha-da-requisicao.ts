/**
 * Qual ficha da cliente vale NESTA requisição (2026-10-19).
 *
 * A mesma pessoa pode ser cliente de várias clínicas com um login só: uma ficha
 * em cada rede (`clients_um_login_por_rede`). A clínica é a do ENDEREÇO — o
 * primeiro pedaço do caminho é o slug da unidade, e o proxy anota o caminho em
 * `x-bellaris-caminho` (a action posta na rota da página, então vale para ela
 * também). Assim duas abas, ou dois aparelhos, em clínicas diferentes não se
 * atropelam. A claim `client_id` do token é só a marca "é cliente": fora de
 * um portal (api, auth, raiz) ela desempata.
 *
 * - o slug é de uma unidade da clínica de uma ficha dela → essa ficha;
 * - é o portal (`/<slug>/cliente…`) de uma clínica em que ela não tem ficha → 'fora';
 * - fora de um portal → a ficha da marca do token, ou a primeira;
 * - sem ficha nenhuma → null (quem chama fica com a claim, como antes).
 */
export interface FichaDoLogin {
  clientId: string
  tenantId: string
  /**
   * O slug da unidade da ficha (`clients.branch_id`) — é o endereço do portal
   * dela, e é ÚNICO no sistema inteiro (`branches_slug_unico`): o endereço
   * nunca aponta para duas fichas dela.
   */
  slug: string | null
  /**
   * Os slugs de TODAS as unidades ativas da clínica (rede) da ficha (H5,
   * 2026-11-02: "A cliente é da clínica, pode agendar em qualquer unidade da
   * clínica"). O portal de qualquer uma delas abre esta ficha — a Marlene da
   * Moinhos em `/zona-sul/cliente` é a mesma ficha. Até aqui só o `slug` da
   * unidade de cadastro valia, e a Zona Sul voltava à Moinhos sem aviso.
   */
  slugsDaClinica?: string[]
}

/** O primeiro pedaço do caminho ("MÉTODO /caminho?query") — o slug, quando é uma rota de unidade. */
export function slugDoCaminho(caminho: string): string | null {
  const rota = (caminho.includes(' ') ? caminho.slice(caminho.indexOf(' ') + 1) : caminho).split('?')[0] ?? ''
  return rota.split('/').filter(Boolean)[0] ?? null
}

export function fichaDaRequisicao<F extends FichaDoLogin>(
  fichas: F[], caminho: string, marcaDoToken: string | null,
): F | 'fora' | null {
  if (!fichas.length) return null
  // "MÉTODO /caminho?query" → os pedaços do caminho.
  const rota = (caminho.includes(' ') ? caminho.slice(caminho.indexOf(' ') + 1) : caminho).split('?')[0] ?? ''
  const [primeiro, segundo] = rota.split('/').filter(Boolean)

  const daClinica = primeiro
    ? fichas.find(f => f.slug === primeiro) ?? fichas.find(f => f.slugsDaClinica?.includes(primeiro))
    : undefined
  if (daClinica) return daClinica
  if (primeiro && segundo === 'cliente') return 'fora'

  return fichas.find(f => f.clientId === marcaDoToken) ?? fichas[0]!
}
