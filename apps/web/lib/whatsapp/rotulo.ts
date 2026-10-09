/**
 * O NOME de uma conexão de WhatsApp (`whatsapp_numbers.label`) — o que a
 * clínica lê no inbox, nos templates e nos vínculos (2026-10-09).
 *
 * Escolhido por ela ao conectar. Sem escolha, o nome da conta na Meta (nome
 * verificado e telefone) — nunca o id técnico do número: o formulário manual
 * da API oficial gravava o `phoneNumberId`, e a tela de templates mostrava
 * "1372302949310529" como o número. Puro de propósito (teste unitário).
 */

/** Tamanho que cabe nos selos e listas da tela. */
export const MAX_ROTULO = 60

/** "Clínica Bella · +55 48 99999-0000", do que a Graph devolve do número. */
export function nomeDaMeta(n?: { verified_name?: string | null; display_phone_number?: string | null } | null): string | null {
  const partes = [n?.verified_name, n?.display_phone_number].map(p => p?.trim()).filter(Boolean)
  return partes.length ? partes.join(' · ') : null
}

/**
 * O nome que a conexão grava:
 *  1. o escolhido agora;
 *  2. o que ela já tem — reconectar ou salvar a credencial não renomeia —,
 *     desde que seja um nome de verdade (não o id técnico nem o genérico);
 *  3. o da conta na Meta;
 *  4. o genérico.
 */
export function rotuloDaConexao(o: {
  escolhido?: string | null
  atual?:     string | null
  daMeta?:    string | null
  /** O id técnico (o phoneNumberId), que já foi gravado como nome. */
  tecnico?:   string | null
  padrao:     string
}): string {
  const limpo = (s?: string | null) => s?.trim() || null
  const escolhido = limpo(o.escolhido)
  const atual = limpo(o.atual)
  const atualVale = atual && atual !== limpo(o.tecnico) && atual !== o.padrao ? atual : null
  return (escolhido ?? atualVale ?? limpo(o.daMeta) ?? o.padrao).slice(0, MAX_ROTULO)
}
