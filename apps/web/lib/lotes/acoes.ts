import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { liberarInterrompidas, INTERROMPIDA } from '@/lib/whatsapp/historico-uazapi'
import { manterImportacoes, INTERROMPIDA_IMPORTACAO } from '@/lib/importacao/processar'

/**
 * Configurações → Ações em lote (2026-10-13): o que roda em segundo plano e
 * demora, num formato só, para a tela acompanhar. Cada tipo traduz a sua
 * tabela para `AcaoEmLote` — o histórico do WhatsApp Web
 * (`whatsapp_historicos`) e a importação de contatos (`importacoes`). Tipo novo entra aqui com o seu tradutor e o seu
 * "tentar de novo" (`actions/acoes-em-lote.ts`).
 */

export type TipoDeAcao = 'historico_whatsapp' | 'importacao_contatos'
export type EstadoDaAcao = 'aguardando' | 'em_andamento' | 'concluida' | 'falhou' | 'interrompida'

export interface AcaoEmLote {
  id:          string
  tipo:        TipoDeAcao
  titulo:      string
  /** Sobre o quê (a caixa, no histórico). */
  alvo:        string
  estado:      EstadoDaAcao
  /** O que está fazendo agora, em português. */
  etapa:       string | null
  /** Progresso: quanto já foi, de quanto (null = não se sabe o total). */
  feito:       number | null
  total:       number | null
  /** "12 de 80 conversas · 200 mensagens", "12 conversas, 340 mensagens novas". */
  resumo:      string | null
  erro:        string | null
  criadaEm:    string
  iniciadaEm:  string | null
  concluidaEm: string | null
  podeRepetir: boolean
  /** O relatório de erros, quando há (a importação). */
  linkDosErros?: string | null
  /** Quantas linhas no relatório (para o rótulo do link). */
  errosNoRelatorio?: number
}

