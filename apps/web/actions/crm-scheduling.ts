'use server'

// Agendamento a partir do CRM (/admin) — reutiliza o núcleo createAppointmentCore.
// Garante o cliente (lead de rede -> cliente de rede) antes de agendar.
// A filial do agendamento (branchId) é a UNIDADE onde o cliente será atendido —
// é a dimensão de métrica por unidade (o cliente pertence à rede).

import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarEventoLead } from '@/lib/lead-events'
import { garantirClienteRapido } from '@/lib/clients/cliente-rapido'
import {
  createAppointmentCore,
  computeAvailableSlots,
  notifyAppointmentCreated,
} from '@/lib/appointments/core'
import {
  getCachedBranchProfessionals,
  getCachedBranchProcedures,
  getCachedRoomsByBranch,
} from '@/lib/cached-queries'
import { revalidatePath, revalidateTag } from 'next/cache'
import { gravar, ler } from '@/lib/db'


export interface CrmSchedProcedure { id: string; name: string; duration_min: number; price: number }
export interface CrmSchedNamed     { id: string; name: string }

export interface CrmSchedulingData {
  professionals: CrmSchedNamed[]
  procedures:    CrmSchedProcedure[]
  rooms:         CrmSchedNamed[]
}

async function assertBranchInTenant(branchId: string, tenantId: string): Promise<boolean> {
  const admin = createAdminClient()
  const data = await ler(admin
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('tenant_id', tenantId)
    .maybeSingle(), 'buscar a unidade')
  return !!data
}

/** Profissionais, procedimentos e salas de uma filial (para o form de agendamento). */
export async function getCrmSchedulingData(branchId: string): Promise<CrmSchedulingData> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'VIEW')
  if (!branchId || !(await assertBranchInTenant(branchId, ctx.tenantId!))) {
    return { professionals: [], procedures: [], rooms: [] }
  }

  const [professionals, procedures, rooms] = await Promise.all([
    getCachedBranchProfessionals(branchId, ctx.tenantId!),
    getCachedBranchProcedures(branchId, ctx.tenantId!),
    getCachedRoomsByBranch(branchId, ctx.tenantId!),
  ])

  return {
    professionals: (professionals as CrmSchedNamed[]).map(p => ({ id: p.id, name: p.name })),
    procedures:    (procedures as CrmSchedProcedure[]).map(p => ({
      id: p.id, name: p.name, duration_min: p.duration_min, price: p.price,
    })),
    rooms:         (rooms as CrmSchedNamed[]).map(r => ({ id: r.id, name: r.name })),
  }
}

/**
 * Nome e telefone de quem está do outro lado da conversa.
 *
 * A tela manda o que está nos campos do painel, mas a action não depende disso:
 * o contato da conversa (e, na falta, o da oportunidade) é a fonte.
 *
 * ⚠️ Não é export: todo export de arquivo `'use server'` vira endpoint público,
 * e esta função não autoriza nada por conta própria.
 */
async function contatoDaConversa(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  conversationId: string | null,
  leadId: string,
): Promise<{ nome: string; telefone: string } | null> {
  if (conversationId) {
    const data = await ler(admin
      .from('conversations')
      .select('contact_name, contact_phone')
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .maybeSingle(), 'buscar a conversa')
    const nome     = (data?.contact_name  as string | null)?.trim()
    const telefone = (data?.contact_phone as string | null)?.trim()
    if (nome && telefone) return { nome, telefone }
  }

  if (leadId) {
    const data = await ler(admin
      .from('leads')
      .select('name, phone')
      .eq('id', leadId)
      .eq('tenant_id', tenantId)
      .maybeSingle(), 'buscar a oportunidade')
    const nome     = (data?.name  as string | null)?.trim()
    const telefone = (data?.phone as string | null)?.trim()
    if (nome && telefone) return { nome, telefone }
  }

  return null
}

/** Horários livres de um profissional num dia. */
export async function getCrmSlots(
  branchId: string,
  professionalId: string,
  date: string,
  durationMin: number,
): Promise<string[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'VIEW')
  if (!branchId || !professionalId || !date) return []
  const admin = createAdminClient()
  return computeAvailableSlots(admin, branchId, professionalId, date, durationMin || 60)
}

