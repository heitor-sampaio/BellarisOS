import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { normalizeFormSchema } from '@/lib/anamnesis'
import { avisoDoPreAtendimento } from '@/lib/pre-atendimento/aviso'
import { respostasDaFicha, alergiasDaAnamnese, type FichaDePreAtendimento, type OrigemDaAnamnese, type AnamneseGeral } from '@/lib/anamnese-geral'
import { notifyUser } from '@/lib/notifications/notify'

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
  /**
   * As perguntas que a cliente RECEBEU (o retrato do envio): ela respondeu
   * aquelas, mesmo que a clínica tenha mexido na ficha depois. Sem ele, a ficha
   * atual da rede (a equipe responde o que vê agora).
   */
  ficha?: FichaDePreAtendimento
}): Promise<AnamneseGeral> {
  const ficha = o.ficha ?? await fichaDePreAtendimento(admin, o.tenantId)
  const respostas = respostasDaFicha(ficha.rows, o.respostas)
  // A EQUIPE regravando as MESMAS respostas não troca quem respondeu nem
  // quando: mandar a avaliação regravava a ficha que a cliente respondeu pelo
  // link como "pela equipe" (simulação de um dia de clínica, 2026-10-20). A
  // cliente confirmando ("nada mudou") renova a data — é a validade.
  const atual = o.origem !== 'EQUIPE' ? null : await ler(admin.from('medical_records').select('general_anamnesis')
    .eq('client_id', o.clientId).maybeSingle(), 'buscar a anamnese atual') as { general_anamnesis: AnamneseGeral | null } | null
  const antes = atual?.general_anamnesis
  if (antes?.versao === 2 && mesmasRespostas(antes.respostas, respostas)) {
    await gravar(admin.from('pre_atendimentos')
      .update({
        status: 'RESPONDIDO', respostas, respondido_em: new Date().toISOString(),
        origem: o.origem, respondido_por: o.porUsuario, updated_at: new Date().toISOString(),
      })
      .eq('client_id', o.clientId).eq('tenant_id', o.tenantId).eq('status', 'PENDENTE'), 'fechar o pré-atendimento')
    return antes
  }
  // O agendamento do pendente que esta resposta fecha: é a profissional dele
  // que recebe o aviso, quando quem responde é a cliente.
  const daCliente = o.origem === 'CLIENTE_APP' || o.origem === 'CLIENTE_LINK'
  const pendenteAntes = daCliente ? await ler(admin.from('pre_atendimentos').select('appointment_id')
    .eq('client_id', o.clientId).eq('tenant_id', o.tenantId).eq('status', 'PENDENTE').maybeSingle(),
    'buscar o pré-atendimento pendente') as { appointment_id: string | null } | null : null
  const anamnese: AnamneseGeral = {
    versao: 2,
    ficha,
    respostas,
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
  if (pendenteAntes?.appointment_id) await avisarAProfissional(admin, pendenteAntes.appointment_id, anamnese)
  return anamnese
}

/**
 * A cliente respondeu a ficha: a profissional do agendamento é avisada (sino e
 * celular), e o aviso diz a alergia, se houver (2026-10-21, decisão do
 * Heitor). Acessório: falhar aqui não desfaz a resposta.
 */
async function avisarAProfissional(admin: Admin, appointmentId: string, anamnese: AnamneseGeral): Promise<void> {
  try {
    const ag = await ler(admin.from('appointments').select('professional_id, scheduled_at, clients(name)')
      .eq('id', appointmentId).maybeSingle(), 'buscar o agendamento da ficha') as
      { professional_id: string | null; scheduled_at: string; clients: { name: string } | null } | null
    if (!ag?.professional_id) return
    const quando = new Date(ag.scheduled_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    const alergia = alergiasDaAnamnese(anamnese)
    await notifyUser(admin, ag.professional_id, {
      type: 'pre_atendimento_respondido',
      title: 'Ficha de saúde respondida',
      body: `${ag.clients?.name ?? 'A cliente'} respondeu a ficha para ${quando}.${alergia ? ` Atenção — alergia: ${alergia}.` : ''}`,
      data: { appointment_id: appointmentId },
    })
  } catch (e) {
    console.error('[pre-atendimento] avisar a profissional:', e)
  }
}

/** As mesmas respostas, sem olhar a ordem das chaves (e vazio = ausente). */
function mesmasRespostas(a: unknown, b: unknown): boolean {
  const limpo = (v: unknown) => Object.entries((v ?? {}) as Record<string, unknown>)
    .filter(([, x]) => x !== null && x !== undefined && x !== '' && !(Array.isArray(x) && x.length === 0))
    .sort(([k1], [k2]) => k1.localeCompare(k2))
  return JSON.stringify(limpo(a)) === JSON.stringify(limpo(b))
}

export interface PreAtendimentoPendente {
  id: string
  tenantId: string
  modo: 'COMPLETO' | 'CONFIRMAR'
  ficha: FichaDePreAtendimento
}

/** O pré-atendimento PENDENTE de uma ficha de cliente (no máximo um — índice único), ou null. */
export async function preAtendimentoPendente(admin: Admin, clientId: string): Promise<PreAtendimentoPendente | null> {
  const p = await ler(admin.from('pre_atendimentos').select('id, tenant_id, modo, ficha')
    .eq('client_id', clientId).eq('status', 'PENDENTE').maybeSingle(), 'buscar o pré-atendimento pendente') as
    { id: string; tenant_id: string; modo: 'COMPLETO' | 'CONFIRMAR'; ficha: { formId?: string; nome?: string; rows?: unknown } } | null
  if (!p) return null
  return {
    id: p.id, tenantId: p.tenant_id, modo: p.modo,
    ficha: { formId: p.ficha?.formId ?? null, nome: p.ficha?.nome ?? 'Pré-atendimento', rows: normalizeFormSchema({ rows: p.ficha?.rows }).rows },
  }
}

/**
 * Avisa a cliente do pré-atendimento que ESTE agendamento deixou pendente
 * (o gatilho cria um só por cliente: se já havia outro pendente, este
 * agendamento não criou nada e não há o que avisar de novo). Para chamar
 * dentro do `after()` dos avisos de agendamento, com o notificador de lá.
 */
export async function avisarDoPreAtendimento(
  admin: Admin,
  avisarCliente: (admin: Admin, clientId: string, p: ReturnType<typeof avisoDoPreAtendimento>) => Promise<void>,
  appointmentId: string,
): Promise<void> {
  const p = await ler(admin.from('pre_atendimentos').select('client_id, modo, appointments(branches(slug))')
    .eq('appointment_id', appointmentId).eq('status', 'PENDENTE').maybeSingle(), 'buscar o pré-atendimento do agendamento') as
    { client_id: string; modo: 'COMPLETO' | 'CONFIRMAR'; appointments: { branches: { slug: string } | null } | null } | null
  const slug = p?.appointments?.branches?.slug
  if (!p || !slug) return
  await avisarCliente(admin, p.client_id, avisoDoPreAtendimento(slug, p.modo))
}
