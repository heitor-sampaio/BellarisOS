import type { FalaDaRede } from '@/lib/clientes/fala-da-rede'

/**
 * A cliente ARQUIVADA (`clients.is_active = false`, J-23 — 2026-10-30): não se
 * agenda nem se vende para ela até reativar. A ficha desliga os botões, e o
 * servidor recusa com esta frase — no núcleo da agenda
 * (`conferirPecasDoAgendamento`) e nas três vendas (procedimento, pacote,
 * produto). O histórico e o prontuário ficam.
 */
export const CLIENTE_ARQUIVADA = 'Esta cliente está arquivada. Reative a ficha (em "Mais ações") para agendar ou vender.'

/**
 * A arquivada no APP dela (o Heitor: "concordo", F6 da 5ª simulação,
 * 2026-11-02): o agendar mostra esta frase e o cartão da unidade, e
 * `createClientAppointment` recusa com ela. Com o NOME da rede (CA1, o
 * "Concordo" de 13/11): "Fale com Estética Bella para agendar."
 */
export function clienteArquivadaNoApp(fala: FalaDaRede): string {
  return `${fala.FaleCom} para agendar.`
}
