/**
 * A cliente ARQUIVADA (`clients.is_active = false`, J-23 — 2026-10-30): não se
 * agenda nem se vende para ela até reativar. A ficha desliga os botões, e o
 * servidor recusa com esta frase — no núcleo da agenda
 * (`conferirPecasDoAgendamento`) e nas três vendas (procedimento, pacote,
 * produto). O histórico e o prontuário ficam.
 */
export const CLIENTE_ARQUIVADA = 'Esta cliente está arquivada. Reative a ficha (em "Mais ações") para agendar ou vender.'
