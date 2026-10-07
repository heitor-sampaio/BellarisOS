import { getPlatformContext } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { createAdminClient } from '@estetica-os/nucleo/lib/supabase/admin'
import { ler } from '@estetica-os/nucleo/lib/db'
import { configDoAsaas } from '@/lib/asaas/cliente'
import { ConfiguracoesDaPlataforma } from '@/components/sistema/configuracoes-da-plataforma'
import { urlDoHost } from '@estetica-os/nucleo/lib/plataforma/destino'

/**
 * As regras do negócio (dias de teste, carência), a verificação em duas etapas
 * da equipe (opção, 2026-10-06) e o estado da integração com
 * o Asaas — sem a chave: só se ela existe, o ambiente e o último webhook.
 */
const quando = (iso: string | null | undefined) => iso
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
  : 'nunca'

export default async function ConfiguracoesDoSistemaPage() {
  const ctx = await getPlatformContext({ verSistema: true })
  const admin = createAdminClient()
  const [cfg, ultimo] = await Promise.all([
    ler(admin.from('platform_settings').select('dias_de_teste, dias_de_carencia, exigir_verificacao').eq('id', 1).maybeSingle(), 'ler as configurações'),
    ler(admin.from('asaas_events').select('recebido_em, evento').order('recebido_em', { ascending: false }).limit(1).maybeSingle(), 'ler o último webhook'),
  ])
  const asaas = configDoAsaas()
  const c = (cfg ?? { dias_de_teste: 14, dias_de_carencia: 7, exigir_verificacao: false }) as { dias_de_teste: number; dias_de_carencia: number; exigir_verificacao: boolean }
  const u = ultimo as { recebido_em: string; evento: string } | null

  return (
    <div className="suporte-pilha-larga">
      <div className="suporte-cabecalho">
        <div>
          <h1 className="suporte-titulo">Configurações</h1>
          <p className="suporte-sub">As regras da assinatura, o acesso da equipe e a integração com o Asaas.</p>
        </div>
      </div>
      <section className="card suporte-secao">
        <h2 className="overline">Regras da plataforma</h2>
        <fieldset className="sistema-leitura" disabled={!ctx.podeEditar}>
          <ConfiguracoesDaPlataforma diasDeTeste={c.dias_de_teste} diasDeCarencia={c.dias_de_carencia} exigirVerificacao={c.exigir_verificacao} />
        </fieldset>
      </section>
      <section className="card suporte-secao">
        <h2 className="overline">Integração com o Asaas</h2>
        <ul className="suporte-lista">
          <li>Ambiente: <strong>{asaas.ambiente === 'producao' ? 'Produção' : 'Sandbox (teste)'}</strong></li>
          <li>Chave de API (<code>ASAAS_API_KEY</code>): <span className={asaas.temChave ? 'suporte-ok' : 'suporte-alerta'}>{asaas.temChave ? 'configurada' : 'faltando'}</span></li>
          <li>Token do webhook (<code>ASAAS_WEBHOOK_TOKEN</code>, 32+ caracteres): <span className={asaas.temTokenDoWebhook ? 'suporte-ok' : 'suporte-alerta'}>{asaas.temTokenDoWebhook ? 'configurado' : 'faltando'}</span></li>
          <li>Último webhook recebido: {u ? <>{quando(u.recebido_em)} <span className="suporte-texto-fraco">· {u.evento}</span></> : 'nunca'}</li>
        </ul>
        <p className="suporte-texto-fraco">
          No painel do Asaas, o webhook vai para <code>{urlDoHost('sistema')}/api/webhooks/asaas</code>, com envio sequencial,
          os eventos de cobrança e de assinatura, e o mesmo token de <code>ASAAS_WEBHOOK_TOKEN</code>.
        </p>
      </section>
    </div>
  )
}
