/**
 * Abrir a busca universal de outra tela (A19 da 21ª simulação: o fim da
 * importação manda achar os contatos sem oportunidade na busca). A busca da
 * topbar escuta este evento, como escuta o Ctrl K.
 */
export const EVENTO_DE_ABRIR_A_BUSCA = 'bellaris:abrir-a-busca'

export function abrirABusca(): void {
  window.dispatchEvent(new Event(EVENTO_DE_ABRIR_A_BUSCA))
}
