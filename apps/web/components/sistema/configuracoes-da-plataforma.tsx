'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { salvarConfiguracoes } from '@/actions/sistema'

/** Dias de teste (de quem se cadastra) e de carência (atraso até suspender). */
export function ConfiguracoesDaPlataforma({ diasDeTeste, diasDeCarencia }: { diasDeTeste: number; diasDeCarencia: number }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  function salvar(form: FormData) {
    iniciar(async () => {
      const r = await salvarConfiguracoes({ diasDeTeste: Number(form.get('teste')), diasDeCarencia: Number(form.get('carencia')) })
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
      <div className="sistema-acoes">
        <button type="submit" className="btn-primary" disabled={pendente}>{pendente ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </form>
  )
}
