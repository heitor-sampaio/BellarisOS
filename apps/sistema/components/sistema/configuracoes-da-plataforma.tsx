'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { salvarConfiguracoes } from '@/actions/sistema'

/**
 * Dias de teste (de quem se cadastra), de carência (atraso até suspender) e se
 * a equipe da plataforma é obrigada à verificação em duas etapas.
 */
export function ConfiguracoesDaPlataforma({ diasDeTeste, diasDeCarencia, exigirVerificacao }: { diasDeTeste: number; diasDeCarencia: number; exigirVerificacao: boolean }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  function salvar(form: FormData) {
    iniciar(async () => {
      const r = await salvarConfiguracoes({
        diasDeTeste: Number(form.get('teste')), diasDeCarencia: Number(form.get('carencia')),
        exigirVerificacao: form.get('verificacao') === 'on',
      })
      if (!r.ok) { toast.error(r.error); return }
      toast.success('Configurações salvas.')
      router.refresh()
    })
  }
  return (
    <form action={salvar} className="suporte-secao">
      <div className="sistema-form">
        <label className="suporte-campo"><span className="field-label">Dias de teste para quem se cadastra</span>
          <input className="field" name="teste" type="number" min={0} max={90} defaultValue={diasDeTeste} required />
        </label>
        <label className="suporte-campo"><span className="field-label">Dias de carência (atraso até suspender)</span>
          <input className="field" name="carencia" type="number" min={0} max={60} defaultValue={diasDeCarencia} required />
        </label>
      </div>
      <p className="suporte-texto-fraco">Em atraso, a clínica vê o aviso e a fatura; passada a carência, o acesso é suspenso sozinho, e volta sozinho quando ela paga.</p>
      <label className="ajuda-check">
        <input type="checkbox" name="verificacao" defaultChecked={exigirVerificacao} />
        <span>Exigir a verificação em duas etapas de toda a equipe</span>
      </label>
      <p className="suporte-texto-fraco">Ligada, quem é da plataforma só entra com a senha e o código do aplicativo autenticador (quem não tem cadastra no próximo acesso). Desligada, entra só com a senha — menos quem cadastrou um autenticador, que continua sendo pedido o código.</p>
      <div className="sistema-acoes">
        <button type="submit" className="btn-primary" disabled={pendente}>{pendente ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </form>
  )
}
