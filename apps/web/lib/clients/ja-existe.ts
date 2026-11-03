import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { atualizarClienteCore } from '@/lib/clients/atualizar'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O cadastro da cliente que JÁ EXISTE (r2-cli-01, o Heitor em 2026-11-03:
 * "antes de gravar no banco, confere se já existe; se já existir, retorna
 * avisando que já existe, perguntando se deseja cadastrar mesmo assim ou
 * atualizar a ficha existente").
 *
 * Antes de gravar, todo caminho de cadastro (o formulário, o "+ Agendar" com
 * nome e telefone, o agendar pelo CRM, o Copilot) procura a ficha ATIVA da
 * clínica com o mesmo CPF, o mesmo telefone, ou o mesmo nome com a mesma data
 * de nascimento. Achou: nada se grava, e a pessoa escolhe "Cadastrar mesmo
 * assim" ou "Atualizar a ficha de X". A ficha ARQUIVADA continua com a pergunta
 * dela ("Reativar a ficha", r2-cli-02).
 *
 * Isto substitui a trava calada dos 60 s (o mesmo nome com o mesmo telefone
 * virava o mesmo cadastro sem dizer nada) e as duas perguntas de antes — a
 * ficha rápida ("É a mesma pessoa?") e a outra cliente do telefone ("O
 * telefone já é de…"). A chave do envio (`umaVez`) segue valendo contra o
 * duplo clique.
 */

export type { MotivoDaFicha, FichaQueJaExiste } from './ja-existe-texto'
export { textoDaFichaQueJaExiste, rotuloDoAtualizar, respostaDoJaExiste, proximaSemResposta } from './ja-existe-texto'
import type { MotivoDaFicha, FichaQueJaExiste } from './ja-existe-texto'

/** O que a pessoa digitou e identifica alguém. */
export interface IdentidadeDoCadastro {
  /** Os 11 dígitos do CPF, ou nulo. */
  cpf?:        string | null
  /** Os dígitos do telefone (`telefoneDoCadastro(...).digitos`). */
  digitos?:    string | null
  nome?:       string | null
  /** AAAA-MM-DD, ou nulo. */
  nascimento?: string | null
}

const nomeLimpo = (n: string) => n.trim().replace(/\s+/g, ' ')
const escaparLike = (s: string) => s.replace(/[\\%_]/g, m => `\\${m}`)

/**
 * As fichas ATIVAS da clínica que já são esta pessoa, na ordem: o CPF, o
 * telefone, o nome com a mesma data de nascimento (sem repetir a ficha).
 */
export async function fichasQueJaExistem(
  admin: Admin, tenantId: string, q: IdentidadeDoCadastro,
  /** As arquivadas do TELEFONE também (os caminhos rápidos; o formulário tem a pergunta própria delas). */
  opcoes: { comArquivadas?: boolean } = {},
): Promise<FichaQueJaExiste[]> {
  const achadas: FichaQueJaExiste[] = []
  const junta = (id: string, nome: string, motivo: MotivoDaFicha, arquivada = false) => {
    if (!achadas.some(f => f.id === id)) {
      achadas.push({ id, nome, motivo, podeCadastrarMesmoAssim: motivo !== 'CPF', ...(arquivada ? { arquivada: true } : {}) })
    }
  }

  if (q.cpf) {
    const doCpf = await ler(admin.from('clients').select('id, name').eq('tenant_id', tenantId)
      .eq('document', q.cpf).eq('is_active', true).limit(1), 'conferir se o CPF já tem ficha') as { id: string; name: string }[] | null
    for (const c of doCpf ?? []) junta(c.id, c.name, 'CPF')
  }
  if (q.digitos && q.digitos.length >= 8) {
    const doTelefone = await ler(admin.rpc('fichas_do_telefone', { p_tenant: tenantId, p_digitos: q.digitos }),
      'conferir se o telefone já tem ficha') as { id: string; nome: string; ativa: boolean }[] | null
    for (const c of (doTelefone ?? []).filter(f => f.ativa)) junta(c.id, c.nome, 'TELEFONE')
    if (opcoes.comArquivadas) for (const c of (doTelefone ?? []).filter(f => !f.ativa)) junta(c.id, c.nome, 'TELEFONE', true)
  }
  const nome = q.nome ? nomeLimpo(q.nome) : ''
  if (nome.length >= 2 && q.nascimento && /^\d{4}-\d{2}-\d{2}$/.test(q.nascimento)) {
    const doNome = await ler(admin.from('clients').select('id, name').eq('tenant_id', tenantId)
      .ilike('name', escaparLike(nome)).eq('birth_date', q.nascimento).eq('is_active', true).order('created_at').limit(5),
      'conferir se o nome e o nascimento já têm ficha') as { id: string; name: string }[] | null
    for (const c of doNome ?? []) junta(c.id, c.name, 'NOME_E_NASCIMENTO')
  }
  return achadas
}

/** O que o cadastro trouxe, já no formato do banco. Vazio/nulo = não veio. */
export interface PreenchidoAgora {
  name?:       string | null
  phone?:      string | null
  email?:      string | null
  /** As colunas do documento (`documentoDaFicha`): CPF em `document`, ou passaporte/RNE. */
  documento?:  { document: string | null; documento_tipo: string | null; documento_numero: string | null } | null
  birth_date?: string | null
  gender?:     string | null
  notes?:      string | null
  tags?:       string[] | null
}

/**
 * "Atualizar a ficha de X": grava na ficha existente SÓ o que foi preenchido
 * agora, sem apagar o que está lá — o campo vazio não mexe no dela; o
 * preenchido toma o lugar. Duas exceções, para não perder nada: as
 * observações SOMAM (a de agora vai abaixo da que existia) e as tags se
 * juntam. O CPF diferente do que a ficha já tem é recusado (é outra pessoa,
 * ou um erro de digitação). Pelo núcleo da ficha (`atualizarClienteCore`): o
 * CPF repetido, o evento "dados alterados".
 */
export async function atualizarFichaComOPreenchido(
  admin: Admin, ctx: TenantContext, clientId: string, agora: PreenchidoAgora,
): Promise<{ error?: string }> {
  const antes = await ler(admin.from('clients').select('name, document, notes, tags, is_active')
    .eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a ficha que já existe') as {
      name: string; document: string | null; notes: string | null; tags: string[] | null; is_active: boolean
    } | null
  if (!antes || !antes.is_active) return { error: 'A ficha não foi encontrada.' }

  const colunas: Record<string, unknown> = {}
  const texto = (v: string | null | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  if (texto(agora.name)) colunas.name = texto(agora.name)
  if (texto(agora.phone)) colunas.phone = texto(agora.phone)
  if (texto(agora.email)) colunas.email = texto(agora.email)!.toLowerCase()
  if (texto(agora.birth_date)) colunas.birth_date = texto(agora.birth_date)
  if (texto(agora.gender)) colunas.gender = texto(agora.gender)
  const doc = agora.documento
  if (doc?.document) {
    if (antes.document && antes.document !== doc.document) return { error: `A ficha de ${antes.name} já tem outro CPF. Confira o CPF digitado.` }
    colunas.document = doc.document
  } else if (doc?.documento_numero) {
    colunas.documento_tipo = doc.documento_tipo
    colunas.documento_numero = doc.documento_numero
  }
  const notas = texto(agora.notes)
  if (notas && !(antes.notes ?? '').includes(notas)) colunas.notes = antes.notes?.trim() ? `${antes.notes.trim()}\n${notas}` : notas
  const novas = (agora.tags ?? []).filter(t => !(antes.tags ?? []).some(x => x.toLowerCase() === t.toLowerCase()))
  if (novas.length) colunas.tags = [...(antes.tags ?? []), ...novas]

  if (!Object.keys(colunas).length) return {}
  return atualizarClienteCore(admin, ctx, clientId, colunas)
}
