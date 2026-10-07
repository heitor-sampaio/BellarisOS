'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { editarRede } from '@/actions/sistema'

/** Nome, CPF/CNPJ, e-mail e telefone da rede (o slug fica). */
export function DadosDaRede({ tenantId, inicial, onSalvo }: {
  tenantId: string; inicial: { nome: string; documento: string; email: string; telefone: string }
  /** Salvou: quem abriu (o modal do bloco) fecha. */
  onSalvo?: () => void
}) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function salvar(form: FormData) {
    setErro(null)
    iniciar(async () => {
      const r = await editarRede(tenantId, {
        nome: String(form.get('nome') ?? ''), documento: String(form.get('documento') ?? ''),
        email: String(form.get('email') ?? ''), telefone: String(form.get('telefone') ?? '') || null,
      })
      if (!r.ok) { setErro(r.error); return }
      toast.success('Dados da rede salvos.')
      onSalvo?.()
      router.refresh()
    })
  }

  return (
    <form action={salvar} className="suporte-secao">
      <div className="sistema-form">
        <label className="suporte-campo"><span className="field-label">Nome</span>
          <input className="field" name="nome" defaultValue={inicial.nome} required minLength={2} maxLength={100} />
        </label>
        <label className="suporte-campo"><span className="field-label">CPF ou CNPJ</span>
          <input className="field" name="documento" defaultValue={inicial.documento} inputMode="numeric" />
        </label>
        <label className="suporte-campo"><span className="field-label">E-mail</span>
          <input className="field" name="email" type="email" defaultValue={inicial.email} required />
        </label>
        <label className="suporte-campo"><span className="field-label">Telefone</span>
          <input className="field" name="telefone" defaultValue={inicial.telefone} inputMode="tel" />
        </label>
      </div>
      {erro && <p className="suporte-erro" role="alert">{erro}</p>}
      <div className="sistema-acoes">
        <button type="submit" className="btn-secondary" disabled={pendente}>{pendente ? 'Salvando…' : 'Salvar dados'}</button>
      </div>
    </form>
  )
}
