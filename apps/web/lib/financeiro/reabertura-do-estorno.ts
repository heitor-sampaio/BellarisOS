import { formatBRL } from '@estetica-os/utils'

/**
 * O que o estorno do pagamento do pacote reabre, dito antes de estornar (C39;
 * A6 da 19ª simulação, 2026-11-16; princípio 3). O estorno devolve o dinheiro
 * e o pacote volta a ter o valor a receber — e as sessões já feitas seguem
 * feitas: a janela dizia só o dinheiro, e o pacote com 4 das 5 sessões
 * surpreendia. Agora diz quantas foram feitas e quantas restam.
 */
export function textoDaReaberturaDoPacote(valor: number, usadas: number, total: number): string {
  const feitas = Math.max(0, Math.min(usadas, total))
  const restam = total - feitas
  const sessoes = feitas <= 0 || total <= 0 ? ''
    : restam === 0 ? ` As ${total} sessões já foram feitas.`
    : ` ${feitas} das ${total} sessões já ${feitas === 1 ? 'foi feita' : 'foram feitas'}, e o pacote segue com ${restam === 1 ? 'a 1 que resta' : `as ${restam} que restam`}.`
  return `O dinheiro volta à cliente, e o pacote volta a ter ${formatBRL(valor)} a receber.${sessoes} Para desfazer a venda, use “Cancelar pacote” na ficha.`
}
