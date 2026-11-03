'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getTenantContext, assertClient, assertPermission, can } from '@/lib/auth'
import { SO_CONSULTA_CLIENTES } from '@/lib/clients/so-consulta'
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
import { ligarContatoAoCliente } from '@/lib/clients/cliente-rapido'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { bloqueioDoSuporte } from '@/lib/suporte/travas'
import { atualizarClienteCore } from '@/lib/clients/atualizar'
import { pessoaDoCrmDoTelefone, ligarPessoaDoCrmAoCliente, type PessoaDoCrm } from '@/lib/clients/pessoa-do-crm'
import { criarLoginDoCliente, darAcessoAoCliente, desfazerLogin, ligarLoginAoCliente } from '@/lib/clients/acesso'
import { CPF_INVALIDO, documentoDaFicha, documentoEstrangeiroRepetido } from '@/lib/clients/documento'
import { umaVez, chaveDoEnvio, chaveDoConteudo } from '@/lib/envio-unico'
import { fichasQueJaExistem, respostaDoJaExiste, proximaSemResposta, atualizarFichaComOPreenchido, type FichaQueJaExiste, type PreenchidoAgora } from '@/lib/clients/ja-existe'
import type { TenantContext } from '@estetica-os/types'

const TELEFONE_INCOMPLETO = 'Telefone incompleto: informe o DDD e o número (10 ou 11 dígitos). De outro país, comece com + e o código do país (ex.: +351 912 345 678).'

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
 * O telefone é de uma ficha ARQUIVADA (A20 da 5ª simulação): a tela oferece
 * "Reativar a ficha de X" (`_arquivada=reativar:<id>`) ou "É outra pessoa"
 * (`_arquivada=nova:<dígitos>`, que vale para ESTE número).
 */
export type AvisoDeArquivada = { id: string; nome: string; telefone: string; exibir: string }

/**
 * A ficha ATIVA que já é esta pessoa — o mesmo CPF, o mesmo telefone, ou o
 * mesmo nome com a mesma data de nascimento (r2-cli-01, `lib/clients/ja-existe.ts`):
 * "Cadastrar mesmo assim" (`_jaExiste=cadastrar:<id>`, que vale para AQUELA
 * ficha) ou "Atualizar a ficha de X" (`_jaExiste=atualizar:<id>`).
 */
export type PerguntaDoJaExiste = FichaQueJaExiste & { telefone: string }

export type ResultadoDoCadastro = {
  error?: string; success?: boolean; clientId?: string; acessoCriado?: boolean
  /** O acesso entrou na conta que ela JÁ tinha em outra clínica: a senha continua a dela (J-22). */
  contaLigada?: boolean
  arquivada?: AvisoDeArquivada
  jaExiste?: PerguntaDoJaExiste
  mesmaPessoaDoLead?: PerguntaDoLead
}

/** A pessoa do CRM (lead ou conversa) com este telefone: "É a mesma pessoa do lead X?" (D-9). */
export type PerguntaDoLead = { contatoId: string; nome: string; ehLead: boolean; perdida: boolean; telefone: string }

