'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getTenantContext, assertClient, assertPermission, can } from '@/lib/auth'
import { recusaDoSoOsMeus } from '@/lib/financeiro/so-os-meus'
import { SO_CONSULTA_CLIENTES } from '@/lib/clients/so-consulta'
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
import { criarLoginDoCliente, darAcessoAoCliente, desfazerLogin, ligarLoginAoCliente, documentoDoAcesso, type DocumentoDoAcesso } from '@/lib/clients/acesso'
import { CPF_INVALIDO, documentoDaFicha, documentoEstrangeiroRepetido } from '@/lib/clients/documento'
import { colunasDoResponsavel } from '@/lib/clients/menor'
import { conferirIndicadaPor } from '@/lib/clients/indicada-por'
import { umaVez, chaveDoEnvio, chaveDoConteudo } from '@/lib/envio-unico'
import { fichasQueJaExistem, respostaDoJaExiste, proximaSemResposta, atualizarFichaComOPreenchido, type FichaQueJaExiste, type PreenchidoAgora } from '@/lib/clients/ja-existe'
import type { TenantContext } from '@estetica-os/types'

/** O e-mail com um "@" e um domínio — a regra do cadastro, em todo lugar que grava a ficha (C31, F70). */
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_INVALIDO = 'E-mail inválido.'

const TELEFONE_INCOMPLETO = 'Telefone incompleto: informe o DDD e o número (10 ou 11 dígitos). De outro país, comece com + e o código do país (ex.: +351 912 345 678).'

// --- Helper: a unidade do registro, da rede e ao alcance ----------
/**
 * A unidade em que o registro nasce: a do CONTEXTO vence a do formulário
 * (quem tem unidade fixa grava na dela), e a lida é pelo servidor, com
 * `maybeSingle` — a nula vira a mensagem de quem chama. Até 2026-11-12 era
 * pela sessão com `.single()`: a unidade que a sessão não via lançava, e a
 * tela caía em erro (D5 da 13ª, o mesmo do anexo).
 */
