import {
  rotaAtendimento, rotaCliente, rotaInbox, rotaNoPortal, rotaOportunidade,
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
    case 'agendamento':  return rotaAtendimento(pathname, slug, r.id)
    case 'membro':       return filtrada('/team')
    case 'procedimento': return filtrada('/procedures')
    case 'pacote':       return filtrada('/pacotes')
    case 'produto':      return filtrada('/estoque')
  }
}
