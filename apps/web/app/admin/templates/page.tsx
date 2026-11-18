import { getTenantContext, assertPermission, can, assertRecurso } from '@/lib/auth'
import { listTemplates, getTemplateSetup } from '@/actions/message-templates'
import { TemplatesManager } from '@/components/admin/templates-manager'
import { Dica } from '@/components/shared/dica'
import { CONFIG_DA_REDE, mexeNaConfigDaRede } from '@/lib/configuracao-da-rede'

export default async function AdminTemplatesPage() {
  const ctx = await getTenantContext()
  // A funcionalidade é do PLANO da rede (lib/planos/recursos.ts).
  assertRecurso(ctx, 'templates')
  assertPermission(ctx, 'marketing', 'VIEW')

  const [templates, setup] = await Promise.all([listTemplates(), getTemplateSetup()])

  // Os templates são configuração da rede toda: só a Admin da rede cria, envia e apaga (o Heitor, 18/11;
  // as actions já recusam). A-CONF3 da 25ª: a tela mostrava os botões a quem só via a recusa.
  const gerencia = can(ctx, 'marketing', 'MANAGE')
  const avisoDaRede = gerencia && !mexeNaConfigDaRede(ctx) ? CONFIG_DA_REDE : null

  const aprovados = templates.filter(t => t.status === 'APPROVED').length
  const analise   = templates.filter(t => t.status === 'PENDING').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        {/* A apresentação mora na dica (2026-11-16); a contagem fica à vista. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Templates
          </h1>
          <Dica rotulo="Sobre os templates">
            Mensagens pré-aprovadas pela Meta para retomar conversa depois de 24 horas
          </Dica>
        </div>
        {templates.length > 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            {aprovados} aprovado{aprovados !== 1 ? 's' : ''}
            {analise > 0 && <> · {analise} em análise</>}
          </p>
        )}
        {avisoDaRede && (
          <p data-config-da-rede style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>{avisoDaRede}</p>
        )}
      </div>

      <TemplatesManager
        initial={templates}
        numeros={setup.numeros}
        podeEditar={gerencia && mexeNaConfigDaRede(ctx)}
      />
    </div>
  )
}