export interface CreateCrmAppointmentInput {
  /** Oportunidade de onde o agendamento saiu. Vazio = agendou pelo contato. */
  leadId:         string
  /** Conversa do inbox — é dela que saem nome e telefone de quem será atendido. */
  conversationId?: string | null
  branchId:       string
  professionalId: string
  procedureId:    string | null
  scheduledAt:    string           // ISO UTC
  roomId?:        string | null
  isEvaluation?:  boolean
  notes?:         string | null
  /** Nome e telefone confirmados na tela, quando o contato ainda não é cliente. */
  contato?:       { nome: string; telefone: string } | null
}

/** Agenda a partir do CRM: garante o cliente e cria o agendamento. */
export async function createCrmAppointment(
  input: CreateCrmAppointmentInput,
): Promise<{ id?: string; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'MANAGE')
  const admin = createAdminClient()

  const leadRow = input.leadId
    ? (await admin
        .from('leads')
        .select('id, client_id, conversation_id')
        .eq('id', input.leadId)
        .eq('tenant_id', ctx.tenantId!)
        .maybeSingle()).data
    : null
  if (input.leadId && !leadRow) return { error: 'Oportunidade não encontrada.' }

  const conversationId =
    input.conversationId
    ?? ((leadRow as { conversation_id?: string | null } | null)?.conversation_id ?? null)

  // Quem será atendido.
  //
  // Agendar exigia converter o contato em cliente antes — com e-mail e CPF,
  // porque a conversão cria o login do portal. Na prática isso parava o
  // agendamento na etapa em que a pessoa ainda está decidindo: quem pergunta
  // preço no WhatsApp não manda documento. Agora nome e telefone bastam, e a
  // ficha completa vira um passo à parte, para quando fizer sentido.
  let clientId = (leadRow as { client_id: string | null } | null)?.client_id ?? null

  if (!clientId && conversationId) {
    const conversa = await ler(admin
      .from('conversations')
      .select('client_id')
      .eq('id', conversationId)
      .eq('tenant_id', ctx.tenantId!)
      .maybeSingle(), 'buscar a conversa')
    clientId = (conversa as { client_id: string | null } | null)?.client_id ?? null
  }

  if (!clientId) {
    const dados = input.contato ?? await contatoDaConversa(admin, ctx.tenantId!, conversationId, input.leadId)
    if (!dados) return { error: 'Informe nome e telefone de quem será atendido.' }

    const novo = await garantirClienteRapido(admin, ctx, {
      nome:     dados.nome,
      telefone: dados.telefone,
      branchId: input.branchId,
      conversationId,
    })
    if (novo.error || !novo.clientId) return { error: novo.error ?? 'Não foi possível registrar o cliente.' }
    clientId = novo.clientId

    if (input.leadId) {
      await gravar(admin.from('leads').update({ client_id: clientId }).eq('id', input.leadId).eq('tenant_id', ctx.tenantId!), 'vincular a oportunidade ao cliente')
    }
    revalidateTag(`clients:${ctx.tenantId!}`, 'max')
    revalidatePath('/admin/inbox')
  }

  const isComercial = ctx.branchId === null
  const res = await createAppointmentCore(admin, ctx, {
    branchId:       input.branchId,
    clientId,
    professionalId: input.professionalId,
    procedureId:    input.procedureId,
    scheduledAt:    input.scheduledAt,
    roomId:         input.roomId ?? null,
    notes:          input.notes ?? null,
    isEvaluation:   input.isEvaluation ?? false,
    source:         isComercial ? 'COMMERCIAL' : 'INTERNAL',
  })

  if ('error' in res) return { error: res.error }

  // Agendar é uma ação sobre o lead e entra na linha do tempo dele — senão o
  // card salta de "Em contato" para "Agendado" sem dizer o que aconteceu.
  // Sem oportunidade não há linha do tempo a escrever: agendar pelo contato é
  // legítimo e não inventa um negócio que ninguém abriu.
  if (input.leadId) {
    const { data: proc } = input.procedureId
      ? await admin.from('procedures').select('name').eq('id', input.procedureId).maybeSingle()
      : { data: null }

    await registrarEventoLead({
      tenantId:    ctx.tenantId!,
      leadId:      input.leadId,
      type:        'APPOINTMENT_CREATED',
      actorUserId: ctx.internalUserId,
      actorName:   ctx.userName || null,
      changes: [{
        campo: 'Agendamento',
        de:    null,
        para:  [
          (proc as { name: string } | null)?.name,
          new Date(input.scheduledAt).toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          }),
        ].filter(Boolean).join(' · '),
      }],
    })
  }

  notifyAppointmentCreated(res.id)
  revalidatePath('/admin/oportunidades')
  return { id: res.id }
}
