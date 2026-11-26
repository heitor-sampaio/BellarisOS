import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { paraAnamneseGeral } from '@/lib/anamnese-geral'
import { modoDaFichaPeloLink } from '@/lib/pre-atendimento/modo-da-ficha'
import { preAtendimentoPendente } from '@/lib/pre-atendimento/ficha'
import { PreAtendimentoDaCliente } from '@/components/client-portal/pre-atendimento'
import { Dica } from '@/components/shared/dica'

/**
 * O pré-atendimento da cliente (2026-10-20): a ficha que a clínica mandou ao
 * agendar. Só o DELA (ctx.clientId, a ficha da clínica do endereço).
 */
export default async function PreAtendimentoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await getTenantContext()
  assertClient(ctx)
  const admin = createAdminClient()
  const pendente = await preAtendimentoPendente(admin, ctx.clientId!)
  const voltar = `/${slug}/cliente/home`

  if (!pendente) {
    return (
      <div className="card pre-atendimento-cliente-fim">
        <CheckCircle2 size={28} color="var(--success)" aria-hidden="true" />
        {/* O vazio fica à vista; o "quando aparece" mora na dica (docs/regras/design.md). */}
        <p className="pre-atendimento-cliente-titulo" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Nada para responder agora</span>
          <Dica rotulo="Quando a ficha aparece aqui">
            Quando a equipe precisar de alguma informação antes do seu horário, ela aparece aqui.
          </Dica>
        </p>
        <Link href={voltar} className="btn-secondary">Voltar ao início</Link>
      </div>
    )
  }

  const registro = await ler(admin.from('medical_records').select('general_anamnesis')
    .eq('client_id', ctx.clientId!).maybeSingle(), 'buscar a ficha de saúde')
  const atual = paraAnamneseGeral(registro?.general_anamnesis ?? null, pendente.ficha)

  return (
    <PreAtendimentoDaCliente
      // A regra do link (FI-13; o arremate da 33ª): sem resposta anterior, a ficha
      // inteira; a que a EQUIPE preencheu, a cliente confere ("Está tudo certo" ou
      // "Corrigir respostas"); a que ela mesma respondeu, "algo mudou?".
      modo={modoDaFichaPeloLink({ conferir: false, modoDoPendente: pendente.modo, atual })}
      ficha={pendente.ficha}
      respostasAnteriores={atual?.respostas ?? {}}
      voltar={voltar}
    />
  )
}
