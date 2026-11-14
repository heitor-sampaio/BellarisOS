import 'server-only'
import { headers } from 'next/headers'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { sha256 } from './renderizar'
import { textoDoAceite } from './aceite'
import { emitirEventoClinico } from '@/lib/events/clinico'
import { EVENTOS } from '@estetica-os/types'
import { gerarPdfAssinado } from './pdf'
import { documentoSemCpf } from './valores'
import { quemAssina, responsavelDaFicha } from '@/lib/clients/menor'

/**
 * O que os canais de assinatura têm em comum (clínica, papel, portal, link).
 * Mora fora de `actions/` porque lá todo export vira endpoint público.
 */

export interface DocumentoAssinavel {
  id:             string
  tenant_id:      string
  branch_id:      string | null
  client_id:      string
  appointment_id: string | null
  /** O plano do documento (contrato e termos do checkout), se houver. */
  treatment_plan_id: string | null
  /** O pacote vendido do documento (PC2, leva 2), se houver. */
  client_package_id?: string | null
  title:          string
  status:         string
}

export const COLUNAS_ASSINAVEIS = 'id, tenant_id, branch_id, client_id, appointment_id, treatment_plan_id, client_package_id, title, status'

/**
 * O IP de quem está na tela. O `X-Real-IP` vem PRIMEIRO: é a borda do Railway
 * que o escreve, com o IP de quem conectou. O `x-forwarded-for` o cliente
 * manda como quiser, e a borda só acrescenta ao fim — lido primeiro, bastaria
 * trocar o cabeçalho a cada tentativa para furar o limite por IP do link
 * público. Só vai para o banco se tiver cara de IP: o parâmetro é `inet`, e
 * um valor torto faria a ASSINATURA inteira falhar.
 */
export async function ipEAparelho(): Promise<{ ip: string | null; ua: string | null }> {
  const h = await headers()
  const bruto = (h.get('x-real-ip') ?? h.get('x-forwarded-for') ?? '').split(',')[0]!.trim()
  const ip = /^(\d{1,3}\.){3}\d{1,3}$/.test(bruto) || (/^[0-9a-f:]+$/i.test(bruto) && bruto.includes(':')) ? bruto : null
  return { ip, ua: (h.get('user-agent') ?? '').slice(0, 500) || null }
}

export async function dadosDoAssinante(clientId: string): Promise<{ nome: string; documento: string | null }> {
  const admin = createAdminClient()
  const c = await ler(admin.from('clients')
    .select('name, document, documento_tipo, documento_numero, birth_date, responsavel_nome, responsavel_cpf, responsavel_parentesco, responsavel_telefone')
    .eq('id', clientId).single(), 'buscar o cliente')
  if (!c) throw new Error('Cliente do documento não encontrado.')
  // A menor com responsável é assinada por ELE (decisão 2 do Heitor,
  // 2026-11-05): a evidência guarda o nome e o CPF do responsável.
  const assina = quemAssina({ nome: c.name as string, nascimento: c.birth_date as string | null, responsavel: responsavelDaFicha(c) })
  if (assina.ehResponsavel) return { nome: assina.nome, documento: assina.documento }
  const cpf = ((c.document as string | null) ?? '').replace(/\D/g, '')
  // Sem CPF, o passaporte ou o RNE, com o tipo (cli-09): a evidência da
  // assinatura não fica sem documento da cliente estrangeira.
  return { nome: c.name as string, documento: cpf || documentoSemCpf(c.documento_tipo as string | null, c.documento_numero as string | null) }
}

/**
 * Depois que `documento_assinar` gravou: o evento (aviso do que aconteceu, e
 * só se gravou) e o PDF final em `after()` — quem assinou não espera o PDF, e
 * o cron `documentos-pdf` recolhe o que falhar aqui.
 *
 * `ator`: quem conduziu, da equipe; nulo quando foi o próprio cliente.
 */
