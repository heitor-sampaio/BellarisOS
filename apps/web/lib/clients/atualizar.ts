import 'server-only'
import { revalidatePath, revalidateTag } from 'next/cache'
import type { TenantContext } from '@estetica-os/types'
import { EVENTOS } from '@estetica-os/types'
import type { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { emitirEventoDeCliente } from '@/lib/events/cliente'
import { camposAlterados } from '@/lib/events/emitir'
import { documentoEstrangeiroRepetido, type ColunasDoDocumento } from '@/lib/clients/documento'
import { propagarDadosDaPessoa } from '@/lib/contatos/propagar'

type Admin = ReturnType<typeof createAdminClient>

const COLUNAS_DO_EVENTO = 'name, phone, email, birth_date, document, documento_tipo, documento_numero, tags, gender, notes, city'

/**
 * Atualizar o cadastro de um cliente — o núcleo que a ficha
 * (`updateClientContactData`) e o Copilot dividem (2026-10-08). Não confere o
 * MÓDULO (quem chama confere); confere a rede, o CPF repetido, e emite o
 * "dados alterados" só quando algo mudou.
 *
 * `colunas` já vêm no formato do banco (dígitos, e-mail normalizado) e são
 * PARCIAIS: só o que veio muda.
 */
export async function atualizarClienteCore(
  admin: Admin, ctx: TenantContext, clientId: string, colunas: Record<string, unknown>,
  /** A unidade de onde saiu a edição — a ficha existe nos dois portais. */
  slug?: string | null,
  /** O "Unificar com a ficha" do cadastro (A23): o evento leva a marca, e o Histórico da ficha o mostra. */
  opcoes: { unificado?: boolean } = {},
): Promise<{ error?: string; alterou?: string[] }> {
  // O estado ANTERIOR, para o evento poder dizer O QUE mudou — a automação
  // pergunta "foi o telefone?", não só "mudou?".
  const antes = await ler(admin.from('clients').select(COLUNAS_DO_EVENTO)
    .eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cliente')
  if (!antes) return { error: 'Cliente não encontrado.' }

  if (colunas.document) {
    const dup = await ler(admin.from('clients').select('id, name')
      .eq('tenant_id', ctx.tenantId!).eq('document', colunas.document as string).neq('id', clientId)
      .limit(1).maybeSingle(), 'buscar o cliente')
    if (dup) return { error: `CPF já cadastrado para ${dup.name}.` }
  }
  // O passaporte ou RNE (D-11): um por rede, como o CPF.
  const repetido = await documentoEstrangeiroRepetido(admin, ctx.tenantId!, colunas as Partial<ColunasDoDocumento>, clientId)
  if (repetido) return { error: repetido }

  await gravar(admin.from('clients').update({ ...colunas, updated_at: new Date().toISOString() })
    .eq('id', clientId).eq('tenant_id', ctx.tenantId!), 'atualizar o cliente')

  const depois = await ler(admin.from('clients').select(COLUNAS_DO_EVENTO)
    .eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cliente')
  const alterou = camposAlterados(antes ?? {}, depois ?? {})
  // Salvar sem mexer em nada é comum — abriu a aba, clicou em salvar. Emitir
  // aí faria toda automação de "dados alterados" disparar à toa.
  if (alterou.length > 0) {
    await emitirEventoDeCliente(EVENTOS.CLIENTE_DADOS_ALTERADOS, clientId, ctx, { alterou, unificado: opcoes.unificado })
  }
  // A21 da 7ª simulação: a ficha renomeada (o "Lead 3 Cardoso" virou Patrícia)
  // e o card seguia o nome antigo. O nome é da PESSOA, e as cópias acompanham
  // (crm-inbox.md §9.2.1): a pessoa do CRM ligada à ficha — pelas
  // oportunidades e pelas conversas dela — ganha o nome novo, pela porta de
  // sempre (`propagarDadosDaPessoa`: a pessoa, as conversas, as oportunidades e
  // a linha do tempo de cada uma).
  if (alterou.includes('name') && typeof depois?.name === 'string' && depois.name.trim()) {
    await propagarNomeDaFicha(admin, ctx, clientId, depois.name)
  }

  if (slug) revalidatePath(`/${slug}/clients/${clientId}`)
  revalidatePath(`/admin/clients/${clientId}`)
  revalidateTag(`clients:${ctx.tenantId!}`, { expire: 0 })
  return { alterou }
}

/** As pessoas do CRM ligadas à ficha (pelas oportunidades e pelas conversas) recebem o nome novo (A21). */
async function propagarNomeDaFicha(admin: Admin, ctx: TenantContext, clientId: string, nome: string): Promise<void> {
  const [doLead, daConversa] = await Promise.all([
    ler(admin.from('leads').select('contato_id').eq('tenant_id', ctx.tenantId!).eq('client_id', clientId), 'buscar as oportunidades da ficha'),
    ler(admin.from('conversations').select('contato_id').eq('tenant_id', ctx.tenantId!).eq('client_id', clientId), 'buscar as conversas da ficha'),
  ])
  const pessoas = new Set(
    [...((doLead ?? []) as { contato_id: string | null }[]), ...((daConversa ?? []) as { contato_id: string | null }[])]
      .map(l => l.contato_id).filter((x): x is string => !!x),
  )
  for (const pessoa of pessoas) {
    await propagarDadosDaPessoa(admin, ctx as Parameters<typeof propagarDadosDaPessoa>[1], pessoa, { nome })
  }
}
