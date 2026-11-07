import { getTenantContext, temRecurso, can } from '@/lib/auth'
import { listarMapasDeInjetaveis } from '@/actions/injectable-map'
import { ListaDetalhe } from '@/components/shared/lista-detalhe'
import { InjetaveisLista } from '@/components/branch/injetaveis-lista'

/**
 * Injetáveis — a mesma tela nos dois portais, lista + detalhe.
 *
 * É layout, não página: a lista fica montada enquanto se navega entre os
 * planejamentos, e `ListaDetalhe` esconde uma das duas colunas no celular. Com
 * o detalhe empilhado abaixo da lista, abrir um planejamento jogava o mapa
 * várias telas para baixo e parecia que nada tinha acontecido.
 *
 * `branchId` nulo = rede inteira.
 */
export async function ListaDeInjetaveis({
  branchId, basePath, children,
}: {
  branchId: string | null
  /** Rota da lista sem detalhe — `/admin/injetaveis` ou `/<slug>/injetaveis`. */
  basePath: string
  children: React.ReactNode
}) {
  const ctx = await getTenantContext()
  // Sem o prontuário (ou sem o recurso no plano), o layout NÃO lança: só passa
  // a página, que trava por si (`assertPermission`/`assertRecurso` em cada
  // `page.tsx`, CLAUDE.md §6) DENTRO do Suspense do `loading.tsx` — e a tela
  // de sem acesso sai com 200, como em toda tela negada. Lançado aqui, fora do
  // Suspense, o `semAcesso()` subia ao portal como HTTP 500 (D17 da 9ª).
  if (!can(ctx, 'medical_records', 'VIEW') || !temRecurso(ctx, 'injetaveis')) return <>{children}</>

  const { mapas, error } = await listarMapasDeInjetaveis({ branchId })

  // Consulta que falhou não é "a clínica não tem planejamento": sem checar, a
  // tela convidaria a recomeçar um que já existe.
  if (error) {
    console.error('[injetaveis]', error)
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)' }}>
        Não foi possível carregar os planejamentos agora. Tente recarregar em instantes.
      </div>
    )
  }

  return (
    <ListaDetalhe
      basePath={basePath}
      lista={
        <InjetaveisLista
          mapas={mapas}
          basePath={basePath}
          branchId={branchId ?? ''}
          podeEditar={can(ctx, 'medical_records', 'MANAGE')}
        />
      }
    >
      {children}
    </ListaDetalhe>
  )
}
