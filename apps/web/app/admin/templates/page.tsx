import { getTenantContext, assertPermission, can } from '@/lib/auth'
import { listTemplates, getTemplateSetup } from '@/actions/message-templates'
import { TemplatesManager } from '@/components/admin/templates-manager'

export default async function AdminTemplatesPage() {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'marketing', 'VIEW')

  const [templates, setup] = await Promise.all([listTemplates(), getTemplateSetup()])

  const aprovados = templates.filter(t => t.status === 'APPROVED').length
  const analise   = templates.filter(t => t.status === 'PENDING').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
          Templates
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
          Mensagens pré-aprovadas pela Meta para retomar conversa depois de 24 horas
          {templates.length > 0 && (
            <> · {aprovados} aprovado{aprovados !== 1 ? 's' : ''}
              {analise > 0 && <> · {analise} em análise</>}
            </>
          )}
        </p>
      </div>

      <TemplatesManager
        initial={templates}
        oficialAtivo={setup.oficialAtivo}
        temWaba={setup.temWaba}
        podeEditar={can(ctx, 'marketing', 'MANAGE')}
      />
    </div>
  )
}
