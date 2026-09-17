/**
 * Endereços que existem nos dois portais.
 *
 * O portal (rede ou unidade) não vem do dado: vem de onde a pessoa está. Usar o
 * slug da filial do registro para navegar trocava o portal no meio do caminho —
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

/** Cadastro de cliente. */
export function rotaNovoCliente(pathname: string, slug?: string | null): string {
  return rotaNoPortal(pathname, slug, '/clients/new')
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

/** Checkout de planos de tratamento; sem `planId`, a lista de propostas. */
export function rotaCheckout(pathname: string, slug?: string | null, planId?: string | null): string {
  return rotaNoPortal(pathname, slug, planId ? `/checkout/${planId}` : '/checkout')
}
