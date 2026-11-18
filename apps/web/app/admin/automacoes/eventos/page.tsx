import { getTenantContext, assertPermission } from '@/lib/auth'
import { listarEventosDeDominio, resumoDoCatalogo } from '@/actions/eventos'
import { SettingsEventos } from '@/components/admin/settings-eventos'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { VistasDasAutomacoes } from '@/components/admin/automacoes/vistas'
import { Dica } from '@/components/shared/dica'

/**
 * "O que já aconteceu" (CF2, docs/revisao.md — o Heitor, 2026-11-13:
 * "Concordo"): a corrente de fatos do sistema (agendou, pagou, faltou…) que
 * dispara as automações. Era a aba Eventos de Configurações; mora aqui, ao
 * lado da lista das automações, e pede o módulo DELAS — quem confere se um
 * gatilho dispara é quem cuida das automações. O caminho antigo
 * (`/admin/settings?tab=eventos`) leva para cá.
 */
export default async function EventosDasAutomacoesPage() {
  const ctx = await getTenantContext()
  // A page confere por si: o layout protege a navegação, não a URL.
  assertPermission(ctx, 'automations', 'VIEW')

  const [resumo, primeiraPagina] = await Promise.all([resumoDoCatalogo(), listarEventosDeDominio()])

  return (
    <div>
      <VistasDasAutomacoes ativa="eventos" />
      {/* A apresentação mora na dica (2026-11-16). */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
        <h1 style={{
          fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
          letterSpacing: 'var(--tracking-tight)', color: 'var(--text)',
        }}>
          O que já aconteceu
        </h1>
        <Dica rotulo="Sobre o que já aconteceu">
          Os fatos que o sistema registrou — agendou, pagou, faltou — e quantas vezes cada um aconteceu.
          É deles que as automações partem.
        </Dica>
      </div>
      {/* A corrente cresce enquanto a tela está aberta — quem veio conferir se
          um gatilho dispara quer ver o fato chegando, não recarregar. Assina o
          SINAL da rede, não `domain_events` (o websocket entregava a linha
          inteira, com o texto da mensagem recebida — AUT-01, 18/11). */}
      <RealtimeRefresher tables={['automacoes_sinais']} filter={`tenant_id=eq.${ctx.tenantId}`} debounceMs={1500} />
      <SettingsEventos
        linhasIniciais={resumo.linhas}
        eventosIniciais={primeiraPagina.eventos}
        fimInicial={primeiraPagina.fim}
        desdeQuando={resumo.desdeQuando}
        erro={resumo.error ?? primeiraPagina.error}
      />
    </div>
  )
}
