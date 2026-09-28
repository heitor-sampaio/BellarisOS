/**
 * Navegação INTEIRA (recarrega a página), de propósito.
 *
 * O normal no app é `router.push`. Estes são os casos em que ele não serve, e
 * é por aqui que passam — para o motivo ficar escrito num lugar só:
 * - rota que não é página (`/api/oauth/meta` redireciona para o Facebook);
 * - logo depois de gravar a sessão em cookie (app nativo), quando o servidor
 *   tem de ler a sessão do zero.
 *
 * A regra `no-location-assign-relative-destination` do Next (16.3) aponta
 * `window.location` com caminho interno escrito à mão; aqui o destino é
 * absoluto e o motivo, explícito.
 */
export function navegarInteira(caminho: string): void {
  window.location.assign(new URL(caminho, window.location.origin).href)
}
