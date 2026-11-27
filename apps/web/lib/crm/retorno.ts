/**
 * O lembrete de retorno da oportunidade (A42 da 9ª simulação, 2026-11-07): o
 * DIA combinado para retomar o contato (`leads.retornar_em`) e o que fazer
 * (`retornar_obs`). É aviso para a pessoa — no dia, o sino de quem tem o lead
 * (cron `crm-lembretes`) —, nunca movimento do card (princípio 6).
 */

/** O dia digitado ("2026-11-12"), ou nulo (vazio = sem lembrete). Data impossível também é nulo. */
export function diaDoRetorno(valor: string | null | undefined): string | null {
  const v = (valor ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T12:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v
}

/** O que o card diz: "Retornar hoje", "Retornar 12/11", "Retorno atrasado (10/11)". */
export function textoDoRetorno(dia: string, hoje: string): { texto: string; atrasado: boolean; hoje: boolean } {
  const [, m, d] = dia.split('-')
  if (dia === hoje) return { texto: 'Retornar hoje', atrasado: false, hoje: true }
  if (dia < hoje) return { texto: `Retorno atrasado (${d}/${m})`, atrasado: true, hoje: false }
  return { texto: `Retornar ${d}/${m}`, atrasado: false, hoje: false }
}

/**
 * O lembrete como o card o mostra. No card ganho ou perdido (o desfecho da
 * etapa, `WON`/`LOST`), o dia sem destaque, nem "hoje" nem "atrasado": esse
 * card não avisa no sino (OP-33), e a tela segue o mesmo (A7 da 35ª, Decisão
 * C2 — decisão do Claude, 27/11, pelo princípio 3).
 */
export function retornoNoCard(
  dia: string,
  hoje: string,
  desfecho: string | null | undefined,
): { texto: string; destaque: 'hoje' | 'atrasado' | null } {
  if (desfecho === 'WON' || desfecho === 'LOST') {
    const [, m, d] = dia.split('-')
    return { texto: `Retornar ${d}/${m}`, destaque: null }
  }
  const r = textoDoRetorno(dia, hoje)
  return { texto: r.texto, destaque: r.atrasado ? 'atrasado' : r.hoje ? 'hoje' : null }
}

/**
 * O aviso do sino no dia do retorno (cron `crm-lembretes`). O atrasado sem
 * observação dizia "Hoje é o dia combinado…" (CRM-07, varredura de 18/11 —
 * princípio 3: a tela diz o que vale): agora diz o dia que era.
 */
export function avisoDoRetorno(
  l: { nome: string; dia: string; obs: string | null },
  hoje: string,
): { title: string; body: string } {
  const r = textoDoRetorno(l.dia, hoje)
  const [, m, d] = l.dia.split('-')
  const title = r.atrasado ? `Retorno atrasado: ${l.nome} (${d}/${m})` : `Retorno de hoje: ${l.nome}`
  if (l.obs) return { title, body: `Combinado: ${l.obs}` }
  return {
    title,
    body: r.atrasado
      ? `O dia combinado para retomar o contato com ${l.nome} era ${d}/${m}.`
      : `Hoje é o dia combinado para retomar o contato com ${l.nome}.`,
  }
}
