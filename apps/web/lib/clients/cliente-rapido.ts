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

import { unitTag, telefoneDoCadastro } from '@estetica-os/utils'
import { emitirEventoDeCliente } from '@/lib/events/cliente'
import { EVENTOS } from '@estetica-os/types'
import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { conferirIndicadaPor } from '@/lib/clients/indicada-por'
import { fichasQueJaExistem, respostaDoJaExiste, proximaSemResposta, atualizarFichaComOPreenchido, type FichaQueJaExiste } from '@/lib/clients/ja-existe'
import { RECUSA_DE_UNIFICAR_SEM_CLIENTES } from '@/lib/clients/ja-existe-texto'

/**
 * Quem pode unificar com / reativar a ficha que existe (C66, H4 = b): Clientes
 * em Gerenciar. Criar a ficha rápida continua sem pedir o módulo.
 */
export const podeUnificarFicha = (ctx: Pick<TenantContext, 'permissions'>) => ctx.permissions?.clients === 'MANAGE'

/** A ficha que a pergunta mostra, dizendo se quem pergunta pode unificar. */
export function comPermissaoDeUnificar(f: FichaQueJaExiste, ctx: Pick<TenantContext, 'permissions'>): FichaQueJaExiste {
  return { ...f, podeUnificar: podeUnificarFicha(ctx) }
}

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
  /**
   * O que mais a pessoa deu (o Copilot, 2026-10-08): entra no MESMO insert —
   * com um update depois, uma falha no meio deixava o cliente criado sem eles,
   * e o evento "cliente criado" saía antes deles existirem. Não cria login.
   */
  complemento?: {
    email?: string | null; document?: string | null; birthDate?: string | null
    /** Sem CPF, o passaporte ou o RNE (decisão 1 da 7ª; o Copilot, como o cadastro da tela). */
    estrangeiro?: { tipo: 'PASSAPORTE' | 'RNE'; numero: string } | null
  }
  /**
   * A resposta à pergunta "Já existe a ficha de X" (r2-cli-01): "cadastrar:<id>"
   * (uma por ficha, separadas por espaço) ou "atualizar:<id>"
   * (`lib/clients/ja-existe.ts`). Sem ela, a ficha que já existe PERGUNTA.
   */
  jaExiste?:       string | null
  /**
   * "Indicada por" (decisão do Heitor, 2026-11-10): o id da ficha de quem
   * indicou. Só na ficha que NASCE aqui; conferido (da clínica) antes de gravar.
   */
  indicadaPor?:    string | null
}

export interface ClienteRapidoResult {
  clientId?: string
  /** `false` quando a pessoa escolheu a ficha que já existia ("Atualizar a ficha de X"). */
  criado?:   boolean
  error?:    string
  /** A ficha que JÁ EXISTE, sem resposta ainda: nada foi gravado — a tela pergunta (r2-cli-01). */
  jaExiste?: FichaQueJaExiste
}

/**
 * Devolve o cliente para este nome + telefone, criando-o se ainda não existir.
 *
 * A ficha que JÁ EXISTE — o mesmo telefone (até a arquivada), o mesmo CPF, ou o
 * mesmo nome com a mesma data de nascimento — não é mais reaproveitada calada
 * (r2-cli-01, o Heitor em 2026-11-03: "antes de gravar no banco, confere se já
 * existe; se já existir, retorna avisando que já existe, perguntando se deseja
 * cadastrar mesmo assim ou atualizar a ficha existente"): sem a resposta
 * (`jaExiste`), nada se grava e volta a ficha achada. "atualizar:<id>" usa a
 * ficha (reativando a arquivada) e grava nela o que veio; "cadastrar:<id>"
 * cria a nova mesmo assim.
 */