export async function depoisDeAssinar(
  doc: DocumentoAssinavel,
  ator: { internalUserId: string | null; userName?: string | null } | null,
): Promise<void> {
  await emitirEventoClinico(EVENTOS.TERMO_ASSINADO, doc.id,
    { tenantId: doc.tenant_id, internalUserId: ator?.internalUserId ?? null, userName: ator?.userName ?? null }, {
      clientId:      doc.client_id,
      agendamentoId: doc.appointment_id,
      referencia:    doc.title,
      branchId:      doc.branch_id,
      chave:         'termo.assinado:' + doc.id,
    })
  revalidatePath('/admin/clients/[id]', 'page')
  revalidatePath('/[slug]/clients/[id]', 'page')
  revalidatePath('/[slug]/cliente/documentos', 'page')
  after(async () => {
    try { await gerarPdfAssinado(doc.tenant_id, doc.id) }
    catch (e) { console.error('[documentos] PDF assinado ficou para o cron:', (e as Error).message) }
  })
}

/** Um documento assinado junto com os outros: o id e o hash do que se VIU dele. */
export interface ItemDaAssinatura { id: string; hashExibido: string }

/**
 * Lê os itens de uma assinatura conjunta vindos do navegador: ids e hashes
 * bem formados, sem repetir, no máximo 30. `null` = pedido torto.
 */
export function itensDaAssinatura(entrada: unknown): ItemDaAssinatura[] | null {
  if (!Array.isArray(entrada) || entrada.length === 0 || entrada.length > 30) return null
  const itens: ItemDaAssinatura[] = []
  for (const i of entrada) {
    const id = (i as { id?: unknown })?.id
    const hash = (i as { hashExibido?: unknown })?.hashExibido
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) || typeof hash !== 'string' || hash.length > 128) return null
    itens.push({ id, hashExibido: hash })
  }
  return new Set(itens.map(i => i.id)).size === itens.length ? itens : null
}

/** A imagem da assinatura que veio do navegador, ou o motivo de recusar. */
export function recusaDaImagem(assinatura: unknown): string | null {
  if (typeof assinatura !== 'string' || !assinatura.startsWith('data:image/png;base64,')) return 'Faça a assinatura antes de confirmar.'
  if (assinatura.length > 400_000) return 'A imagem da assinatura ficou grande demais. Limpe e assine de novo.'
  return null
}

/**
 * UMA assinatura para N documentos de uma cliente (DC3, leva 2) — o mesmo
 * caminho na clínica, no portal e no link. `documentos_assinar` grava tudo
 * numa transação: cada documento com a sua evidência (a mesma imagem, o hash
 * DELE, o seu código). O aceite é montado AQUI, com os títulos do banco — é
 * ele que diz, na evidência de cada um, com o que a cliente concordou.
 */
export async function assinarJuntos(p: {
  docs: DocumentoAssinavel[]
  itens: ItemDaAssinatura[]
  canal: 'CLINICA' | 'PORTAL' | 'LINK'
  identidade: string
  assinatura: string
  conduzidoPor: string | null
  linkHash: string | null
  ator: { internalUserId: string | null; userName?: string | null } | null
}): Promise<{ id: string; codigo: string | null }[]> {
  const primeiro = p.docs[0]!
  const [assinante, rede] = await Promise.all([dadosDoAssinante(primeiro.client_id), ipEAparelho()])
  const ordem = new Map(p.itens.map((i, n) => [i.id, n]))
  const titulos = [...p.docs].sort((a, b) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0)).map(d => d.title)
  const r = await gravar(createAdminClient().rpc('documentos_assinar', {
    p_tenant:        primeiro.tenant_id,
    p_itens:         p.itens.map(i => ({ id: i.id, hash: i.hashExibido })),
    p_canal:         p.canal,
    p_identidade:    p.identidade,
    p_png:           p.assinatura,
    p_png_sha256:    sha256(p.assinatura),
    p_nome:          assinante.nome,
    p_documento:     assinante.documento,
    p_ip:            rede.ip,
    p_ua:            rede.ua,
    p_conduzido_por: p.conduzidoPor,
    p_link_hash:     p.linkHash,
    p_scan_path:     null,
    p_scan_sha256:   null,
    p_aceite:        textoDoAceite(assinante.nome, titulos).slice(0, 2000),
  }), 'registrar a assinatura') as { documentos: { id: string; codigo: string | null }[] }
  for (const d of p.docs) await depoisDeAssinar(d, p.ator)
  return r.documentos
}
