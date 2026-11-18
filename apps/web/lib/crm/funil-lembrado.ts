/**
 * O último funil escolhido no seletor (A34 da 23ª simulação; princípio 7):
 * voltar às Oportunidades pelo menu abria no padrão. O `FunnelSelect` anota a
 * escolha neste cookie; o quadro e a aba Comercial o leem quando o endereço
 * não traz `?funil=` (`funilDoDashboard`, que ignora o que não é um funil
 * ativo da rede).
 *
 * O link `?funil=` também conta como escolha (A42 da 24ª; princípio 3): quem
 * abria o funil pelo endereço voltava ao padrão. O lembrado é DESTE navegador
 * (o cookie), e a dica do seletor diz isso.
 */
export const COOKIE_DO_FUNIL = 'bellaris-funil'

/** O cookie que lembra o funil (um ano, o site inteiro). */
export function cookieDoFunilLembrado(id: string): string {
  return `${COOKIE_DO_FUNIL}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`
}

/**
 * O funil do endereço que se lembra: o `?funil=` que a tela de fato abriu.
 * Pedido que não valeu (outra rede, inativo — abriu outro) ou sem pedido: nada.
 */
export function funilParaLembrar(pedido: string | null | undefined, aberto: string): string | null {
  return pedido && pedido === aberto ? aberto : null
}
