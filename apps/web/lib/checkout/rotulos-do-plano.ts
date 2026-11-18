import { formatBRL } from '@estetica-os/utils'

/**
 * A20 da 24ª simulação (princípios 3 e 7): no checkout do plano, "Receber o
 * plano" era o título da janela E o botão final — e o botão não dizia quanto
 * entrava. Ele diz, como o "Receber R$ X" da comanda do atendimento; sem nada a
 * receber agora (o crediário sem entrada, o a receber), fecha a comanda.
 * Puro: roda no navegador.
 */
export function rotuloDoReceberOPlano(valorAgora: number): string {
  return valorAgora > 0 ? `Receber ${formatBRL(valorAgora)}` : 'Fechar a comanda'
}
