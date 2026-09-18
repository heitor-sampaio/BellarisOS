// Cliente criado no ato de agendar — nome e telefone, nada mais.
//
// Cadastrar cliente exige CPF e e-mail porque o cadastro cria o LOGIN do portal
// (usuário = e-mail, senha = CPF). Pedir isso para marcar um horário invertia a
// ordem das coisas: quem liga perguntando preço não dá documento, e a recepção
// ficava sem como registrar o horário. Aqui o cliente nasce só com o que a
// pessoa deu — `auth_id`, `document` e `email` seguem nulos, que é o que o
// schema já previa — e ganha login quando (e se) o cadastro for completado.
//
// Sem `'use server'`: é regra de negócio compartilhada pela agenda e pelo CRM.
// Quem chama já autorizou.

import { unitTag } from '@estetica-os/utils'
import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

/** Só os dígitos — é assim que dois telefones se comparam. */
export function digitosDoTelefone(v: string): string {
  return (v ?? '').replace(/\D/g, '')
}

/**
 * Marca o contato do inbox como cliente.
 *
 * Mora aqui porque a ligação acontece em vários caminhos — CPF novo, CPF que já
 * era de um cliente, e agora o cadastro rápido feito ao agendar. Esquecer um
 * deles deixa a conversa sem o selo, que é o que o comercial olha antes de
 * responder.
 */
export async function ligarContatoAoCliente(
  admin: Admin, tenantId: string, conversationId: string, clientId: string,
): Promise<void> {
  const { error } = await admin
    .from('conversations')
    .update({ client_id: clientId, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)

  if (error) console.error('[ligarContatoAoCliente]', error.message)
}

export interface ClienteRapidoInput {
  nome:            string
  telefone:        string
  branchId:        string
  /** Conversa do inbox de onde o agendamento saiu, quando houver. */
  conversationId?: string | null
}

export interface ClienteRapidoResult {
  clientId?: string
  /** `false` quando o telefone já era de alguém — reaproveitar é o certo. */
  criado?:   boolean
  error?:    string
}

/**
 * Devolve o cliente para este nome + telefone, criando-o se ainda não existir.
 *
 * O telefone é a identidade aqui: é o único dado que a pessoa sempre dá e o
 * único pelo qual a clínica a reencontra. Dois agendamentos para o mesmo número
 * são a mesma pessoa — criar um cliente novo a cada ligação encheria a base de
 * duplicatas que ninguém junta depois.
 */
export async function garantirClienteRapido(
  admin: Admin,
  ctx: TenantContext,
  input: ClienteRapidoInput,
): Promise<ClienteRapidoResult> {
  const nome     = input.nome?.trim()
  const telefone = input.telefone?.trim()
  const digitos  = digitosDoTelefone(telefone)

  if (!nome || nome.length < 2) return { error: 'Informe o nome de quem será atendido.' }
  if (digitos.length < 10)      return { error: 'Informe um telefone com DDD.' }
  if (!input.branchId)          return { error: 'Filial não identificada.' }

  const { data: branch } = await admin
    .from('branches')
    .select('id, name')
    .eq('id', input.branchId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()
  if (!branch) return { error: 'Filial inválida.' }

  // A comparação é feita no banco, sobre os dígitos (`cliente_por_telefone`).
  // `phone` guarda o que foi digitado — com máscara no formulário, cru quando
  // veio do WhatsApp — e comparar texto com texto fazia "(47) 99123-4567" e
  // "47991234567" virarem duas pessoas.
  const { data: existente, error: buscaErr } = await admin
    .rpc('cliente_por_telefone', { p_tenant: ctx.tenantId!, p_digitos: digitos })
  if (buscaErr) return { error: `Erro ao procurar o cliente: ${buscaErr.message}` }

  if (existente) {
    if (input.conversationId) {
      await ligarContatoAoCliente(admin, ctx.tenantId!, input.conversationId, existente as string)
    }
    return { clientId: existente as string, criado: false }
  }

  const { data: cliente, error } = await admin
    .from('clients')
    .insert({
      tenant_id: ctx.tenantId!,
      branch_id: input.branchId,
      name:      nome,
      phone:     telefone,
      // A unidade de cadastro entra como tag porque é por ela que a lista de
      // clientes de cada filial filtra.
      tags:      [unitTag(branch.name as string)],
      is_active: true,
    })
    .select('id')
    .single()

  if (error || !cliente) return { error: `Erro ao cadastrar o cliente: ${error?.message ?? 'desconhecido'}` }

  await admin.from('loyalty_accounts').insert({ client_id: cliente.id })

  if (input.conversationId) {
    await ligarContatoAoCliente(admin, ctx.tenantId!, input.conversationId, cliente.id as string)
  }

  return { clientId: cliente.id as string, criado: true }
}

/**
 * A ficha rápida deste telefone, quando existe: cliente sem CPF.
 *
 * É o que impede que completar o cadastro de quem já tem horário marcado crie
 * uma segunda ficha. Cliente COM CPF não entra: ali a chave é o documento, e o
 * telefone pode ser repetido de propósito (mãe e filha, casal).
 */
export async function clienteRapidoDoTelefone(
  admin: Admin, tenantId: string, telefone: string,
): Promise<{ id: string } | null> {
  const digitos = digitosDoTelefone(telefone)
  if (digitos.length < 10) return null

  const { data } = await admin.rpc('cliente_por_telefone', {
    p_tenant:  tenantId,
    p_digitos: digitos,
    p_sem_cpf: true,
  })
  return data ? { id: data as string } : null
}
