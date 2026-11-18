import 'server-only'
import { z } from 'zod/v4'
import { buscarTudo } from '@/actions/busca'
import { destinoDoResultado } from '@/lib/busca/destino'
import { can } from '@/lib/auth'
import type { FerramentaDeLeitura } from '@/lib/copilot/ferramentas/tipos'
import { idsDasUnidades, unidadesDaRede } from '@/lib/copilot/ferramentas/comum'

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
    // A33 da 23ª (princípio 3): a busca recorta os agendamentos pela unidade
    // da tela (busca.md), e o cartão não dizia — a cliente parecia não ter o
    // da outra unidade. Quem alcança mais de uma, na tela de uma, lê de qual.
    const recorte = itens.some(i => i.tipo === 'agendamento') ? await unidadeDoRecorte(c) : null
    const titulo = `Encontrado para "${termo}"${recorte ? ` · agendamentos só de ${recorte}` : ''}`
    return {
      dados: itens.length ? {
        resultados: itens,
        ...(recorte ? { recorte: `Os agendamentos são só de ${recorte} (a unidade da tela). Para os das outras unidades, use agendamentos.` } : {}),
      } : {
        resultados: [],
        aviso: semEquipe
          ? 'Nada encontrado. Membros da equipe não aparecem nesta busca (a permissão desta pessoa não inclui a Equipe). Se é um profissional, passe o nome dele direto em agendar ou horarios_livres: elas acham entre quem atende e dizem quem atende.'
          : 'Nada encontrado.',
      },
      cartao: itens.length
        ? { tipo: 'links', titulo, itens: itens.slice(0, 8).map(i => ({ texto: i.titulo, detalhe: i.detalhe ?? undefined, href: i.href })) }
        : undefined,
    }
  },
}

/**
 * O nome da unidade que recorta a busca (`ctx.branchId ?? a unidade do slug`,
 * como `buscarTudo`) — só quando a pessoa alcança mais de uma: com uma só,
 * não há outra de que falar.
 */
async function unidadeDoRecorte(c: Parameters<typeof buscar.executar>[0]): Promise<string | null> {
  const todas = await unidadesDaRede(c)
  const id = c.ctx.branchId
    ?? (c.slugDoPortal ? (todas as { id: string; slug?: string }[]).find(u => u.slug === c.slugDoPortal)?.id ?? null : null)
  if (!id) return null
  if ((await idsDasUnidades(c, null)).length < 2) return null
  return todas.find(u => u.id === id)?.name ?? null
}
