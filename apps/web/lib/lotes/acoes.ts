import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { liberarInterrompidas, INTERROMPIDA } from '@/lib/whatsapp/historico-uazapi'

/**
 * Configurações → Ações em lote (2026-10-13): o que roda em segundo plano e
 * demora, num formato só, para a tela acompanhar. Cada tipo traduz a sua
 * tabela para `AcaoEmLote` — hoje, o histórico do WhatsApp Web
 * (`whatsapp_historicos`). Tipo novo entra aqui com o seu tradutor e o seu
 * "tentar de novo" (`actions/acoes-em-lote.ts`).
 */

export type TipoDeAcao = 'historico_whatsapp'
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

/** As ações da rede, da mais recente para a mais antiga (as 50 últimas). */
export async function acoesEmLote(tenantId: string): Promise<AcaoEmLote[]> {
  await liberarInterrompidas({ tenantId })
  const linhas = await ler(createAdminClient().from('whatsapp_historicos')
    .select('id, status, etapa, conversas, total_conversas, mensagens, erro, criada_em, iniciada_em, concluida_em, whatsapp_numbers(label, provider, is_active)')
    .eq('tenant_id', tenantId).order('criada_em', { ascending: false }).limit(50), 'ler as ações em lote') as Linha[] | null
  return (linhas ?? []).map(doHistorico)
}
