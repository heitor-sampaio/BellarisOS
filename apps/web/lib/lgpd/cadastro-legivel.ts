/**
 * O gênero da ficha no pacote da LGPD, por extenso (D18 da 31ª, LG-11: "com as
 * situações por extenso"): o PDF dizia "F". Os nomes são os do cadastro
 * (`components/branch/client-form.tsx`).
 */
const GENERO: Record<string, string> = {
  F: 'Feminino', M: 'Masculino', O: 'Outro', N: 'Prefiro não informar',
}

export function generoNoPacote(codigo: string | null | undefined): string | null {
  if (!codigo) return null
  return GENERO[codigo] ?? codigo
}

/**
 * A conta no app no pacote (A3 da 31ª, princípio 3): `app_account_created_at`
 * é a hora do PRIMEIRO ACESSO (o layout do portal a grava na primeira
 * entrada), e o pacote dizia "criada em". Com o login e sem entrada, diz isso.
 */
export function linhaDaContaNoApp(p: { primeiroAcessoEm: string | null; temLogin: boolean }): string {
  if (p.primeiroAcessoEm) return `primeiro acesso em ${p.primeiroAcessoEm}`
  return p.temLogin ? 'acesso criado, ainda sem entrada no app' : 'não possui'
}
