import 'server-only'
import { z } from 'zod/v4'
import { buscarTudo } from '@/actions/busca'
import { destinoDoResultado } from '@/lib/busca/destino'
import type { FerramentaDeLeitura } from '@/lib/copilot/ferramentas/tipos'

/**
 * A busca universal da topbar (`buscarTudo`), como ferramenta: o mesmo alcance
 * — quem não acha um registro na tela própria não o acha por aqui.
 */
export const buscar: FerramentaDeLeitura<{ termo: string }> = {
  nome: 'buscar',
  tipo: 'leitura',
  descricao: 'Procura no sistema por nome, telefone ou texto: clientes, agendamentos, oportunidades, conversas, procedimentos, pacotes, produtos e membros da equipe. Use para achar o id de alguém antes de outra ferramenta.',
  parametros: z.object({ termo: z.string().min(2).max(80).describe('O que procurar (nome, telefone…).') }),
  async executar(c, { termo }) {
    const r = await buscarTudo(termo, c.slugDoPortal)
    if (r.error) return { dados: { erro: r.error } }
    const itens = (r.grupos ?? []).flatMap(g => g.itens).map(i => ({
      tipo: i.tipo, id: i.id, titulo: i.titulo, detalhe: i.subtitulo,
      href: destinoDoResultado(c.pagina, c.slugDoPortal, i),
    }))
    return {
      dados: itens.length ? { resultados: itens } : { resultados: [], aviso: 'Nada encontrado.' },
      cartao: itens.length
        ? { tipo: 'links', titulo: `Encontrado para "${termo}"`, itens: itens.slice(0, 8).map(i => ({ texto: i.titulo, detalhe: i.detalhe ?? undefined, href: i.href })) }
        : undefined,
    }
  },
}
