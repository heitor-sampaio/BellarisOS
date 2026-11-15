/**
 * Endereços que existem nos dois portais.
 *
 * O portal (rede ou unidade) não vem do dado: vem de onde a pessoa está. Usar o
 * slug da unidade do registro para navegar trocava o portal no meio do caminho —
 * abrir um atendimento pelo perfil do cliente no /admin levava para
 * `/<unidade>/agenda/<id>`, e o mesmo acontecia com cadastrar cliente, voltar
 * para a lista e agendar.
 *
 * Quem chama passa o `pathname` (de `usePathname()`, no cliente) e o slug da
 * unidade do registro. Sem slug, a rede é o destino: é o único portal que
 * alcança qualquer unidade.
 */

/** `true` quando o caminho atual é do portal da rede. */
export function ehPortalDaRede(pathname: string): boolean {
  return pathname.startsWith('/admin')
}

/**
 * Prefixo do portal em que a pessoa está.
 *
 * Existe para que as telas iguais nos dois portais tenham UM sufixo só — é por
 * isso que `/[slug]/stock` virou `/[slug]/estoque` e `/[slug]/settings/team`
 * virou `/[slug]/team`: com nomes diferentes dos dois lados, cada helper daqui
 * precisaria de um `if`.
 */
export function portalDe(pathname: string, slug?: string | null): string {
  return ehPortalDaRede(pathname) || !slug ? '/admin' : `/${slug}`
}

/** Monta um endereço no portal atual. `sufixo` começa com barra. */
export function rotaNoPortal(pathname: string, slug: string | null | undefined, sufixo: string): string {
  return `${portalDe(pathname, slug)}${sufixo}`
}

/** Tela de um atendimento. */
export function rotaAtendimento(pathname: string, slug: string | null | undefined, appointmentId: string): string {
  return rotaNoPortal(pathname, slug, `/agenda/${appointmentId}`)
}

/**
 * Uma comanda no PDV (PDV7/CX3, a revisão do Heitor de 2026-11-13: "o
 * pagamento acontece por dentro desse PDV, seja do que for"): a unidade da
 * comanda (`?unidade=`, para o PDV da rede) e a comanda já aberta. Sem a
 * comanda, o PDV da unidade.
 */
export function rotaDaComanda(
  pathname: string, slug: string | null | undefined, unidadeId: string, comandaId?: string | null,
): string {
  const q = new URLSearchParams({ unidade: unidadeId })
  if (comandaId) q.set('comanda', comandaId)
  return `${rotaNoPortal(pathname, slug, '/pdv')}?${q.toString()}`
}

/**
 * A cliente no PDV (CX1): a "Nova venda" com ela escolhida, onde aparecem as
 * parcelas do crediário e os a receber dela nesta unidade.
 */
export function rotaDaClienteNoPdv(
  pathname: string, slug: string | null | undefined, unidadeId: string | null | undefined, clienteId: string,
): string {
  const q = new URLSearchParams()
  if (unidadeId) q.set('unidade', unidadeId)
  q.set('nova', '1')
  q.set('cliente', clienteId)
  return `${rotaNoPortal(pathname, slug, '/pdv')}?${q.toString()}`
}

/** Agenda. */
export function rotaAgenda(pathname: string, slug?: string | null): string {
  return rotaNoPortal(pathname, slug, '/agenda')
}

/** Ficha de um cliente. */
export function rotaCliente(pathname: string, slug: string | null | undefined, clientId: string): string {
  return rotaNoPortal(pathname, slug, `/clients/${clientId}`)
}

/** Lista de clientes. */
export function rotaClientes(pathname: string, slug?: string | null): string {
  return rotaNoPortal(pathname, slug, '/clients')
}

/** Caixa de entrada. `conversationId` abre a conversa já selecionada. */
export function rotaInbox(pathname: string, slug?: string | null, conversationId?: string | null): string {
  const base = rotaNoPortal(pathname, slug, '/inbox')
  return conversationId ? `${base}?c=${encodeURIComponent(conversationId)}` : base
}

/** Quadro de oportunidades. */
export function rotaOportunidades(pathname: string, slug?: string | null): string {
  return rotaNoPortal(pathname, slug, '/oportunidades')
}

/**
 * Uma oportunidade aberta no quadro: o funil dela (`?funil=`) e o card já
 * aberto (`?lead=`). Sem funil, o quadro abre no padrão — e o card só abre se
 * estiver nele.
 */
export function rotaOportunidade(
  pathname: string, slug: string | null | undefined, leadId: string, funilId?: string | null,
): string {
  const params = new URLSearchParams()
  if (funilId) params.set('funil', funilId)
  params.set('lead', leadId)
  return `${rotaOportunidades(pathname, slug)}?${params.toString()}`
}

const PARECE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A MESMA tela na outra unidade (PO1, 2026-11-14): o "Unidade: X ▾" da pessoa
 * de várias unidades troca o endereço da unidade e mantém o resto —
 * `/centro/clients?q=ana` → `/norte/clients?q=ana`. O registro de uma unidade
 * (`/centro/agenda/<id>`) não é da outra: a troca para na lista dele
 * (`/norte/agenda`), sem a busca. Fora de um portal de unidade, o painel.
 */
export function rotaNaOutraUnidade(pathname: string, slugNovo: string, busca = ''): string {
  const partes = pathname.split('?')[0]!.split('/').filter(Boolean)
  if (!partes.length || ehPortalDaRede(pathname)) return `/${slugNovo}/dashboard`
  const resto = partes.slice(1)
  const id = resto.findIndex(p => PARECE_ID.test(p))
  if (id >= 0) return `/${[slugNovo, ...resto.slice(0, id)].join('/')}`
  const sufixo = resto.length ? `/${resto.join('/')}` : '/dashboard'
  const query = busca && busca !== '?' ? (busca.startsWith('?') ? busca : `?${busca}`) : ''
  return `/${slugNovo}${sufixo}${query}`
}
