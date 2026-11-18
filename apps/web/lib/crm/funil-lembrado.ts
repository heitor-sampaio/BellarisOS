/**
 * O último funil escolhido no seletor (A34 da 23ª simulação; princípio 7):
 * voltar às Oportunidades pelo menu abria no padrão. O `FunnelSelect` anota a
 * escolha neste cookie; o quadro e a aba Comercial o leem quando o endereço
 * não traz `?funil=` (`funilDoDashboard`, que ignora o que não é um funil
 * ativo da rede).
 */
export const COOKIE_DO_FUNIL = 'bellaris-funil'