async function resolveBranch(ctx: TenantContext, branchId: string) {
  const unidade = ctx.branchId ?? branchId
  if (!unidade) return null
  return ler(createAdminClient()
    .from('branches')
    .select('id, slug, name')
    .eq('id', unidade)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle(), 'buscar a unidade')
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

  const branch   = await resolveBranch(ctx, branchId)
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
  if (email && !EMAIL_VALIDO.test(email)) return { error: EMAIL_INVALIDO }
  // D12: pelos dígitos verificadores (em `documentoDaFicha`) — o 11111111111 passava e virava a senha inicial do login.
  // Sem CPF, a senha inicial é o passaporte ou o RNE da ficha (decisão 1 do
  // Heitor, 2026-11-05). Sem documento nenhum, sem acesso.
  const docDoAcesso = documentoDoAcesso(doc.colunas)
  // A menor de idade: o responsável legal (decisão 2 do Heitor, 2026-11-05).
  // Não é obrigatório (princípio 2); preenchido, é conferido.
  const resp = colunasDoResponsavel({
    nome: formData.get('responsavel_nome'), cpf: formData.get('responsavel_cpf'),
    parentesco: formData.get('responsavel_parentesco'), telefone: formData.get('responsavel_telefone'),
  }, birthDate)
  if ('error' in resp) return { error: resp.error }
  if (comAcesso && (!email || !docDoAcesso)) return { error: 'O acesso ao app precisa do e-mail e de um documento (CPF, passaporte ou RNE).' }

  const admin = createAdminClient()

  // "Indicada por" (decisão do Heitor, 2026-11-10): a ficha de quem indicou, da clínica.
  const indicada = await conferirIndicadaPor(admin, ctx.tenantId!, formData.get('indicada_por'))
  if ('error' in indicada) return { error: indicada.error }

  const repetido = await documentoEstrangeiroRepetido(admin, ctx.tenantId!, doc.colunas)
  if (repetido) return { error: repetido }

  // O CPF é único na clínica: o de uma ficha ARQUIVADA não se cadastra de novo
  // (a busca acha a arquivada, com "Reativar"). O de uma ficha ativa cai na
  // pergunta "Já existe a ficha de X" logo abaixo, só com "Unificar com a ficha".
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
  // "Unificar com a ficha de X": grava nela só o que foi preenchido agora, sem
  // apagar o que ela tem nem trocar o nome dela (r3-f14-01), e abre a ficha (r2-cli-01).
  if ('atualizar' in doTelefone) {
    return atualizarPeloCadastro(ctx, doTelefone.atualizar, {
      phone: fone.gravar, email, documento: doc.colunas, birth_date: birthDate, gender, notes, tags,
    }, { leadId, conversationId, slug, comAcesso, email, documento: docDoAcesso })
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
    login = await criarLoginDoCliente(admin, ctx.tenantId!, email!, docDoAcesso!)
    if ('error' in login) return { error: login.error }
  }
  const authId = login && !('error' in login) ? login.authId : null

  // 2) Cliente: a ficha nova. A que já existia só muda pelo "Unificar com a ficha" (acima).
  const dadosDoCliente = {
    tenant_id: ctx.tenantId!, branch_id: branch.id as string,
    name, phone: fone.gravar, email, ...doc.colunas, ...resp.colunas,
    birth_date: birthDate, gender, notes, tags,
    is_active: true, auth_id: authId,
    ...(indicada.id ? { indicada_por: indicada.id } : {}),
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
 *    atualizar a ficha existente"): "Cadastrar mesmo assim" ou "Unificar com
 *    a ficha de X" (r3-f14-02). Substitui a pergunta da ficha rápida ("É a mesma pessoa?")
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
 * "Unificar com a ficha de X" pelo cadastro (r2-cli-01, r3-f14-02): grava na ficha que já
 * existia só o que foi preenchido agora, sem apagar o que ela tem
 * (`atualizarFichaComOPreenchido`), liga o card ou a conversa de onde veio o
 * cadastro e, com a caixa marcada e sem login ainda, dá o acesso ao app. A
 * tela abre a ficha.
 */
async function atualizarPeloCadastro(
  ctx: TenantContext, clientId: string, agora: PreenchidoAgora,
  de: { leadId: string | null; conversationId: string | null; slug: string; comAcesso: boolean; email: string | null; documento: DocumentoDoAcesso | null },
): Promise<ResultadoDoCadastro> {
  const admin = createAdminClient()
  const r = await atualizarFichaComOPreenchido(admin, ctx, clientId, agora)
  if (r.error) return { error: r.error }
  let acessoCriado = false
  let contaLigada = false
  if (de.comAcesso && de.email && de.documento) {
    const ficha = await ler(admin.from('clients').select('auth_id').eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(),
      'buscar o acesso da ficha') as { auth_id: string | null } | null
    if (ficha && !ficha.auth_id) {
      const acesso = await darAcessoAoCliente(admin, ctx, clientId, de.email, de.documento)
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
    const ficha = await ler(admin.from('clients').select('id, email, document, documento_tipo, documento_numero')
      .eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cliente') as {
        id: string; email: string | null; document: string | null; documento_tipo: string | null; documento_numero: string | null
      } | null
    if (!ficha) return { error: 'Cliente não encontrado.' }
    // O CPF, ou sem ele o passaporte/RNE (decisão 1 do Heitor, 2026-11-05).
    const doc = documentoDoAcesso(ficha)
    if (!ficha.email || !doc) return { error: 'Para o acesso ao app, salve antes o e-mail e um documento da cliente (CPF, passaporte ou RNE).' }
    if (doc.tipo === 'CPF' && !cpfValido(doc.numero)) return { error: CPF_INVALIDO }
    const r = await darAcessoAoCliente(admin, ctx, ficha.id, ficha.email.toLowerCase(), doc)
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
  // C35: o Financeiro em "só os meus" não dá crédito.
  { const soOsMeus = recusaDoSoOsMeus(ctx); if (soOsMeus) return { error: soOsMeus } }
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

  // A unidade do crédito: da rede, e a do contexto vence a do formulário (D5).
  const branch = await resolveBranch(ctx, branchId)
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
    branch_id:   branch.id as string,
    amount,
    description,
    // A41 da 9ª: concedido pela clínica, sem dinheiro (o comprado é o "Crédito na clínica" do Vender).
    concedido:   true,
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
    /** O responsável legal da menor (decisão 2 do Heitor, 2026-11-05). Só vale na menor. */
    responsavel?:       { nome?: string; cpf?: string; parentesco?: string; telefone?: string }
    /**
     * "Indicada por" (decisão do Heitor, 2026-11-10): o id da ficha de quem
     * indicou, ou nulo para tirar. Opcional: quem não o edita não o apaga.
     */
    indicadaPor?:       string | null
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
  // O e-mail também (C31, F70): a aba Dados gravava "sem-arroba".
  if (data.email?.trim() && !EMAIL_VALIDO.test(data.email.trim())) return { error: EMAIL_INVALIDO }
  const doc = documentoDaFicha(data.documentType ?? 'CPF', data.document)
  if ('error' in doc) return doc
  // O responsável só vem quando a tela o mostra (a menor); sem o campo, o que está fica.
  const resp = data.responsavel ? colunasDoResponsavel(data.responsavel, data.birthDate) : { colunas: {} }
  if ('error' in resp) return resp
  // A ficha de quem indicou é da clínica e não é ela mesma; ligada, o texto da importação sai (a ligação diz).
  let indicacao: Record<string, unknown> = {}
  if (data.indicadaPor !== undefined) {
    const indicada = await conferirIndicadaPor(admin, ctx.tenantId!, data.indicadaPor, clientId)
    if ('error' in indicada) return { error: indicada.error }
    indicacao = indicada.id ? { indicada_por: indicada.id, referred_by: null } : { indicada_por: null }
  }

  // O núcleo que a ficha e o Copilot dividem (lib/clients/atualizar.ts).
  return atualizarClienteCore(admin, ctx, clientId, {
    ...doc.colunas,
    ...resp.colunas,
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
    ...indicacao,
  }, slug)
}

// --- Buscar cliente por CPF (para autocomplete interno) -----------
export async function lookupClientByCpf(
  cpf: string,
  currentClientId: string,
): Promise<{ found: boolean; isSelf: boolean; name?: string }> {
  const ctx   = await getTenantContext()
  // É o aviso "CPF já cadastrado" de quem edita a ficha: sem Clientes em
  // Gerenciar, não diz de quem é um CPF (C3 — respondia a qualquer membro).
  if (!can(ctx, 'clients', 'MANAGE')) return { found: false, isSelf: false }
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
  if (!ctx.clientId) return { error: 'Cadastro não encontrado.' }

  const admin = createAdminClient()
  const texto = (k: string) => (formData.get(k) as string | null)?.trim() || null
  const phone = texto('phone')
  const email = texto('email')
  // As regras da ficha (C29, F70): gravava qualquer coisa — o telefone
  // incompleto, o e-mail sem "@" — e devolvia o erro cru do banco.
  if (phone && !telefoneDoCadastro(phone)) return { error: TELEFONE_INCOMPLETO }
  if (email && !EMAIL_VALIDO.test(email)) return { error: EMAIL_INVALIDO }

  // A ficha é a da clínica do ENDEREÇO (ctx.clientId, §5); a rede sai dela.
  const ficha = await ler(admin.from('clients').select('tenant_id').eq('id', ctx.clientId).maybeSingle(),
    'buscar o cadastro da cliente') as { tenant_id: string } | null
  if (!ficha) return { error: 'Cadastro não encontrado.' }

  // O núcleo da ficha (lib/clients/atualizar.ts), como a aba Dados e o
  // Copilot: a rede conferida, o "dados alterados" para as automações, e o
  // cache da lista de clientes expirado.
  try {
    const r = await atualizarClienteCore(admin, { ...ctx, tenantId: ficha.tenant_id }, ctx.clientId, {
      // O de outro país guarda o "+", como foi escrito (a regra da aba Dados).
      phone:              telefoneInternacional(phone) ?? (phone?.replace(/\D/g, '') || null),
      email:              email?.toLowerCase() ?? null,
      zip_code:           texto('zip_code')?.replace(/\D/g, '') || null,
      address:            texto('address'),
      address_number:     texto('address_number'),
      address_complement: texto('address_complement'),
      neighborhood:       texto('neighborhood'),
      city:               texto('city'),
      state:              texto('state'),
    })
    if (r.error) return { error: r.error }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
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
