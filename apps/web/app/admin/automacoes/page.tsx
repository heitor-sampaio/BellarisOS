import { getTenantContext, assertPermission, can, temRecurso } from '@/lib/auth'
import { listarAutomacoes } from '@/actions/automacoes'
import { redeTemWhatsapp } from '@/lib/automacoes/canal-da-rede'
import { ListaDeAutomacoes } from '@/components/admin/automacoes/lista'
import { mexeNaConfigDaRede } from '@/lib/configuracao-da-rede'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'

/**
 * Automações — só no portal da REDE.
 *
 * O motor reage a fatos de todas as unidades, e uma versão por unidade
 * prometeria um recorte que ele não faz. Mesmo raciocínio de procedimentos e
 * integrações (CLAUDE.md §6).
 */
export default async function AutomacoesPage() {
  const ctx = await getTenantContext()
  // A page confere por si, mesmo com o layout já conferindo: o layout protege
  // a navegação, não a URL.
  assertPermission(ctx, 'automations', 'VIEW')

  const [{ automacoes, error }, whatsappConectado] = await Promise.all([
    listarAutomacoes(),
    redeTemWhatsapp(ctx.tenantId!),
  ])

  return (
    <>
      {/* A contagem de execuções muda sozinha enquanto a tela está aberta —
          é o sinal de que a automação está de fato rodando. */}
      <RealtimeRefresher tables={['automation_runs']} debounceMs={2000} />
      <ListaDeAutomacoes
        automacoes={automacoes}
        // Só a Admin da rede (18/11), e nunca na sessão de suporte (ela só pausa, no editor).
        podeEditar={can(ctx, 'automations', 'MANAGE') && mexeNaConfigDaRede(ctx) && !ctx.suporte}
        erro={error}
        whatsappConectado={whatsappConectado}
        veCampanhas={temRecurso(ctx, 'campanhas') && can(ctx, 'marketing', 'VIEW')}
      />
    </>
  )
}
