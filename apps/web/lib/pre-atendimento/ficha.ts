import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { normalizeFormSchema } from '@/lib/anamnesis'
import { respostasDaFicha, type FichaDePreAtendimento, type OrigemDaAnamnese, type AnamneseGeral } from '@/lib/anamnese-geral'

type Admin = ReturnType<typeof createAdminClient>

/**
 * A ficha de pré-atendimento da rede (forms.tipo = PRE_ATENDIMENTO, uma por
 * rede — nasce com a rede, migration 20261020000002). Sem ela (não deveria
 * acontecer), uma ficha vazia: a tela mostra "sem perguntas" em vez de quebrar.
 */
export async function fichaDePreAtendimento(admin: Admin, tenantId: string): Promise<FichaDePreAtendimento> {
  const f = await ler(admin.from('forms').select('id, name, schema')
    .eq('tenant_id', tenantId).eq('tipo', 'PRE_ATENDIMENTO').maybeSingle(), 'buscar a ficha de pré-atendimento') as { id: string; name: string; schema: unknown } | null
  return f ? { formId: f.id, nome: f.name, rows: normalizeFormSchema(f.schema).rows } : { formId: null, nome: 'Pré-atendimento', rows: [] }
}

/**
 * Grava a anamnese geral da cliente no formato da ficha (o caminho ÚNICO: a
 * equipe na sessão, a avaliação, a cliente no app e pelo link).
 *
 * As perguntas são as da ficha ATUAL da rede, guardadas como retrato junto da
 * resposta; as respostas passam por `respostasDaFicha` (só os ids da ficha,
 * só texto). O pré-atendimento PENDENTE da cliente fecha com elas — quem
 * respondeu na clínica não precisa responder de novo no app.
 *
 * Não confere permissão nem a cliente: quem chama já conferiu (é um núcleo).
 */
export async function gravarAnamneseGeral(admin: Admin, o: {
  tenantId: string
  clientId: string
  respostas: unknown
  origem: Exclude<OrigemDaAnamnese, 'LEGADO'>
  porUsuario: string | null
}): Promise<AnamneseGeral> {
  const ficha = await fichaDePreAtendimento(admin, o.tenantId)
  const anamnese: AnamneseGeral = {
    versao: 2,
    ficha,
    respostas: respostasDaFicha(ficha.rows, o.respostas),
    respondidoEm: new Date().toISOString(),
    origem: o.origem,
    respondidoPor: o.porUsuario,
  }
  await gravar(admin.from('medical_records').upsert(
    { client_id: o.clientId, general_anamnesis: anamnese },
    { onConflict: 'client_id' },
  ), 'salvar a anamnese')
  await gravar(admin.from('pre_atendimentos')
    .update({
      status: 'RESPONDIDO', respostas: anamnese.respostas, respondido_em: anamnese.respondidoEm,
      origem: o.origem, respondido_por: o.porUsuario, updated_at: anamnese.respondidoEm,
    })
    .eq('client_id', o.clientId).eq('tenant_id', o.tenantId).eq('status', 'PENDENTE'), 'fechar o pré-atendimento')
  return anamnese
}