export async function garantirClienteRapido(
  admin: Admin,
  ctx: TenantContext,
  input: ClienteRapidoInput,
): Promise<ClienteRapidoResult> {
  const nome     = input.nome?.trim()
  // A regra do cadastro (`telefoneDoCadastro`): o brasileiro com DDD, ou o de
  // outro país com "+" e o código (cli-06, revisão do Heitor de 2026-11-02 —
  // "a estrangeira também chega pelo agendar rápido e pelo Copilot"). A ficha
  // grava como o cadastro: a máscara, ou o de fora como foi escrito.
  // O número que vem do WhatsApp (o lead, a conversa) é só dígitos, sem o "+":
  // com 12 a 15 e sem o 55, não é brasileiro — é o de fora.
  const soDigitos = (input.telefone ?? '').trim()
  const fone     = telefoneDoCadastro(input.telefone)
    ?? (/^\d{12,15}$/.test(soDigitos) && !soDigitos.startsWith('55') ? telefoneDoCadastro(`+${soDigitos}`) : null)

  if (!nome || nome.length < 2) return { error: 'Informe o nome de quem será atendido.' }
  if (!fone) return { error: 'Informe um telefone com DDD (de outro país, comece com + e o código do país).' }
  const telefone = fone.gravar
  if (!input.branchId)          return { error: 'Unidade não identificada.' }
  const indicada = await conferirIndicadaPor(admin, ctx.tenantId!, input.indicadaPor)
  if ('error' in indicada) return { error: indicada.error }

  const branch = await ler(admin
    .from('branches')
    .select('id, name')
    .eq('id', input.branchId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle(), 'buscar a unidade')
  if (!branch) return { error: 'Unidade inválida.' }

  // A comparação é feita no banco, sobre os dígitos (`cliente_por_telefone`).
  // `phone` guarda o que foi digitado — com máscara no formulário, cru quando
  // veio do WhatsApp — e comparar texto com texto fazia "(47) 99123-4567" e
  // "47991234567" virarem duas pessoas.
  // `fichas_do_telefone` (a mais antiga primeiro, como `cliente_por_telefone`)
  // compara também o número de fora com menos de 10 dígitos.
  const resposta = respostaDoJaExiste(input.jaExiste)
  const jaExistem = await fichasQueJaExistem(admin, ctx.tenantId!, {
    digitos: fone.digitos, cpf: input.complemento?.document ?? null, nome, nascimento: input.complemento?.birthDate ?? null,
  }, { comArquivadas: true })

  // "Agendar para a ficha de X" (C66): a ficha como está — nada se grava nela.
  // A arquivada não: trazê-la de volta é reativar, que pede o módulo.
  const usada = resposta.usar ? jaExistem.find(f => f.id.toLowerCase() === resposta.usar) : null
  if (usada) {
    if (usada.arquivada) return { error: `A ficha de ${usada.nome} está arquivada: reativá-la pede Clientes em Gerenciar. Cadastre mesmo assim, ou peça a quem cuida dos clientes.` }
    if (input.conversationId) await ligarContatoAoCliente(admin, ctx.tenantId!, input.conversationId, usada.id)
    return { clientId: usada.id, criado: false }
  }
  const escolhida = resposta.atualizar ? jaExistem.find(f => f.id.toLowerCase() === resposta.atualizar) : null
  // Unificar e reativar mexem na ficha que existe: Clientes em Gerenciar (C66).
  if (escolhida && !podeUnificarFicha(ctx)) return { error: RECUSA_DE_UNIFICAR_SEM_CLIENTES }
  if (escolhida) {
    // "Reativar a ficha de X" (a arquivada volta) / "Unificar com a ficha de X" (sem trocar o nome dela, r3-f14-01).
    if (escolhida.arquivada) {
      await gravar(admin.from('clients').update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', escolhida.id).eq('tenant_id', ctx.tenantId!).select('id').single(), 'reativar a ficha')
      await emitirEventoDeCliente(EVENTOS.CLIENTE_REATIVADO, escolhida.id, ctx)
    }
    const r = await atualizarFichaComOPreenchido(admin, ctx, escolhida.id, {
      phone: telefone, email: input.complemento?.email ?? null,
      documento: input.complemento?.document ? { document: input.complemento.document, documento_tipo: null, documento_numero: null }
        : input.complemento?.estrangeiro ? { document: null, documento_tipo: input.complemento.estrangeiro.tipo, documento_numero: input.complemento.estrangeiro.numero }
        : null,
      birth_date: input.complemento?.birthDate ?? null,
    })
    if (r.error) return { error: r.error }
    if (input.conversationId) await ligarContatoAoCliente(admin, ctx.tenantId!, input.conversationId, escolhida.id)
    return { clientId: escolhida.id, criado: false }
  }
  const pendente = proximaSemResposta(jaExistem, resposta.cadastrar)
  if (pendente) return { jaExiste: comPermissaoDeUnificar(pendente, ctx) }

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
      ...(input.complemento?.email ? { email: input.complemento.email } : {}),
      ...(input.complemento?.document ? { document: input.complemento.document } : {}),
      ...(!input.complemento?.document && input.complemento?.estrangeiro
        ? { documento_tipo: input.complemento.estrangeiro.tipo, documento_numero: input.complemento.estrangeiro.numero } : {}),
      ...(input.complemento?.birthDate ? { birth_date: input.complemento.birthDate } : {}),
      ...(indicada.id ? { indicada_por: indicada.id } : {}),
    })
    .select('id')
    .single()

  // A corrida (a ficha nasceu entre a pergunta e o insert): a unique do CPF
  // ou do documento não chega crua à tela (C29, F70).
  if (error?.code === '23505') return { error: 'Já existe uma ficha com este documento. Procure-a em Clientes (inclusive nas arquivadas).' }
  if (error || !cliente) return { error: `Erro ao cadastrar o cliente: ${error?.message ?? 'desconhecido'}` }

  await gravar(admin.rpc('fidelidade_conta', { p_cliente: cliente.id }), 'abrir a conta de fidelidade')

  // A corrente de eventos. Sai daqui, e não das actions, pelo mesmo motivo do
  // agendamento: cliente nasce por três caminhos (cadastro rápido no agendar,
  // ficha completa, conversão de contato no inbox) e o fato é um só. A chave
  // determinística no ajudante garante que o caminho da ficha completa, que
  // passa por aqui antes, não emita duas vezes.
  await emitirEventoDeCliente(EVENTOS.CLIENTE_CRIADO, cliente.id as string, ctx)

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

  const data = await ler(admin.rpc('cliente_por_telefone', {
    p_tenant:  tenantId,
    p_digitos: digitos,
    p_sem_cpf: true,
  }), 'carregar o cliente pelo telefone')
  return data ? { id: data as string } : null
}
