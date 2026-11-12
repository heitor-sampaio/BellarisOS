/**
 * Os avisos que um redirecionamento do servidor deixa para a tela de destino
 * (`?aviso=<chave>`, J-29, 2026-10-30). Quem redireciona usa `comAviso`; a
 * tela mostra com `<AvisoDaUrl>` (o toast de sempre) e tira o parâmetro da
 * URL. Só chave conhecida vira texto: a URL é do navegador.
 */
export const AVISOS_DA_URL = {
  'outra-unidade':  'Você não tem acesso a essa unidade. Abrimos a sua.',
  'portal-da-rede': 'O portal da rede é de quem atende todas as unidades. Abrimos a sua.',
  // C61 (F70): o primeiro acesso da clínica (o /setup) é de quem é da rede.
  'setup-da-rede':  'O primeiro acesso da clínica é de quem é da rede. Abrimos a sua unidade.',
  // A14 da 13ª (F70): "?unidade=" no portal de uma unidade abria esta, calado.
  'filtro-de-unidade': 'Aqui é o portal desta unidade: para ver outra, troque de unidade no menu ou use o portal da rede.',
} as const

export type ChaveDoAviso = keyof typeof AVISOS_DA_URL

/** O caminho com o aviso na URL. */
export function comAviso(caminho: string, chave: ChaveDoAviso): string {
  return `${caminho}${caminho.includes('?') ? '&' : '?'}aviso=${chave}`
}

export function textoDoAviso(chave: string | null): string | null {
  return chave && Object.hasOwn(AVISOS_DA_URL, chave) ? AVISOS_DA_URL[chave as ChaveDoAviso] : null
}