export async function addClient(
  _prev: ResultadoDoCadastro | undefined,
  formData: FormData,
): Promise<ResultadoDoCadastro> {
  const ctx     = await getTenantContext()
  // Com Clientes em Ver, a recusa vem em { error }: lançada dentro do
  // useActionState, derrubava a tela do inbox inteira (D4, 2026-11-01).
  if (!can(ctx, 'clients', 'MANAGE')) return { error: SO_CONSULTA_CLIENTES }

  // D10 (5ª simulação): duas fichas "Valdir Duplicado" com 0,7 s de diferença.
  // O MESMO envio (a chave `_envio` da tela) grava uma vez; o reenvio recebe a
  // mesma ficha. Sem chave, a trava calada dos 60 s (o mesmo nome com o mesmo
  // telefone virava o mesmo cadastro, sem dizer nada) SAIU (r2-cli-01, o
  // Heitor em 2026-11-03): o segundo envio cai na pergunta "Já existe a ficha
  // de X" como qualquer outro. A chave do conteúdo continua só para ENFILEIRAR
  // as chegadas simultâneas (`soEnfileirar`: o "feito" não é reaproveitado) —
  // a segunda espera a primeira gravar e então a acha, em vez de as duas
  // passarem pela conferência ao mesmo tempo. O que volta com pergunta ou erro
  // solta as chaves: a resposta da pessoa grava.
  const opcoes = {
    gravou:  (r: ResultadoDoCadastro) => r.success === true,
    ocupada: (): ResultadoDoCadastro => ({ error: 'Este cadastro ainda está sendo gravado. Confira a lista de clientes em instantes antes de enviar de novo.' }),
  }
  const nomeDoEnvio = ((formData.get('name') as string | null) ?? '').trim().replace(/\s+/g, ' ')
  const foneDoEnvio = ((formData.get('phone') as string | null) ?? '').replace(/\D/g, '')
  const peloConteudo = nomeDoEnvio && foneDoEnvio.length >= 8 ? chaveDoConteudo(nomeDoEnvio, foneDoEnvio) : null
  return umaVez(ctx.tenantId!, 'addClient', chaveDoEnvio(formData), () =>
    umaVez(ctx.tenantId!, 'addClient:conteudo', peloConteudo, () => addClientInterno(ctx, formData), { ...opcoes, soEnfileirar: true }),
  opcoes)
}

