import Link from 'next/link'
import { getPlatformContext } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { createAdminClient } from '@estetica-os/nucleo/lib/supabase/admin'
import { ler } from '@estetica-os/nucleo/lib/db'
import { FormularioNovaRede } from '@/components/sistema/formulario-nova-rede'
import { Dica } from '@estetica-os/nucleo/components/dica'

/**
 * Cadastrar uma clínica pelo admin: a rede nasce pelo mesmo caminho do
 * cadastro público, o responsável recebe o e-mail para definir a senha e
 * monta a unidade no primeiro acesso (`/setup`).
 */
export default async function NovaRedePage() {
  await getPlatformContext({ papel: 'ADMIN' })
  const admin = createAdminClient()
  const [planos, cfg] = await Promise.all([
    ler(admin.from('platform_plans').select('id, nome, valor_centavos').eq('ativo', true).order('ordem').order('nome'), 'carregar os planos'),
    ler(admin.from('platform_settings').select('dias_de_teste').eq('id', 1).maybeSingle(), 'ler as configurações'),
  ])
  return (
    <div className="suporte-pilha-larga">
      <div className="suporte-cabecalho">
        <div>
          <Link href="/redes" className="suporte-voltar">← Redes</Link>
          {/* A apresentação mora na dica (2026-11-16); fora do h1, o título não muda de nome. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <h1 className="suporte-titulo">Nova rede</h1>
            <Dica rotulo="Sobre a nova rede">O responsável recebe um e-mail para definir a senha e configura a unidade no primeiro acesso.</Dica>
          </div>
        </div>
      </div>
      <FormularioNovaRede
        planos={((planos ?? []) as { id: string; nome: string; valor_centavos: number }[]).map(p => ({ id: p.id, nome: p.nome, valorCentavos: p.valor_centavos }))}
        diasDeTeste={(cfg as { dias_de_teste: number } | null)?.dias_de_teste ?? 14}
      />
    </div>
  )
}
