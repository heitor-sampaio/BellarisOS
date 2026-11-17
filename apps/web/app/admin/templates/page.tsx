import { getTenantContext, assertPermission, can, assertRecurso } from '@/lib/auth'
import { listTemplates, getTemplateSetup } from '@/actions/message-templates'
import { TemplatesManager } from '@/components/admin/templates-manager'
import { Dica } from '@/components/shared/dica'

export default async function AdminTemplatesPage() {
  const ctx = await getTenantContext()
  // A funcionalidade é do PLANO da rede (lib/planos/recursos.ts).
  assertRecurso(ctx, 'templates')
  assertPermission(ctx, 'marketing', 'VIEW')

  const [templates, setup] = await Promise.all([listTemplates(), getTemplateSetup()])

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
      </div>

      <TemplatesManager
        initial={templates}
        numeros={setup.numeros}
        podeEditar={can(ctx, 'marketing', 'MANAGE')}
      />
    </div>
  )
}
