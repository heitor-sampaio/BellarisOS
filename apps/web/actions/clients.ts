'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getTenantContext, assertClient, assertPermission, alcancaUnidade } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { leadAoAlcance } from '@/lib/crm/alcance'
import { conversaAoAlcance } from '@/lib/inbox/alcance'
import { unitTag, cpfValido, telefoneDoCadastro, telefoneInternacional } from '@estetica-os/utils'
import { after } from 'next/server'
import { enviarEventoCapi } from '@/lib/ads/capi'
import { emitirEventoDeCliente } from '@/lib/events/cliente'
import { EVENTOS } from '@estetica-os/types'
import { registrarEventoLead } from '@/lib/lead-events'
import { ligarContatoAoCliente, clienteRapidoDoTelefone } from '@/lib/clients/cliente-rapido'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { bloqueioDoSuporte } from '@/lib/suporte/travas'
import { atualizarClienteCore } from '@/lib/clients/atualizar'
import { criarLoginDoCliente, darAcessoAoCliente, desfazerLogin, ligarLoginAoCliente } from '@/lib/clients/acesso'

const TELEFONE_INCOMPLETO = 'Telefone incompleto: informe o DDD e o número (10 ou 11 dígitos). De outro país, comece com + e o código do país (ex.: +351 912 345 678).'
const CPF_INVALIDO = 'CPF inválido: confira os números.'

// --- Helper: valida que o branchId pertence ao tenant ------------
async function resolveBranch(tenantId: string, branchId: string) {
  const supabase = await createSupabase()
  const data = await ler(supabase
    .from('branches')
    .select('id, slug, name')
    .eq('id', branchId)
    .eq('tenant_id', tenantId)
    .single(), 'buscar a unidade')
  return data
}

// `ligarContatoAoCliente` mora em `lib/clients/cliente-rapido.ts`: o vínculo é
// gravado por três caminhos (CPF novo, CPF que já era de um cliente, e o
// cadastro rápido feito ao agendar), e esquecer um deixa a conversa sem o selo
// que o comercial olha antes de responder.

// --- Criar cliente ------------------------------------------------
/**
 * O telefone da ficha nova já é de OUTRA cliente da rede (D13): a tela avisa
 * e deixa confirmar — mãe e filha dividem número. Não bloqueia de vez.
 */
export type AvisoDeTelefone = {
  nome: string
  /** A chave do número (os dígitos de `telefoneDoCadastro`): é o que a confirmação devolve. */
  telefone: string
  /** O número como a tela o mostra (o de outro país, como foi escrito). */
  exibir: string
}