const ETAPAS: Record<string, string> = {
  aguardando_whatsapp: 'Esperando o WhatsApp terminar de mandar o histórico ao aparelho conectado',
  importando:          'Trazendo as conversas para o inbox',
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

type Linha = {
  id: string; status: string; etapa: string | null; conversas: number; total_conversas: number | null
  mensagens: number; erro: string | null; criada_em: string; iniciada_em: string | null; concluida_em: string | null
  whatsapp_numbers: { label: string; provider: string; is_active: boolean } | { label: string; provider: string; is_active: boolean }[] | null
}

function doHistorico(l: Linha): AcaoEmLote {
  const caixa = Array.isArray(l.whatsapp_numbers) ? l.whatsapp_numbers[0] : l.whatsapp_numbers
  const interrompida = l.status === 'falhou' && (l.erro ?? '').startsWith(INTERROMPIDA)
  const estado: EstadoDaAcao = interrompida ? 'interrompida'
    : l.status === 'pendente' ? 'aguardando'
    : l.status === 'importando' ? 'em_andamento'
    : l.status === 'concluida' ? 'concluida' : 'falhou'
  const conversas = l.total_conversas
    ? `${l.conversas} de ${plural(l.total_conversas, 'conversa', 'conversas')}`
    : plural(l.conversas, 'conversa', 'conversas')
  const resumo = estado === 'concluida'
    ? `${plural(l.conversas, 'conversa', 'conversas')}, ${plural(l.mensagens, 'mensagem nova', 'mensagens novas')}`
    : estado === 'em_andamento' && l.etapa === 'importando'
      ? `${conversas} · ${plural(l.mensagens, 'mensagem', 'mensagens')}`
      : l.conversas || l.mensagens ? `${conversas} · ${plural(l.mensagens, 'mensagem', 'mensagens')}` : null
  return {
    id: l.id, tipo: 'historico_whatsapp', titulo: 'Histórico do WhatsApp',
    alvo: caixa?.label ?? 'Número removido',
    estado,
    etapa: estado === 'em_andamento' ? ETAPAS[l.etapa ?? ''] ?? null : estado === 'aguardando' ? 'Na fila' : null,
    feito: l.conversas, total: l.total_conversas,
    resumo, erro: l.erro, criadaEm: l.criada_em, iniciadaEm: l.iniciada_em, concluidaEm: l.concluida_em,
    podeRepetir: ['concluida', 'falhou', 'interrompida'].includes(estado)
      && !!caixa && caixa.provider === 'uazapi' && caixa.is_active,
  }
}

type LinhaDaImportacao = {
  id: string; destino: string; nome_arquivo: string; status: string; total: number; processadas: number
  novas: number; completadas: number; sem_mudanca: number; com_erro: number; oportunidades: number
  erro: string | null; erros: unknown[]; criada_em: string; iniciada_em: string | null; concluida_em: string | null
}

function daImportacao(l: LinhaDaImportacao): AcaoEmLote {
  const interrompida = l.status === 'falhou' && (l.erro ?? '').startsWith(INTERROMPIDA_IMPORTACAO)
  const estado: EstadoDaAcao = interrompida ? 'interrompida'
    : l.status === 'pendente' ? 'aguardando'
    : l.status === 'importando' ? 'em_andamento'
    : l.status === 'concluida' ? 'concluida' : 'falhou'
  const partes = [
    plural(l.novas, l.destino === 'clientes' ? 'novo' : 'novo', 'novos'),
    plural(l.completadas, 'completado', 'completados'),
    l.sem_mudanca ? plural(l.sem_mudanca, 'sem mudança', 'sem mudança') : null,
    l.com_erro ? plural(l.com_erro, 'com erro', 'com erro') : null,
    l.oportunidades ? plural(l.oportunidades, 'oportunidade', 'oportunidades') : null,
  ].filter(Boolean)
  const relatorio = Array.isArray(l.erros) ? l.erros.length : 0
  return {
    id: l.id, tipo: 'importacao_contatos',
    titulo: l.destino === 'clientes' ? 'Importação de clientes' : 'Importação de contatos',
    alvo: l.nome_arquivo, estado,
    etapa: estado === 'em_andamento' ? 'Gravando as linhas' : estado === 'aguardando' ? 'Na fila' : null,
    feito: l.processadas, total: l.total,
    resumo: estado === 'em_andamento'
      ? `${l.processadas} de ${plural(l.total, 'linha', 'linhas')} · ${partes.join(', ')}`
      : partes.length ? partes.join(', ') : null,
    erro: l.erro, criadaEm: l.criada_em, iniciadaEm: l.iniciada_em, concluidaEm: l.concluida_em,
    // Interrompida ou falhou continua de onde parou; concluída não se repete
    // (as linhas do arquivo já saíram — importa-se o arquivo de novo).
    podeRepetir: estado === 'falhou' || estado === 'interrompida',
    linkDosErros: relatorio ? `/api/importacoes/${l.id}/erros` : null,
    errosNoRelatorio: relatorio,
  }
}

/** As ações da rede, da mais recente para a mais antiga (as 50 últimas de cada tipo). */
export async function acoesEmLote(tenantId: string): Promise<AcaoEmLote[]> {
  await Promise.all([liberarInterrompidas({ tenantId }), manterImportacoes(tenantId)])
  const admin = createAdminClient()
  const [linhas, importacoes] = await Promise.all([
    ler(admin.from('whatsapp_historicos')
      .select('id, status, etapa, conversas, total_conversas, mensagens, erro, criada_em, iniciada_em, concluida_em, whatsapp_numbers(label, provider, is_active)')
      .eq('tenant_id', tenantId).order('criada_em', { ascending: false }).limit(50), 'ler as ações em lote') as Promise<Linha[] | null>,
    ler(admin.from('importacoes')
      .select('id, destino, nome_arquivo, status, total, processadas, novas, completadas, sem_mudanca, com_erro, oportunidades, erro, erros, criada_em, iniciada_em, concluida_em')
      .eq('tenant_id', tenantId).order('criada_em', { ascending: false }).limit(50), 'ler as importações') as Promise<LinhaDaImportacao[] | null>,
  ])
  return [...(linhas ?? []).map(doHistorico), ...(importacoes ?? []).map(daImportacao)]
    .sort((a, b) => b.criadaEm.localeCompare(a.criadaEm))
}
