import { getPlatformContext } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { createAdminClient } from '@estetica-os/nucleo/lib/supabase/admin'
import { ler } from '@estetica-os/nucleo/lib/db'
import { EquipeDaPlataforma, type PessoaDaPlataforma } from '@/components/suporte/equipe-da-plataforma'

/**
 * Quem atende pela plataforma. Só admin: cadastrar, desativar e redefinir a
 * verificação em duas etapas de quem perdeu o celular.
 */
export default async function EquipePage() {
  const ctx = await getPlatformContext({ papel: 'ADMIN' })
  const pessoas = (await ler(createAdminClient().from('platform_staff')
    .select('id, name, email, papel, is_active, created_at')
    .order('name'), 'carregar a equipe da plataforma') ?? []) as {
      id: string; name: string; email: string; papel: 'SUPORTE' | 'ADMIN'; is_active: boolean; created_at: string
    }[]

  const lista: PessoaDaPlataforma[] = pessoas
    // As pessoas de teste ([e2e]) não poluem a lista de quem trabalha aqui.
    .filter(p => !p.name.startsWith('[e2e]') || p.id === ctx.staffId)
    .map(p => ({ id: p.id, nome: p.name, email: p.email, papel: p.papel, ativo: p.is_active, euMesmo: p.id === ctx.staffId }))

  return (
    <div className="suporte-pilha-larga">
      <div className="suporte-cabecalho">
        <div>
          <h1 className="suporte-titulo">Equipe da plataforma</h1>
          <p className="suporte-sub">Quem atende as clínicas. Todos entram com verificação em duas etapas.</p>
        </div>
      </div>
      <EquipeDaPlataforma pessoas={lista} />
    </div>
  )
}
