import { formatBRL } from '@estetica-os/utils'
import { BAIXA_NO_FINANCEIRO } from '@/lib/plano-de-tratamento/textos'

/**
 * As duas regras do pacote que são da REDE (itens 8 e 9 da auditoria das
 * regras, 2026-11-18 — decisões do Claude pelo princípio 1, "a rede decide";
 * do pacote vencido, o Heitor respondeu em 18/11: "configuração da rede").
 * Configurações → Geral, ao lado da validade do plano proposto.
 *
 * - `crediarioLibera` (`tenants.pacote_crediario_libera`, padrão LIGADO, como
 *   era desde a A41 da 11ª): o pacote vendido no crediário libera as sessões
 *   antes de quitado, e a tela avisa o que falta. Desligado, a sessão do
 *   pacote com valor em aberto não se agenda (nem se usa para abater um
 *   avulso) até o pacote estar pago; a tela diz por quê e leva ao PDV.
 * - `vencidoCancela` (`tenants.pacote_vencido_cancela`, padrão DESLIGADO, como
 *   era): ligada, o pacote vencido com sessão que sobrou se cancela pela conta
 *   de sempre (`pacote_cancelar_devolvendo`), e a ficha oferece o "Cancelar".
 *
 * Puro: a tela, o servidor e o teste leem daqui.
 */
export interface RegrasDoPacote { crediarioLibera: boolean; vencidoCancela: boolean }

export const REGRAS_DO_PACOTE_PADRAO: RegrasDoPacote = { crediarioLibera: true, vencidoCancela: false }

/** A linha de `tenants` → as regras (sem linha ou sem coluna, o padrão). */
export function lerRegrasDoPacote(linha: { pacote_crediario_libera?: boolean | null; pacote_vencido_cancela?: boolean | null } | null | undefined): RegrasDoPacote {
  return {
    crediarioLibera: linha?.pacote_crediario_libera ?? REGRAS_DO_PACOTE_PADRAO.crediarioLibera,
    vencidoCancela:  linha?.pacote_vencido_cancela ?? REGRAS_DO_PACOTE_PADRAO.vencidoCancela,
  }
}

/** A sessão do pacote com dinheiro em aberto, na rede que só libera depois de pago: o porquê da recusa. */
export function recusaDaSessaoNaoLiberada(regras: RegrasDoPacote, emAberto: number): string | null {
  if (regras.crediarioLibera || !(emAberto > 0)) return null
  return `Este pacote ainda tem ${formatBRL(emAberto)} em aberto, e a rede libera as sessões do pacote no crediário só depois de pago. O que falta se recebe no PDV. ${BAIXA_NO_FINANCEIRO}`
}

/** O fim do aviso do em aberto do pacote (`AvisoDoPacoteEmAberto`), pela regra da rede. */
export function textoDoPacoteEmAberto(liberaAsSessoes: boolean): string {
  return liberaAsSessoes
    ? `As sessões seguem liberadas; o que falta se recebe no PDV. ${BAIXA_NO_FINANCEIRO}`
    : `As sessões se liberam quando ele estiver pago; o que falta se recebe no PDV. ${BAIXA_NO_FINANCEIRO}`
}

/**
 * Item 9: o pacote VENCIDO com sessão que sobrou, como a ficha o mostra (o
 * "Cancelar pacote" dele, com a conta de sempre). `venceuEm`: dd/mm/aaaa, no
 * fuso da unidade do pacote.
 */
export interface PacoteVencidoDaFicha { id: string; nome: string; restantes: number; venceuEm: string }

/**
 * O pacote VENCIDO que a ficha oferece cancelar (só com a regra ligada): não
 * cancelado, com a validade passada e com sessão que sobrou. O primeiro da lista.
 */
export function pacoteVencidoParaCancelar<T extends {
  cancelado_em?: string | null; expires_at?: string | null; package_sessions?: { status: string }[] | null
}>(pacotes: T[], regras: RegrasDoPacote, agora: Date = new Date()): T | null {
  if (!regras.vencidoCancela) return null
  return pacotes.find(p => !p.cancelado_em && !!p.expires_at && new Date(p.expires_at) < agora
    && (p.package_sessions ?? []).some(s => s.status === 'AVAILABLE')) ?? null
}
