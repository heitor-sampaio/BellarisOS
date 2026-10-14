import { getTenantContext, assertPermission, assertRecurso } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { resolvePeriod } from '@/lib/metrics'
import { getDocumentosDoPainel, getResumoDosDocumentos, DOCUMENTOS_POR_PAGINA } from '@/lib/metrics/documentos'
import { ehSituacao, ehTipoDeDocumento } from '@/lib/documentos/situacao'
import { renderizarPendentes, COLUNAS_DO_DOCUMENTO, type DocumentoEmitido } from '@/lib/documentos/renderizar'
import { rotuloDoQueFalta } from '@/lib/documentos/leitura'
import { PainelDeDocumentos } from '@/components/shared/painel-de-documentos'

export interface ParamsDosDocumentos {
  period?: string; from?: string; to?: string
  situacao?: string; tipo?: string; q?: string; pagina?: string; unidade?: string
}

/**
 * Documentos — a mesma tela nos dois portais (pedido do Heitor, 2026-10-14).
 *
 * Todos os termos e contratos emitidos no período, com a situação de cada um
 * (faltam dados, a enviar, enviado, assinado…) e a trilha de cada documento.
 * Só leitura: colher, gerar link e pedir no portal continuam na ficha do
 * cliente, que a janela do documento abre.
 *
 * `unidade` vem da página: a da rota no portal da unidade; nula no da rede
 * (aí o filtro `?unidade=` recorta).
 */
export async function DocumentosEmitidos({
  unidade, params,
}: {
  unidade: { id: string; name: string; slug: string } | null
  params:  ParamsDosDocumentos
}) {
  const ctx = await getTenantContext()
  assertRecurso(ctx, 'documentos')
  assertPermission(ctx, 'documents', 'VIEW')
  const admin = createAdminClient()

  const unidades = (await ler(admin.from('branches').select('id, name, slug')
    .eq('tenant_id', ctx.tenantId!).eq('is_active', true).order('name'), 'carregar as unidades')) as { id: string; name: string; slug: string }[] | null ?? []

  // Quem tem unidade fixa vê a dela, peça a URL o que pedir (ctx.branchId ?? pedido).
  const escolhida = unidade ?? unidades.find(u => u.id === params.unidade || u.slug === params.unidade) ?? null
  const branchIds = ctx.branchId ? [ctx.branchId] : escolhida ? [escolhida.id] : null

  const periodo = resolvePeriod(params.period ?? 'month', params.from, params.to)
  const recorte = { tenantId: ctx.tenantId!, branchIds, from: periodo.from, to: periodo.fullTo }
  const filtros = {
    situacao: ehSituacao(params.situacao) ? params.situacao : null,
    tipo:     ehTipoDeDocumento(params.tipo) ? params.tipo : null,
    busca:    params.q ?? null,
  }
  let pagina = Math.max(1, Number.parseInt(params.pagina ?? '1', 10) || 1)

  let [lista, resumo] = await Promise.all([
    getDocumentosDoPainel({ ...recorte, ...filtros, offset: (pagina - 1) * DOCUMENTOS_POR_PAGINA }),
    getResumoDosDocumentos(recorte),
  ])

  // O documento que o gatilho acabou de criar (A_GERAR) ainda não tem texto:
  // monta como a ficha monta, e lê de novo — senão ele não saberia se falta dado.
  const aGerar = lista.linhas.filter(l => l.status === 'A_GERAR').map(l => l.id)
  if (aGerar.length) {
    const docs = await ler(admin.from('issued_documents').select(COLUNAS_DO_DOCUMENTO)
      .eq('tenant_id', ctx.tenantId!).in('id', aGerar), 'carregar os documentos a montar')
    await renderizarPendentes(ctx.tenantId!, (docs ?? []) as unknown as DocumentoEmitido[])
    ;[lista, resumo] = await Promise.all([
      getDocumentosDoPainel({ ...recorte, ...filtros, offset: (pagina - 1) * DOCUMENTOS_POR_PAGINA }),
      getResumoDosDocumentos(recorte),
    ])
  }

  // Filtro novo com a página de antes: volta para a primeira em vez de "nada".
  if (lista.linhas.length === 0 && pagina > 1) {
    pagina = 1
    lista = await getDocumentosDoPainel({ ...recorte, ...filtros, offset: 0 })
  }

  const slugDe = new Map(unidades.map(u => [u.id, u.slug]))
  const nomeDe = new Map(unidades.map(u => [u.id, u.name]))

  return (
    <PainelDeDocumentos
      escopo={unidade?.name ?? escolhida?.name ?? 'Rede'}
      periodo={{ chave: periodo.key, rotulo: periodo.label, de: params.from, ate: params.to }}
      unidades={!unidade && !ctx.branchId && unidades.length > 1 ? unidades.map(u => ({ id: u.id, nome: u.name })) : null}
      unidadeEscolhida={escolhida?.id ?? null}
      filtros={filtros}
      pagina={pagina}
      paginas={Math.max(1, Math.ceil(lista.total / DOCUMENTOS_POR_PAGINA))}
      total={lista.total}
      resumo={resumo}
      linhas={lista.linhas.map(l => ({
        ...l,
        faltando: l.faltando.map(rotuloDoQueFalta),
        unidade: l.branchId ? nomeDe.get(l.branchId) ?? null : null,
        slug:    l.branchId ? slugDe.get(l.branchId) ?? unidade?.slug ?? null : unidade?.slug ?? null,
      }))}
      comUnidade={!unidade && !ctx.branchId && !escolhida && unidades.length > 1}
    />
  )
}
