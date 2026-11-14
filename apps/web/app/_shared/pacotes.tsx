import { can } from '@/lib/auth'
import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { PacotesCatalogo } from '@/components/admin/pacotes-catalogo'
import { catalogoDePacotes } from '@/lib/pacotes/leitura'
import { podeMudarComissaoDoProcedimento } from '@/lib/comissoes/gravacao'
import { TEXTO_DA_VENDA_DO_PACOTE } from '@/lib/permissions-copy'
import { redeTemRecurso } from '@estetica-os/nucleo/lib/planos/da-rede'
import type { DocumentosDoCatalogo } from '@/components/admin/pacotes-catalogo'

interface LinhaDoProcedimento {
  id: string; name: string; price: number | null
  consent_template_id: string | null; contract_template_id: string | null; outros_documentos: string[] | null
}

/**
 * Vendas → Pacotes, o corpo dos dois portais. O catálogo é da REDE: edita quem
 * tem Procedimentos em Gerenciar, e só isso (PC6, a revisão do Heitor de
 * 2026-11-13), dos dois portais. A venda é no PDV.
 */
export async function PacotesDaRede({ ctx, unidadeId, busca }: { ctx: TenantContext; unidadeId?: string; busca?: string }) {
  const podeEditar = can(ctx, 'procedures', 'MANAGE')
  // A comissão do pacote (2026-10-30) é do financeiro, como a do procedimento.
  const podeComissao = podeEditar && podeMudarComissaoDoProcedimento(ctx)
  const admin = createAdminClient()
  const [pacotes, procedimentos, comDocumentos] = await Promise.all([
    catalogoDePacotes(ctx.tenantId!, { branchId: unidadeId ?? null }),
    podeEditar
      ? ler(admin.from('procedures').select('id, name, price, consent_template_id, contract_template_id, outros_documentos')
          .eq('tenant_id', ctx.tenantId!).is('branch_id', null).eq('is_active', true).order('name'), 'carregar os procedimentos')
      : Promise.resolve([] as LinhaDoProcedimento[]),
    podeEditar ? redeTemRecurso(ctx.tenantId!, 'documentos') : Promise.resolve(false),
  ])
  const linhas = (procedimentos ?? []) as LinhaDoProcedimento[]

  // DC1c/PC9b (Bloco Documentos, leva 2): o pop-up do pacote mostra os
  // documentos que ele puxa dos procedimentos — e o contrato de pacote da rede.
  let documentos: DocumentosDoCatalogo | null = null
  if (comDocumentos) {
    const modelos = (await ler(admin.from('document_templates').select('id, name, kind')
      .eq('tenant_id', ctx.tenantId!).eq('is_active', true).order('name'), 'carregar os modelos de documento') ?? []) as
      { id: string; name: string; kind: string }[]
    documentos = {
      contrato: modelos.find(m => m.kind === 'CONTRATO_PACOTE')?.name ?? null,
      modelos: modelos.map(m => ({ id: m.id, nome: m.name, tipo: m.kind })),
      procedimentos: linhas.map(p => ({
        id: p.id, nome: p.name, termo: p.consent_template_id, contrato: p.contract_template_id, outros: p.outros_documentos ?? [],
      })),
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>
          Pacotes
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
          Um conjunto de procedimentos, iguais ou não, vendido por um preço só. {TEXTO_DA_VENDA_DO_PACOTE}
        </p>
      </div>
      <PacotesCatalogo
        pacotes={pacotes}
        procedimentos={linhas.map(p => ({ id: p.id, name: p.name, price: Number(p.price ?? 0) }))}
        documentos={documentos}
        podeEditar={podeEditar}
        podeComissao={podeComissao}
        buscaInicial={busca}
      />
    </div>
  )
}