export async function addClient(
  _prev: { error?: string; success?: boolean; clientId?: string; avisoTelefone?: AvisoDeTelefone } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean; clientId?: string; acessoCriado?: boolean; avisoTelefone?: AvisoDeTelefone }> {
  const ctx     = await getTenantContext()
  assertPermission(ctx, 'clients', 'MANAGE')

  const branchId = formData.get('_branchId') as string
  const slug     = formData.get('_slug') as string
  // _leadId presente = criação a partir da conversão de um lead (mesma regra do cadastro manual).
  const leadId   = (formData.get('_leadId') as string | null)?.trim() || null
  // _conversationId = o CONTATO de onde veio o cadastro. É nele que o vínculo
  // com o cliente mora agora: ser cliente é estado da pessoa, não do card, e
  // amarrar isso à oportunidade fazia a mesma pessoa converter duas vezes
  // quando negociava em dois funis.
  const conversationId = (formData.get('_conversationId') as string | null)?.trim() || null

  // Os dois ids vêm do formulário e os dois gravam: o cliente é ligado à
  // oportunidade e ao contato. `clients: MANAGE` não é passe para mexer no
  // card ou na conversa de outro dono, nem para quem não tem CRM nenhum.
  {
    const admin = createAdminClient()
    if (leadId && !(await leadAoAlcance(admin, ctx, leadId))) return { error: 'Oportunidade não encontrada.' }
    if (conversationId && !(await conversaAoAlcance(admin, ctx, conversationId))) return { error: 'Conversa não encontrada.' }
  }

  const branch   = await resolveBranch(ctx.tenantId!, branchId)
  if (!branch) return { error: 'Filial inválida.' }

  const name      = (formData.get('name') as string)?.trim()
  const phone     = (formData.get('phone') as string)?.trim()
  const email     = (formData.get('email') as string)?.trim().toLowerCase() || null
  const rawDoc    = (formData.get('document') as string)?.trim() || null
  const document  = rawDoc ? rawDoc.replace(/\D/g, '') : null
  const birthDate = (formData.get('birth_date') as string) || null
  const gender    = (formData.get('gender') as string) || null
  const notes     = (formData.get('notes') as string)?.trim() || null
  // O acesso ao app é escolha de quem cadastra (2026-10-21): a cliente de
  // balcão entra com nome e telefone, sem e-mail nem CPF.
  const comAcesso = formData.get('_acesso') === 'on'
  const tagsRaw   = formData.get('tags') as string
  const tags: string[] = tagsRaw ? JSON.parse(tagsRaw) : []

  // Unidade de cadastro entra como tag (métrica). O trigger de agendamento adiciona
  // as demais unidades que o cliente vier a frequentar.
  const unitName = (branch as { name?: string }).name
  if (unitName && !tags.includes(unitTag(unitName))) tags.push(unitTag(unitName))

  // Regra de negócio de CRIAR CLIENTE — idêntica no cadastro manual e na conversão de lead.
  if (!name || !phone)                     return { error: 'Nome e telefone são obrigatórios.' }
  // D13 (2026-10-29): "(41) 9920" passava e a ficha mostrava "(41) 9920-".
  // O de outro país começa com "+" e passa (frente de cadastro, 2026-10-29).
  const fone = telefoneDoCadastro(phone)
  if (!fone) return { error: TELEFONE_INCOMPLETO }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'E-mail inválido.' }
  // D12: pelos dígitos verificadores — o 11111111111 passava e virava a senha inicial do login.
  if (document && !cpfValido(document))    return { error: CPF_INVALIDO }
  if (comAcesso && (!email || !document))  return { error: 'O acesso ao app precisa do e-mail e do CPF.' }

  const admin = createAdminClient()

  // CPF único por rede. Na conversão (leadId), se o CPF já é de um cliente, liga o lead a ele (dedupe).
  const existing = !document ? null : await ler(admin
    .from('clients')
    .select('id')
    .eq('tenant_id', ctx.tenantId!)
    .eq('document', document)
    .maybeSingle(), 'conferir se o CPF já está cadastrado')
  if (existing) {
    if (conversationId) await ligarContatoAoCliente(admin, ctx.tenantId!, conversationId, existing.id as string)
    if (leadId) {
      await gravar(admin.from('leads').update({ client_id: existing.id }).eq('id', leadId).eq('tenant_id', ctx.tenantId!), 'vincular a oportunidade ao cliente')
      await registrarEventoLead({
        tenantId:    ctx.tenantId!,
        leadId,
        type:        'CONVERTED',
        actorUserId: ctx.internalUserId,
        actorName:   ctx.userName || null,
      })
      revalidatePath('/admin/oportunidades')
      revalidatePath(`/${slug}/oportunidades`)
      revalidateTag(`clients:${ctx.tenantId!}`, { expire: 0 })
      return { success: true, clientId: existing.id as string }
    }
    // Veio do inbox e o CPF já é de um cliente: liga o contato e pronto. Antes
    // isso só valia com lead, e cadastrar pelo contato dava "CPF já existe" sem
    // vincular nada — a pessoa ficava sem o selo de cliente na conversa.
    if (conversationId) {
      revalidatePath('/admin/inbox')
      revalidateTag(`clients:${ctx.tenantId!}`, { expire: 0 })
      return { success: true, clientId: existing.id as string }
    }
    return { error: 'Já existe um cliente com este CPF nesta rede.' }
  }

  // Mesma pessoa, cadastrada às pressas para marcar um horário.
  //
  // O cadastro rápido grava nome e telefone e deixa CPF nulo. Sem procurar por
  // aqui, completar a ficha depois criaria um segundo cliente com o mesmo
  // telefone — e o histórico de atendimento ficaria dividido entre os dois.
  const jaExiste = await clienteRapidoDoTelefone(admin, ctx.tenantId!, phone)

  // O telefone de OUTRA cliente (D13): avisa, e a recepção confirma — o
  // `_telefoneConfirmado` vale para ESTE número (trocou o número, avisa de
  // novo). A ficha rápida sem CPF do mesmo telefone não é "outra": é ela que
  // o cadastro completa.
  if (formData.get('_telefoneConfirmado') !== fone.digitos) {
    const outra = await ler(admin.rpc('cliente_por_telefone', { p_tenant: ctx.tenantId!, p_digitos: fone.digitos }),
      'conferir se o telefone já é de outra cliente') as string | null
    if (outra && outra !== jaExiste?.id) {
      const dela = await ler(admin.from('clients').select('name').eq('id', outra).eq('tenant_id', ctx.tenantId!).maybeSingle(),
        'buscar a cliente do telefone') as { name: string } | null
      if (dela) return { avisoTelefone: { nome: dela.name, telefone: fone.digitos, exibir: fone.gravar } }
    }
  }

  // 1) Conta de login PRIMEIRO (login = e-mail, senha = CPF) — ou a que ela já
  // tem em outra clínica, quando o e-mail e o CPF batem (a senha fica a dela).
  // E-mail de equipe ou CPF que não bate → aborta sem criar cliente órfão.
  // O núcleo do acesso (lib/clients/acesso.ts), o mesmo do Copilot.
  // Sem a caixa marcada, nenhum login: a ficha ganha o acesso depois, na aba Dados.
  let login: Awaited<ReturnType<typeof criarLoginDoCliente>> | null = null
  if (comAcesso) {
    login = await criarLoginDoCliente(admin, ctx.tenantId!, email!, document!)
    if ('error' in login) return { error: login.error }
  }
  const authId = login && !('error' in login) ? login.authId : null

  // 2) Cliente — completa a ficha rápida quando ela existe, senão cria.
  const dadosDoCliente = {
    tenant_id: ctx.tenantId!, branch_id: branchId,
    name, phone: fone.gravar, email, document,
    birth_date: birthDate, gender, notes, tags,
    is_active: true, auth_id: authId,
  }

  const { data: client, error } = jaExiste
    ? await admin.from('clients')
        .update({ ...dadosDoCliente, updated_at: new Date().toISOString() })
        .eq('id', jaExiste.id).select('id').single()
    : await admin.from('clients').insert(dadosDoCliente).select('id').single()

  if (error || !client) {
    if (login && !('error' in login)) await desfazerLogin(admin, login)  // rollback do login órfão (o que ela já tinha fica)
    return { error: 'Erro ao cadastrar cliente. Tente novamente.' }
  }

  // 3) Claims do cliente + conta de fidelidade
  if (login && !('error' in login)) await ligarLoginAoCliente(admin, login, client.id)
  // A conta de pontos: pela função do banco, que não duplica e não cala erro.
  if (!jaExiste) await gravar(admin.rpc('fidelidade_conta', { p_cliente: client.id }), 'abrir a conta de fidelidade')

  // A ficha completa não passa por `garantirClienteRapido` quando o cliente
  // nasce aqui — daí a emissão também neste ponto. Completar uma ficha rápida
  // (`jaExiste`) não é criação, e nesse caso a chave determinística do ajudante
  // já barra o segundo evento.
  await emitirEventoDeCliente(EVENTOS.CLIENTE_CRIADO, client.id as string, ctx)

  // 4) O contato passa a ser cliente. É aqui que o selo aparece na conversa, e
  //    nenhuma oportunidade é tocada: cadastrar cliente não fecha negócio.
  if (conversationId) {
    await ligarContatoAoCliente(admin, ctx.tenantId!, conversationId, client.id as string)
    revalidatePath('/admin/inbox')
  }

  // 5) Conversão de lead: liga o lead e dispara Meta CAPI (CompleteRegistration)
  if (leadId) {
    const leadRow = await ler(admin
      .from('leads').select('ctwa_clid').eq('id', leadId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a oportunidade')
    await gravar(admin.from('leads').update({ client_id: client.id }).eq('id', leadId).eq('tenant_id', ctx.tenantId!), 'vincular a oportunidade ao cliente')
    await registrarEventoLead({
      tenantId:    ctx.tenantId!,
      leadId,
      type:        'CONVERTED',
      actorUserId: ctx.internalUserId,
      actorName:   ctx.userName || null,
    })

    // O clique desce do lead para o CLIENTE: é do cliente que partem os
    // eventos seguintes (agendou, pagou), e sem o carimbo aqui cada um deles
    // teria de percorrer conversa e mensagens para achar o mesmo dado.
    const clique = (leadRow as { ctwa_clid?: string | null } | null)?.ctwa_clid ?? null
    if (clique) {
      await gravar(admin.from('clients')
        .update({ ctwa_clid: clique })
        .eq('id', client.id).eq('tenant_id', ctx.tenantId!), 'atualizar o cliente')
    }

    // Antes este envio saía como `action_source: 'website'` e mandava só o
    // `fbclid` — a Meta ACEITAVA e não atribuía a anúncio nenhum, que é a pior
    // das falhas: parece ter funcionado. Agora vai pelo caminho de
    // click-to-WhatsApp, com dedup e registro.
    after(() => enviarEventoCapi({
      tenantId: ctx.tenantId!,
      event:    'CompleteRegistration',
      eventId:  `registration:${client.id}`,
      ctwaClid: clique,
      phone,
      email,
    }))

    revalidatePath('/admin/oportunidades')
    revalidatePath(`/${slug}/oportunidades`)
  }

  revalidatePath(`/${slug}/clients`)
  revalidateTag(`clients:${ctx.tenantId!}`, { expire: 0 })
  // `acessoCriado`: a tela confirma o login e lembra a senha inicial (A13).
  return { success: true, clientId: client.id as string, acessoCriado: !!login }
}

// `updateClient` foi removida: a aba Dados da ficha (updateClientContactData)
// edita tudo o que ela editava, e nenhuma tela montava o modo de edição do
// ClientForm que a chamava. Duas actions para a mesma coisa, uma sem porta —
// e todo export daqui é um endpoint público.

/**
 * Dá à cliente que não ganhou no cadastro o acesso ao app (2026-10-21), pela
 * aba Dados da ficha: login = o e-mail da ficha, senha inicial = o CPF — o
 * núcleo de sempre (`darAcessoAoCliente`, o mesmo do Copilot).
 */
export async function darAcessoAoApp(clientId: string): Promise<{ ok: true } | { error: string }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'clients', 'MANAGE')
    const travado = bloqueioDoSuporte(ctx, 'dar acesso ao app')
    if (travado) return { error: travado }
    const admin = createAdminClient()
    const ficha = await ler(admin.from('clients').select('id, email, document')
      .eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cliente') as { id: string; email: string | null; document: string | null } | null
    if (!ficha) return { error: 'Cliente não encontrado.' }
    const cpf = (ficha.document ?? '').replace(/\D/g, '')
    if (!ficha.email || cpf.length !== 11) return { error: 'Para o acesso ao app, salve antes o e-mail e o CPF da cliente.' }
    if (!cpfValido(cpf)) return { error: CPF_INVALIDO }
    const r = await darAcessoAoCliente(admin, ctx, ficha.id, ficha.email.toLowerCase(), cpf)
    if ('error' in r) return r
    revalidatePath('/admin/clients/[id]', 'page')
    revalidatePath('/[slug]/clients/[id]', 'page')
    revalidateTag(`clients:${ctx.tenantId!}`, { expire: 0 })
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

// --- Conceder crédito interno --------------------------------------
export async function grantInternalCredit(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'financial', 'MANAGE')

  const clientId    = (formData.get('client_id')   as string | null)?.trim()
  const branchId    = (formData.get('branch_id')   as string | null)?.trim()
  const slug        = (formData.get('slug')         as string | null)?.trim()
  const rawAmount   = (formData.get('amount')       as string | null)?.replace(',', '.')
  const description = (formData.get('description') as string | null)?.trim()

  const amount = parseFloat(rawAmount ?? '')
  if (!clientId || !branchId)       return { error: 'Dados inválidos.' }
  if (!description)                  return { error: 'Informe o motivo do crédito.' }
  if (isNaN(amount) || amount <= 0)  return { error: 'Informe um valor maior que zero.' }

  // Verify client belongs to this tenant's branch
  const supabase = await createSupabase()
  const branch = await ler(supabase
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar a unidade')
  if (!branch) return { error: 'Filial não encontrada.' }

  const admin = createAdminClient()

  // O comentário acima prometia conferir o cliente e conferia só a filial: com
  // o id de um cliente de outra rede, o crédito ia para ele.
  const cliente = await ler(admin
    .from('clients').select('id').eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(),
    'conferir o cliente do crédito')
  if (!cliente) return { error: 'Cliente não encontrado.' }

  const { error: dbErr } = await admin.from('internal_credits').insert({
    client_id:   clientId,
    branch_id:   branchId,
    amount,
    description,
  })
  if (dbErr) return { error: `Erro ao conceder crédito: ${dbErr.message}` }

  // O crédito também é concedido pelo financeiro da rede, onde não há slug.
  if (slug) {
    revalidatePath(`/${slug}/clients/${clientId}`)
    revalidatePath(`/${slug}/financeiro`)
  }
  revalidatePath(`/admin/clients/${clientId}`)
  revalidatePath('/admin/financeiro')
  return {}
}

// --- Atualizar dados cadastrais (CPF + endereço) ------------------
export async function updateClientContactData(
  clientId: string,
  data: {
    /**
     * Nome e gênero. Opcionais, como `notes`: quem não os edita não os apaga.
     *
     * Ficavam de fora porque a única tela que os editava era o modo de edição
     * do `ClientForm`, que nenhuma página montava — corrigir um nome digitado
     * errado no cadastro não tinha caminho nenhum no sistema.
     */
    name?:              string
    gender?:            string | null
    document:           string | null
    phone:              string | null
    email:              string | null
    birthDate:          string | null
    zipCode:            string | null
    address:            string | null
    addressNumber:      string | null
    addressComplement:  string | null
    neighborhood:       string | null
    city:               string | null
    state:              string | null
    tags?:              string[]
    /** Anotações sobre a pessoa. Opcional: caller que não edita não apaga. */
    notes?:             string | null
  },
  slug: string,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'clients', 'MANAGE')

  const admin = createAdminClient()

  if (data.name !== undefined && data.name.trim().length < 2) {
    return { error: 'Informe o nome do cliente.' }
  }
  // As mesmas regras do cadastro (D12, D13).
  if (data.phone?.trim() && !telefoneDoCadastro(data.phone)) return { error: TELEFONE_INCOMPLETO }
  if (data.document?.replace(/\D/g, '') && !cpfValido(data.document)) return { error: CPF_INVALIDO }

  // O núcleo que a ficha e o Copilot dividem (lib/clients/atualizar.ts).
  return atualizarClienteCore(admin, ctx, clientId, {
    document:            data.document?.replace(/\D/g, '') || null,
    // O de outro país guarda o "+", como foi escrito: é por ele que se sabe que não é nacional.
    phone:               telefoneInternacional(data.phone) ?? (data.phone?.replace(/\D/g, '') || null),
    email:               data.email?.trim() || null,
    birth_date:          data.birthDate || null,
    zip_code:            data.zipCode?.replace(/\D/g, '') || null,
    address:             data.address || null,
    address_number:      data.addressNumber || null,
    address_complement:  data.addressComplement || null,
    neighborhood:        data.neighborhood || null,
    city:                data.city || null,
    state:               data.state || null,
    ...(data.name   !== undefined ? { name: data.name.trim() } : {}),
    ...(data.gender !== undefined ? { gender: data.gender || null } : {}),
    ...(data.tags   !== undefined ? { tags: data.tags } : {}),
    // Só quando o campo veio: a tela de dados não edita notas, e mandar
    // `undefined` aqui apagaria o que a recepção escreveu em outra tela.
    ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
  }, slug)
}

