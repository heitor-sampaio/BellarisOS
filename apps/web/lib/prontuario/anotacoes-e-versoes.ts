import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeFormSchema, type AnamnesisRow } from '@/lib/anamnesis'
import { ler } from '@/lib/db'

/**
 * O que se escreve no prontuário DEPOIS do atendimento (bloco Prontuário,
 * PR2 — a revisão do Heitor, 2026-11-13: "o registro concluído não se
 * reescreve sem rastro").
 *
 * - A ANOTAÇÃO (`prontuario_anotacoes`, PR2a): o texto datado, com quem
 *   escreveu, que não se edita nem se apaga ("a cliente ligou três dias depois
 *   com vermelhidão").
 * - A VERSÃO de antes (`prontuario_versoes`, PR2b): o que o "Editar registro"
 *   trocou — a evolução, a intercorrência e a ficha do procedimento —, com
 *   quem corrigiu e quando.
 *
 * Só o servidor lê (as tabelas não têm política para a sessão). Quem chama já
 * decidiu que o dado clínico vai à tela (`canViewRecords`/`podeVerClinico`) e
 * registrou o acesso.
 */

export interface AnotacaoDoAtendimento {
  id:        string
  texto:     string
  autorNome: string
  criadaEm:  string
}

export interface VersaoDoRegistro {
  id:              string
  evolucao:        string | null
  intercorrencias: string | null
  /** A ficha do procedimento como estava (nula = não havia). */
  ficha:           { nome: string; rows: AnamnesisRow[]; respostas: Record<string, unknown> } | null
  /** Quem corrigiu (e assim substituiu esta versão) e quando. */
  editadaPorNome:  string
  substituidaEm:   string
}

export interface AnotacoesEVersoes {
  anotacoes: Record<string, AnotacaoDoAtendimento[]>
  versoes:   Record<string, VersaoDoRegistro[]>
}

function fichaDaVersao(raw: unknown): VersaoDoRegistro['ficha'] {
  if (!raw || typeof raw !== 'object') return null
  const f = raw as { name?: string; rows?: unknown; answers?: unknown }
  const rows = normalizeFormSchema({ rows: f.rows }).rows
  return {
    nome: f.name ?? 'Ficha do procedimento',
    rows,
    respostas: f.answers && typeof f.answers === 'object' ? f.answers as Record<string, unknown> : {},
  }
}

/** As anotações e as versões dos atendimentos, na ordem do tempo, por atendimento. */
export async function anotacoesEVersoes(
  admin: SupabaseClient, tenantId: string, appointmentIds: string[],
): Promise<AnotacoesEVersoes> {
  const saida: AnotacoesEVersoes = { anotacoes: {}, versoes: {} }
  const ids = [...new Set(appointmentIds.filter(Boolean))]
  if (!ids.length) return saida
  // Os atendimentos de UMA cliente: a lista é curta (o .in() viaja na URL).
  for (let i = 0; i < ids.length; i += 150) {
    const lote = ids.slice(i, i + 150)
    const [anotacoes, versoes] = await Promise.all([
      ler(admin.from('prontuario_anotacoes').select('id, appointment_id, texto, autor_nome, criada_em')
        .eq('tenant_id', tenantId).in('appointment_id', lote).order('criada_em').order('id'), 'carregar as anotações do prontuário'),
      ler(admin.from('prontuario_versoes').select('id, appointment_id, evolucao, intercorrencias, ficha, editada_por_nome, substituida_em')
        .eq('tenant_id', tenantId).in('appointment_id', lote).order('substituida_em').order('id'), 'carregar as versões do prontuário'),
    ])
    for (const a of anotacoes ?? []) {
      const lista = saida.anotacoes[a.appointment_id as string] ??= []
      lista.push({ id: a.id as string, texto: a.texto as string, autorNome: a.autor_nome as string, criadaEm: a.criada_em as string })
    }
    for (const v of versoes ?? []) {
      const lista = saida.versoes[v.appointment_id as string] ??= []
      lista.push({
        id: v.id as string,
        evolucao: (v.evolucao as string | null) ?? null,
        intercorrencias: (v.intercorrencias as string | null) ?? null,
        ficha: fichaDaVersao(v.ficha),
        editadaPorNome: v.editada_por_nome as string,
        substituidaEm: v.substituida_em as string,
      })
    }
  }
  return saida
}
