import {
  ehPortalDaRede, rotaAgenda, rotaAtendimento, rotaCliente, rotaInbox, rotaNoPortal, rotaOportunidade, rotaOportunidades,
} from '@/lib/rotas'
import type { ResultadoDaBusca } from '@/lib/busca/tipos'

/**
 * Para onde cada resultado leva — sempre no portal em que a pessoa está
 * (`lib/rotas.ts`), nunca no da unidade do registro.
 *
 * Membro, procedimento, pacote e produto não têm tela própria: abrem a lista
 * já filtrada pelo nome (`?q=`).
 */
export function destinoDoResultado(
  pathname: string, slug: string | null, r: ResultadoDaBusca,
): string {
  const filtrada = (sufixo: string) =>
    `${rotaNoPortal(pathname, slug, sufixo)}?q=${encodeURIComponent(r.titulo)}`

  switch (r.tipo) {
    case 'acao':         return r.href ?? rotaNoPortal(pathname, slug, '/dashboard')
    case 'pagina':       return r.href ?? rotaNoPortal(pathname, slug, '/dashboard')
    case 'cliente':      return rotaCliente(pathname, slug, r.id)
    case 'conversa':     return rotaInbox(pathname, slug, r.id)
    case 'oportunidade': return rotaOportunidade(pathname, slug, r.id, r.funilId)
    // A pessoa sem oportunidade (A15): o "Novo lead" do quadro, com os dados dela.
    case 'contato':      return `${rotaOportunidades(pathname, slug)}?contato=${encodeURIComponent(r.id)}`
    // D5 da 29ª (AL-01): quem tem a Agenda e não o Atendimento abre o
    // agendamento na agenda, no dia dele (no portal da rede, na unidade dele).
    case 'agendamento':  return r.abreNaAgenda ? naAgenda(pathname, slug, r) : rotaAtendimento(pathname, slug, r.id)
    case 'membro':       return filtrada('/team')
    case 'procedimento': return filtrada('/procedures')
    case 'pacote':       return filtrada('/pacotes')
    case 'produto':      return filtrada('/estoque')
  }
}

/** A agenda no dia do agendamento, com ele aberto (`?agendamento=`). */
function naAgenda(pathname: string, slug: string | null, r: ResultadoDaBusca): string {
  const q = new URLSearchParams()
  if (r.dia) q.set('date', r.dia)
  if (ehPortalDaRede(pathname) && r.unidadeId) q.set('unidade', r.unidadeId)
  q.set('agendamento', r.id)
  return `${rotaAgenda(pathname, slug)}?${q.toString()}`
}