// --- Buscar cliente por CPF (para autocomplete interno) -----------
export async function lookupClientByCpf(
  cpf: string,
  currentClientId: string,
): Promise<{ found: boolean; isSelf: boolean; name?: string }> {
  const ctx   = await getTenantContext()
  const admin = createAdminClient()
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return { found: false, isSelf: false }

  const data = await ler(admin
    .from('clients')
    .select('id, name')
    .eq('tenant_id', ctx.tenantId!)
    .eq('document', digits)
    .maybeSingle(), 'buscar o cliente')

  if (!data) return { found: false, isSelf: false }
  const isSelf = data.id === currentClientId
  return { found: true, isSelf, name: data.name }
}

// --- Atualizar próprios dados (CLIENT) ----------------------------
export async function updateClientSelf(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const ctx = await getTenantContext()
  assertClient(ctx)

  const admin   = createAdminClient()
  const phone   = (formData.get('phone') as string)?.replace(/\D/g, '') || null
  const email   = (formData.get('email') as string)?.trim() || null
  const zip     = (formData.get('zip_code') as string)?.replace(/\D/g, '') || null
  const addr    = (formData.get('address') as string)?.trim() || null
  const addrNum = (formData.get('address_number') as string)?.trim() || null
  const addrCmp = (formData.get('address_complement') as string)?.trim() || null
  const hood    = (formData.get('neighborhood') as string)?.trim() || null
  const city    = (formData.get('city') as string)?.trim() || null
  const state   = (formData.get('state') as string)?.trim() || null

  const { error } = await admin
    .from('clients')
    .update({
      phone,
      email,
      zip_code:           zip,
      address:            addr,
      address_number:     addrNum,
      address_complement: addrCmp,
      neighborhood:       hood,
      city,
      state,
      updated_at:         new Date().toISOString(),
    })
    .eq('id', ctx.clientId!)

  if (error) return { error: error.message }
  return { success: true }
}