async function addClientInterno(ctx: TenantContext, formData: FormData): Promise<ResultadoDoCadastro> {
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
  if (!branch) return { error: 'Unidade inválida.' }

  // "Reativar a ficha de X" (A20): a ficha arquivada do telefone volta como
  // está — o que se digitou aqui não é gravado —, ligada ao card ou à conversa
  // de onde veio o cadastro, como a de CPF que já existia.
  const respostaArquivada = (formData.get('_arquivada') as string | null) ?? ''
  if (respostaArquivada.startsWith('reativar:')) {
    return reativarPeloCadastro(ctx, respostaArquivada.slice('reativar:'.length), { leadId, conversationId, slug })
  }

  const name      = (formData.get('name') as string)?.trim()
  const phone     = (formData.get('phone') as string)?.trim()
  const email     = (formData.get('email') as string)?.trim().toLowerCase() || null
  const rawDoc    = (formData.get('document') as string)?.trim() || null
  // O "Documento" tem tipo (D-11): CPF em `document`, passaporte e RNE nas colunas deles.
  const doc       = documentoDaFicha(formData.get('document_type') as string | null, rawDoc)
  if ('error' in doc) return { error: doc.error }
  const document  = doc.colunas.document
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
  // D12: pelos dígitos verificadores (em `documentoDaFicha`) — o 11111111111 passava e virava a senha inicial do login.
  // Sem CPF (passaporte, RNE), sem acesso ao app por enquanto: a senha inicial é o CPF.
  if (comAcesso && (!email || !document))  return { error: 'O acesso ao app precisa do e-mail e do CPF.' }

  const admin = createAdminClient()

  const repetido = await documentoEstrangeiroRepetido(admin, ctx.tenantId!, doc.colunas)
  if (repetido) return { error: repetido }

  // O CPF é único na clínica: o de uma ficha ARQUIVADA não se cadastra de novo
  // (a busca acha a arquivada, com "Reativar"). O de uma ficha ativa cai na
  // pergunta "Já existe a ficha de X" logo abaixo, só com "Atualizar a ficha".
  const doCpfArquivada = !document ? null : await ler(admin
    .from('clients').select('name').eq('tenant_id', ctx.tenantId!).eq('document', document).eq('is_active', false)
    .maybeSingle(), 'conferir se o CPF é de uma ficha arquivada') as { name: string } | null
  if (doCpfArquivada) return { error: `O CPF é da ficha arquivada de ${doCpfArquivada.name}. Reative-a pela busca (ela aparece como "Arquivada").` }

  // As perguntas do cadastro (a ficha arquivada do telefone, a ficha que JÁ
  // EXISTE — r2-cli-01 —, o lead do CRM) — as MESMAS que a tela faz antes do
  // clique (A18, `conferirTelefoneDoCadastro`): o servidor confere de novo.
  const doTelefone = await perguntaDoTelefone(admin, ctx, fone, respostasDoFormulario(formData), !!(leadId || conversationId),
    { cpf: document, nome: name, nascimento: birthDate })
  if ('pergunta' in doTelefone) return doTelefone.pergunta
  // "Atualizar a ficha de X": grava nela só o que foi preenchido agora, sem
  // apagar o que ela tem, e abre a ficha (r2-cli-01).
  if ('atualizar' in doTelefone) {
    return atualizarPeloCadastro(ctx, doTelefone.atualizar, {
      name, phone: fone.gravar, email, documento: doc.colunas, birth_date: birthDate, gender, notes, tags,
    }, { leadId, conversationId, slug, comAcesso, email, document })
  }
  const { pessoaDoCrm } = doTelefone
  // A oportunidade que se converte: a do card, ou a do lead que a recepção disse ser a mesma pessoa.
  const leadDaConversao = leadId ?? pessoaDoCrm?.leadId ?? null

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

  // 2) Cliente: a ficha nova. A que já existia só muda pelo "Atualizar a ficha" (acima).
  const dadosDoCliente = {
    tenant_id: ctx.tenantId!, branch_id: branchId,
    name, phone: fone.gravar, email, ...doc.colunas,
    birth_date: birthDate, gender, notes, tags,
    is_active: true, auth_id: authId,
  }

  const { data: client, error } = await admin.from('clients').insert(dadosDoCliente).select('id').single()

  if (error || !client) {
    if (login && !('error' in login)) await desfazerLogin(admin, login)  // rollback do login órfão (o que ela já tinha fica)
    return { error: 'Erro ao cadastrar cliente. Tente novamente.' }
  }

  // 3) Claims do cliente + conta de fidelidade
  if (login && !('error' in login)) await ligarLoginAoCliente(admin, login, client.id)
  // A conta de pontos: pela função do banco, que não duplica e não cala erro.
  await gravar(admin.rpc('fidelidade_conta', { p_cliente: client.id }), 'abrir a conta de fidelidade')

  // A ficha completa não passa por `garantirClienteRapido` quando o cliente
  // nasce aqui — daí a emissão também neste ponto.
  await emitirEventoDeCliente(EVENTOS.CLIENTE_CRIADO, client.id as string, ctx)

  // 4) O contato passa a ser cliente. É aqui que o selo aparece na conversa, e
  //    nenhuma oportunidade é tocada: cadastrar cliente não fecha negócio.
  if (conversationId) {
    await ligarContatoAoCliente(admin, ctx.tenantId!, conversationId, client.id as string)
    revalidatePath('/admin/inbox')
  }
  // "É a mesma pessoa do lead": as outras oportunidades e as conversas dela.
  if (pessoaDoCrm) {
    await ligarPessoaDoCrmAoCliente(admin, ctx, pessoaDoCrm, client.id as string)
    revalidatePath('/admin/inbox')
  }

  // 5) Conversão de lead: liga o lead e dispara Meta CAPI (CompleteRegistration)
  if (leadDaConversao) {
    const leadRow = await ler(admin
      .from('leads').select('ctwa_clid').eq('id', leadDaConversao).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a oportunidade')
    await gravar(admin.from('leads').update({ client_id: client.id }).eq('id', leadDaConversao).eq('tenant_id', ctx.tenantId!), 'vincular a oportunidade ao cliente')
    await registrarEventoLead({
      tenantId:    ctx.tenantId!,
      leadId:      leadDaConversao,
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
  // `acessoCriado`: a tela confirma o login e lembra a senha inicial (A13) —
  // ou, na conta que ela já tinha (`contaLigada`), que a senha é a dela (J-22).
  const contaLigada = !!login && !('error' in login) && !login.novo
  return { success: true, clientId: client.id as string, acessoCriado: !!login, contaLigada }
}

type RespostasDoTelefone = { jaExiste: string; pessoaDoCrm: string; arquivada: string }

function respostasDoFormulario(f: FormData | Record<string, string | null | undefined>): RespostasDoTelefone {
  const v = (k: string) => String((f instanceof FormData ? f.get(k) : f[k]) ?? '')
  return { jaExiste: v('_jaExiste'), pessoaDoCrm: v('_pessoaDoCrm'), arquivada: v('_arquivada') }
}

type Admin = ReturnType<typeof createAdminClient>
type FichaDoTelefone = { id: string; nome: string; ativa: boolean; sem_cpf: boolean }

/**
 * A PRÓXIMA pergunta do cadastro, na ordem, ou o que as respostas decidiram.
 * Uma pergunta por vez: cada resposta vale para AQUELA ficha (ou para ESTE
 * número), e o formulário as reenvia nos envios seguintes.
 *
 * 1. A ficha ARQUIVADA do telefone (A20 da 5ª simulação — o "Valdir Duplicado"
 *    do D10): "Reativar a ficha de X" ou "É outra pessoa" (r2-cli-02: manter).
 * 2. A ficha ATIVA que JÁ EXISTE — o mesmo CPF, o mesmo telefone, ou o mesmo
 *    nome com a mesma data de nascimento (r2-cli-01, o Heitor em 2026-11-03:
 *    "antes de gravar no banco, confere se já existe; se já existir, retorna
 *    avisando que já existe, perguntando se deseja cadastrar mesmo assim ou
 *    atualizar a ficha existente"): "Cadastrar mesmo assim" ou "Atualizar a
 *    ficha de X". Substitui a pergunta da ficha rápida ("É a mesma pessoa?")
 *    e o aviso da outra cliente do telefone (mãe e filha) de antes.
 * 3. A pessoa do CRM (D-9) — até o lead perdido que voltou: "É a mesma pessoa
 *    do lead X?". Quem vem do card ou da conversa (`veioDoCrm`) já disse de
 *    quem é.
 */
async function perguntaDoTelefone(
  admin: Admin, ctx: TenantContext, fone: { digitos: string; gravar: string }, r: RespostasDoTelefone, veioDoCrm: boolean,
  outros: { cpf?: string | null; nome?: string | null; nascimento?: string | null } = {},
): Promise<{ pergunta: ResultadoDoCadastro } | { atualizar: string } | { pessoaDoCrm: PessoaDoCrm | null }> {
  if (r.arquivada !== `nova:${fone.digitos}`) {
    const fichas = ((await ler(admin.rpc('fichas_do_telefone', { p_tenant: ctx.tenantId!, p_digitos: fone.digitos }),
      'conferir as fichas do telefone')) ?? []) as FichaDoTelefone[]
    const arquivada = fichas.find(f => !f.ativa)
    if (arquivada) return { pergunta: { arquivada: { id: arquivada.id, nome: arquivada.nome, telefone: fone.digitos, exibir: fone.gravar } } }
  }

  const resposta = respostaDoJaExiste(r.jaExiste)
  const jaExistem = await fichasQueJaExistem(admin, ctx.tenantId!, { cpf: outros.cpf, digitos: fone.digitos, nome: outros.nome, nascimento: outros.nascimento })
  if (resposta.atualizar && jaExistem.some(f => f.id.toLowerCase() === resposta.atualizar)) return { atualizar: resposta.atualizar }
  const pendente = proximaSemResposta(jaExistem, resposta.cadastrar)
  if (pendente) return { pergunta: { jaExiste: { ...pendente, telefone: fone.digitos } } }

  let pessoaDoCrm: PessoaDoCrm | null = null
  if (!veioDoCrm) {
    const achada = await pessoaDoCrmDoTelefone(admin, ctx, fone.digitos)
    if (achada && r.pessoaDoCrm === `mesma:${achada.contatoId}`) pessoaDoCrm = achada
    else if (achada && r.pessoaDoCrm !== `outra:${achada.contatoId}`) {
      return { pergunta: { mesmaPessoaDoLead: {
        contatoId: achada.contatoId, nome: achada.nome, ehLead: !!achada.leadId, perdida: achada.perdida, telefone: fone.digitos,
      } } }
    }
  }
  return { pessoaDoCrm }
}

/**
 * As perguntas do cadastro ANTES do clique em "Cadastrar" (A18 da 5ª
 * simulação): só apareciam depois do primeiro envio, no pé da página, e o
 * clique parecia não fazer nada. A tela pergunta assim que o telefone está
 * completo (com o CPF, se já digitado); `addClient` confere de novo, também o
 * nome com a data de nascimento. Só lê.
 */
export async function conferirTelefoneDoCadastro(entrada: {
  phone: string; respostas?: Record<string, string>; leadId?: string | null; conversationId?: string | null; cpf?: string | null
}): Promise<ResultadoDoCadastro> {
  const ctx = await getTenantContext()
  if (!can(ctx, 'clients', 'MANAGE')) return {}
  const fone = telefoneDoCadastro(entrada?.phone)
  if (!fone) return {}
  const admin = createAdminClient()
  const leadId = entrada.leadId?.trim() || null
  const conversationId = entrada.conversationId?.trim() || null
  if (leadId && !(await leadAoAlcance(admin, ctx, leadId))) return {}
  if (conversationId && !(await conversaAoAlcance(admin, ctx, conversationId))) return {}
  const cpf = String(entrada.cpf ?? '').replace(/\D/g, '')
  const r = await perguntaDoTelefone(admin, ctx, fone, respostasDoFormulario(entrada.respostas ?? {}), !!(leadId || conversationId),
    { cpf: cpf.length === 11 && cpfValido(cpf) ? cpf : null })
  return 'pergunta' in r ? r.pergunta : {}
}

/**
 * "Atualizar a ficha de X" pelo cadastro (r2-cli-01): grava na ficha que já
 * existia só o que foi preenchido agora, sem apagar o que ela tem
 * (`atualizarFichaComOPreenchido`), liga o card ou a conversa de onde veio o
 * cadastro e, com a caixa marcada e sem login ainda, dá o acesso ao app. A
 * tela abre a ficha.
 */
async function atualizarPeloCadastro(
  ctx: TenantContext, clientId: string, agora: PreenchidoAgora,
  de: { leadId: string | null; conversationId: string | null; slug: string; comAcesso: boolean; email: string | null; document: string | null },
): Promise<ResultadoDoCadastro> {
  const admin = createAdminClient()
  const r = await atualizarFichaComOPreenchido(admin, ctx, clientId, agora)
  if (r.error) return { error: r.error }
  let acessoCriado = false
  let contaLigada = false
  if (de.comAcesso && de.email && de.document) {
    const ficha = await ler(admin.from('clients').select('auth_id').eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(),
      'buscar o acesso da ficha') as { auth_id: string | null } | null
    if (ficha && !ficha.auth_id) {
      const acesso = await darAcessoAoCliente(admin, ctx, clientId, de.email, de.document)
      if ('error' in acesso) return { error: `A ficha foi atualizada, mas o acesso ao app não saiu: ${acesso.error}` }
      acessoCriado = true
      contaLigada = acesso.contaLigada
    }
  }
  const ligado = await reativarPeloCadastro(ctx, clientId, { leadId: de.leadId, conversationId: de.conversationId, slug: de.slug })
  if (ligado.error) return ligado
  return { success: true, clientId, acessoCriado, contaLigada }
}

/** "Reativar a ficha de X" pelo cadastro (A20): a ficha volta como está, ligada ao card ou à conversa. */
async function reativarPeloCadastro(
  ctx: TenantContext, clientId: string, de: { leadId: string | null; conversationId: string | null; slug: string },
): Promise<ResultadoDoCadastro> {
  const admin = createAdminClient()
  const antes = await ler(admin.from('clients').select('id, is_active').eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(),
    'buscar a ficha arquivada') as { id: string; is_active: boolean } | null
  if (!antes) return { error: 'Cliente não encontrada.' }
  if (!antes.is_active) {
    await gravar(admin.from('clients').update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', clientId).eq('tenant_id', ctx.tenantId!).select('id').single(), 'reativar a ficha')
    await emitirEventoDeCliente(EVENTOS.CLIENTE_REATIVADO, clientId, ctx)
  }
  if (de.conversationId) await ligarContatoAoCliente(admin, ctx.tenantId!, de.conversationId, clientId)
  if (de.leadId) {
    await gravar(admin.from('leads').update({ client_id: clientId }).eq('id', de.leadId).eq('tenant_id', ctx.tenantId!), 'vincular a oportunidade ao cliente')
    await registrarEventoLead({ tenantId: ctx.tenantId!, leadId: de.leadId, type: 'CONVERTED', actorUserId: ctx.internalUserId, actorName: ctx.userName || null })
    revalidatePath('/admin/oportunidades')
    revalidatePath(`/${de.slug}/oportunidades`)
  }
  if (de.conversationId) revalidatePath('/admin/inbox')
  revalidatePath(`/${de.slug}/clients`)
  revalidatePath('/admin/clients')
  revalidateTag(`clients:${ctx.tenantId!}`, { expire: 0 })
  return { success: true, clientId }
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
export async function darAcessoAoApp(clientId: string): Promise<{ ok: true; contaLigada: boolean } | { error: string }> {
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
    return { ok: true, contaLigada: r.contaLigada }
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
  // O mesmo envio (a chave da tela) concede UMA vez (D10, lib/envio-unico.ts).
  return umaVez(ctx.tenantId!, 'grantInternalCredit', chaveDoEnvio(formData), () => concederCredito(ctx, formData))
}

async function concederCredito(ctx: TenantContext, formData: FormData): Promise<{ error?: string }> {
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
  if (!branch) return { error: 'Unidade não encontrada.' }

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
    /** O tipo do documento (D-11): CPF (o padrão), PASSAPORTE ou RNE. */
    documentType?:      string | null
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
  // A aba Dados e as anotações de quem só vê não salvam; a recusa vem em
  // { error } (a promessa rejeitada dava 500 mudo — D5, 2026-11-01).
  if (!can(ctx, 'clients', 'MANAGE')) return { error: SO_CONSULTA_CLIENTES }

  const admin = createAdminClient()

  if (data.name !== undefined && data.name.trim().length < 2) {
    return { error: 'Informe o nome do cliente.' }
  }
  // As mesmas regras do cadastro (D12, D13).
  if (data.phone?.trim() && !telefoneDoCadastro(data.phone)) return { error: TELEFONE_INCOMPLETO }
  const doc = documentoDaFicha(data.documentType ?? 'CPF', data.document)
  if ('error' in doc) return doc

  // O núcleo que a ficha e o Copilot dividem (lib/clients/atualizar.ts).
  return atualizarClienteCore(admin, ctx, clientId, {
    ...doc.colunas,
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

  // A cliente é da CLÍNICA (H5; F6 da 5ª simulação, o Heitor: "concordo"):
  // quem tem Clientes em Gerenciar arquiva e reativa QUALQUER ficha da rede,
  // mesmo cadastrada em outra unidade — como já editava os dados dela. Até
  // 2026-11-02 isto gravava pela SESSÃO e recusava a ficha de outra unidade
  // (a RLS de `clients` recorta pela unidade de cadastro); agora grava pelo
  // servidor, com a rede conferida na própria consulta.
  const { data, error } = await createAdminClient()
    .from('clients')
    .update({ is_active: isActive })
    .eq('id', clientId)
    .eq('tenant_id', ctx.tenantId!)
    .select('id')

  if (error) return { error: `Não foi possível ${isActive ? 'reativar' : 'arquivar'} o cliente: ${error.message}` }
  // Nenhuma linha: o id não é de uma cliente desta rede.
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
