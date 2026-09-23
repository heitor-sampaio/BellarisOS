import { getTenantContext, assertPermission, can } from '@/lib/auth'
import { listarAutomacoes } from '@/actions/automacoes'
import { ListaDeAutomacoes } from '@/components/admin/automacoes/lista'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'

/**
 * Automações — só no portal da REDE.
 *
 * O motor reage a fatos de todas as unidades, e uma versão por filial
 * prometeria um recorte que ele não faz. Mesmo raciocínio de procedimentos e
 * integrações (CLAUDE.md §6).
 */
export default async function AutomacoesPage() {
  const ctx = await getTenantContext()
  // A page confere por si, mesmo com o layout já conferindo: o layout protege
  // a navegação, não a URL.
  assertPermission(ctx, 'automations', 'VIEW')

  const { automacoes, error } = await listarAutomacoes()

  return (
    <>
      {/* A contagem de execuções muda sozinha enquanto a tela está aberta —
          é o sinal de que a automação está de fato rodando. */}
      <RealtimeRefresher tables={['automation_runs']} debounceMs={2000} />
      <ListaDeAutomacoes
        automacoes={automacoes}
        podeEditar={can(ctx, 'automations', 'MANAGE')}
        erro={error}
      />
    </>
  )
}