// --- Ativar / desativar cliente ------------------------------------
export async function toggleClientStatus(clientId: string, isActive: boolean, slug: string) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'clients', 'MANAGE')

  // A abrangência (§11) se confere AQUI, não só na RLS: a unidade da cliente é
  // a do cadastro (a tag "Unidade: …" é frequência, não abrangência), e quem
  // tem unidade fixa só arquiva a dela. Ficha sem unidade é da rede.
  const ficha = await ler(createAdminClient()
    .from('clients')
    .select('branch_id')
    .eq('id', clientId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle(), 'buscar o cliente')
  if (!ficha) return { error: 'Cliente não encontrado.' }
  if (!alcancaUnidade(ctx, ficha.branch_id as string | null)) return { error: 'Esta cliente é de outra unidade.' }

  const supabase = await createSupabase()
  const { data, error } = await supabase
    .from('clients')
    .update({ is_active: isActive })
    .eq('id', clientId)
    .eq('tenant_id', ctx.tenantId!)
    .select('id')

  if (error) return { error: `Não foi possível ${isActive ? 'reativar' : 'arquivar'} o cliente: ${error.message}` }
  // Update pela sessão que atinge zero linhas não dá erro (RLS): sem isto a tela dizia que arquivou.
  if (!data?.length) return { error: `Não foi possível ${isActive ? 'reativar' : 'arquivar'} o cliente.` }

  await emitirEventoDeCliente(
    isActive ? EVENTOS.CLIENTE_REATIVADO : EVENTOS.CLIENTE_DESATIVADO,
    clientId, ctx,
  )

  if (slug) {
    revalidatePath(`/${slug}/clients`)
    revalidatePath(`/${slug}/clients/${clientId}`)
  }
  revalidatePath('/admin/clients')
  revalidatePath(`/admin/clients/${clientId}`)
  revalidateTag(`clients:${ctx.tenantId!}`, { expire: 0 })
  return {}
}
