/**
 * Endereços que existem nos dois portais.
 *
 * O portal (rede ou unidade) não vem do dado: vem de onde a pessoa está. Quem
 * opera a rede alcança todas as unidades, e usar o slug da filial do registro
 * para navegar trocava o portal no meio do caminho — abrir um atendimento pelo
 * perfil do cliente no /admin levava para /<unidade>/agenda/<id>.
 */

/** `true` quando o caminho atual é do portal da rede. */
export function ehPortalDaRede(pathname: string): boolean {
  return pathname.startsWith('/admin')
}

/** Tela de um atendimento, no portal em que a pessoa está. */
export function rotaAtendimento(pathname: string, slug: string, appointmentId: string): string {
  return ehPortalDaRede(pathname)
    ? `/admin/agenda/${appointmentId}`
    : `/${slug}/agenda/${appointmentId}`
}
