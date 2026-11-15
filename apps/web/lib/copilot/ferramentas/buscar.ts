import 'server-only'
import { z } from 'zod/v4'
import { buscarTudo } from '@/actions/busca'
import { destinoDoResultado } from '@/lib/busca/destino'
import { can } from '@/lib/auth'
import type { FerramentaDeLeitura } from '@/lib/copilot/ferramentas/tipos'

/**
 * A busca universal da topbar (`buscarTudo`), como ferramenta: o mesmo alcance
 * — quem não acha um registro na tela própria não o acha por aqui.
 */
export const buscar: FerramentaDeLeitura<{ termo: string }> = {
  nome: 'buscar',
  tipo: 'leitura',
  // D2 da 16ª: a busca só traz o que a tela própria de cada tipo mostra — o
  // membro, só a quem tem a Equipe. O profissional de um agendamento não se
  // procura aqui: `agendar` e `horarios_livres` o acham pelo nome, entre quem atende.
  descricao: 'Procura no sistema por nome, telefone ou texto o que a pessoa vê nas telas dela: clientes, agendamentos, oportunidades, conversas, procedimentos, pacotes, produtos e — só a quem tem a Equipe — membros da equipe. Use para achar o id de alguém antes de outra ferramenta. O PROFISSIONAL de um atendimento não se procura aqui: passe o nome dele direto em agendar, remarcar ou horarios_livres, que acham entre quem atende (e, sem achar, dizem quem atende).',
  parametros: z.object({ termo: z.string().min(2).max(80).describe('O que procurar (nome, telefone…).') }),
  async executar(c, { termo }) {
    const r = await buscarTudo(termo, c.slugDoPortal)
    if (r.error) return { dados: { erro: r.error } }
    const semEquipe = !can(c.ctx, 'team', 'VIEW')
    // Da CONVERSA vai só o nome: o subtítulo é o trecho da última mensagem do
    // paciente, que costuma ter queixa de saúde — não vai à OpenAI.
    const itens = (r.grupos ?? []).flatMap(g => g.itens).map(i => ({
      tipo: i.tipo, id: i.id, titulo: i.titulo, detalhe: i.tipo === 'conversa' ? null : i.subtitulo,
      href: destinoDoResultado(c.pagina, c.slugDoPortal, i),
    }))
    return {
      dados: itens.length ? { resultados: itens } : {
        resultados: [],
        aviso: semEquipe
          ? 'Nada encontrado. Membros da equipe não aparecem nesta busca (a permissão desta pessoa não inclui a Equipe). Se é um profissional, passe o nome dele direto em agendar ou horarios_livres: elas acham entre quem atende e dizem quem atende.'
          : 'Nada encontrado.',
      },
      cartao: itens.length
        ? { tipo: 'links', titulo: `Encontrado para "${termo}"`, itens: itens.slice(0, 8).map(i => ({ texto: i.titulo, detalhe: i.detalhe ?? undefined, href: i.href })) }
        : undefined,
    }
  },
}
