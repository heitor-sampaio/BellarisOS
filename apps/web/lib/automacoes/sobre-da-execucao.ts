/**
 * De quem é uma execução de automação, para a linha da lista dizer (A18 da 29ª
 * simulação, o princípio 7). O fluxo guarda o nome em `contexto.cliente` (ou
 * `contexto.lead`) quando lê a pessoa; o lembrete que ainda espera — ou que só
 * mandou a mensagem — não o tem. Sem ele, a cliente do FATO: `clienteId` do
 * evento (ou o próprio evento de cliente) e, sem isso, a do agendamento do
 * evento — o servidor lê o nome (`listarExecucoes`), na rede da sessão.
 */
interface ContextoLido {
  cliente?: { nome?: unknown } | null
  lead?:    { nome?: unknown } | null
  evento?:  { entidade?: unknown; entidadeId?: unknown; dados?: Record<string, unknown> | null } | null
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export function deQuemEAExecucao(contexto: unknown): { nome: string | null; clienteId: string | null; agendamentoId: string | null } {
  const c = (contexto ?? null) as ContextoLido | null
  const nome = texto(c?.cliente?.nome) ?? texto(c?.lead?.nome)
  if (nome) return { nome, clienteId: null, agendamentoId: null }
  const e = c?.evento
  const clienteId = (e?.entidade === 'cliente' ? texto(e.entidadeId) : null) ?? texto(e?.dados?.clienteId)
  if (clienteId) return { nome: null, clienteId, agendamentoId: null }
  const agendamentoId = e?.entidade === 'agendamento' ? texto(e.entidadeId) : texto(e?.dados?.agendamentoId)
  return { nome: null, clienteId: null, agendamentoId }
}
