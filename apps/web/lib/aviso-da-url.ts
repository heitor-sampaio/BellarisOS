/**
 * Os avisos que um redirecionamento do servidor deixa para a tela de destino
 * (`?aviso=<chave>`, J-29, 2026-10-30). Quem redireciona usa `comAviso`; a
 * tela mostra com `<AvisoDaUrl>` (o toast de sempre) e tira o parâmetro da
 * URL. Só chave conhecida vira texto: a URL é do navegador.
 */
export const AVISOS_DA_URL = {
  // O Heitor, 2026-11-16: "Abrimos a sua" lia-se como "criamos uma unidade
  // para você". Nada se cria: a pessoa pediu uma unidade fora do alcance e
  // está na dela. O aviso diz onde ela está.
  'outra-unidade':  'Essa unidade não está entre as suas. Você está na sua unidade.',
  // A23 da 15ª: a pessoa pediu a rede — o aviso diz de quem ela é, pela abrangência.
  'portal-da-rede': 'O portal da rede é de quem tem “A rede inteira”. Você está na sua unidade.',
  // C61 (F70): o primeiro acesso (o /setup) é configuração da rede toda — só da
  // Admin da rede (o Heitor, 18/11). Leva ao painel da unidade ou ao da rede.
  'setup-da-rede':  'A configuração inicial da rede é só da Admin da rede. Você está no painel.',
  // A14 da 13ª (F70): "?unidade=" no portal de uma unidade abria esta, calado.
  'filtro-de-unidade': 'Aqui é o portal desta unidade: para ver outra, troque de unidade no menu ou use o portal da rede.',
  // A21 da 26ª: a aba de Relatórios fora da permissão abria outra, calada (lib/relatorios/aba-pedida).
  'aba-de-relatorio': 'Essa aba de Relatórios não está na sua permissão. Você está na primeira que ela abre.',
  'aba-de-relatorio-inexistente': 'Essa aba de Relatórios não existe. Você está na primeira que a sua permissão abre.',
  // D5 da 30ª (UN-13; decisão do Claude, 25/11): o endereço da unidade desativada dava 404.
  // Com `?desativada=<slug>`, a faixa troca "Essa unidade" pelo nome dela, lido do banco.
  'unidade-desativada': 'Essa unidade foi desativada. Você está na sua unidade.',
  'unidade-desativada-rede': 'Essa unidade foi desativada. O que ficou nela está no portal da rede, no filtro de unidade de cada tela.',
  // A8 da 38ª (decisão do Claude, 27/11, pelo CLAUDE.md §6): o `?c=` de uma conversa da rede fora
  // das caixas do cargo abria calado em "Selecione uma conversa". Nada da conversa é dito.
  'conversa-fora-do-alcance': 'Essa conversa é de um número de WhatsApp que o seu cargo não vê no Inbox.',
} as const

export type ChaveDoAviso = keyof typeof AVISOS_DA_URL

/** O caminho com o aviso na URL. */
export function comAviso(caminho: string, chave: ChaveDoAviso): string {
  return `${caminho}${caminho.includes('?') ? '&' : '?'}aviso=${chave}`
}

/**
 * O texto da chave. `nomeDaDesativada` (D5 da 30ª): o nome da unidade
 * desativada, que a tela resolve pelas unidades da rede (nunca o texto da
 * URL) — só os avisos da unidade desativada o usam.
 */
export function textoDoAviso(chave: string | null, nomeDaDesativada?: string | null): string | null {
  const texto = chave && Object.hasOwn(AVISOS_DA_URL, chave) ? AVISOS_DA_URL[chave as ChaveDoAviso] : null
  if (texto && nomeDaDesativada && chave?.startsWith('unidade-desativada')) {
    return texto.replace(/^Essa unidade/, `A unidade ${nomeDaDesativada}`)
  }
  return texto
}
