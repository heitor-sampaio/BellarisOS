'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { salvarPlano } from '@/actions/sistema'
import { centavosDe, campoDeReais, reaisDe } from '@/lib/redes/valor'

interface Plano { id: string; nome: string; descricao: string | null; valorCentavos: number; ativo: boolean; ordem: number; redes: number }

/** O catálogo: a lista e o formulário (novo ou editar). */
export function PlanosDoCatalogo({ planos }: { planos: Plano[] }) {
  const router = useRouter()
  const [editando, setEditando] = useState<Plano | null>(null)
  const [chave, setChave] = useState(0)
  const [pendente, iniciar] = useTransition()

  function salvar(form: FormData) {
    const centavos = centavosDe(String(form.get('valor') ?? ''))
    if (centavos == null) { toast.error('Valor inválido.'); return }
    iniciar(async () => {
      const r = await salvarPlano({
        id: editando?.id ?? null, nome: String(form.get('nome') ?? ''), descricao: String(form.get('descricao') ?? '') || null,
        valorCentavos: centavos, ativo: form.get('ativo') === 'on', ordem: Number(form.get('ordem') ?? 0),
      })
      if (!r.ok) { toast.error(r.error); return }
      toast.success(editando ? 'Plano salvo.' : 'Plano criado.')
      setEditando(null); setChave(k => k + 1)
      router.refresh()
    })
  }

  return (
    <div className="suporte-pilha-larga">
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {planos.length === 0 ? <p className="suporte-vazio">Nenhum plano ainda. Cadastre o primeiro abaixo.</p> : (
          <table className="cards-mobile suporte-tabela">
            <thead><tr><th>Plano</th><th>Valor mensal</th><th>Redes</th><th>Situação</th><th></th></tr></thead>
            <tbody>
              {planos.map(p => (
                <tr key={p.id}>
                  <td data-label=""><span className="suporte-link-forte">{p.nome}</span>{p.descricao && <span className="suporte-texto-fraco"> · {p.descricao}</span>}</td>
                  <td data-label="Valor mensal" data-par>{reaisDe(p.valorCentavos)}</td>
                  <td data-label="Redes" data-par>{p.redes}</td>
                  <td data-label="Situação" data-par>{p.ativo ? 'À venda' : 'Desativado'}</td>
                  <td data-label=""><button type="button" className="btn-ghost" onClick={() => { setEditando(p); setChave(k => k + 1) }}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <form key={chave} action={salvar} className="card suporte-secao">
        <h2 className="overline">{editando ? `Editar ${editando.nome}` : 'Novo plano'}</h2>
        <div className="sistema-form">
          <label className="suporte-campo"><span className="field-label">Nome</span>
            <input className="field" name="nome" required minLength={2} maxLength={60} defaultValue={editando?.nome ?? ''} />
          </label>
          <label className="suporte-campo"><span className="field-label">Valor mensal (R$)</span>
            <input className="field" name="valor" required inputMode="decimal" defaultValue={editando ? campoDeReais(editando.valorCentavos) : ''} placeholder="199,90" />
          </label>
          <label className="suporte-campo"><span className="field-label">Ordem na lista</span>
            <input className="field" name="ordem" type="number" defaultValue={editando?.ordem ?? 0} />
          </label>
          <label className="suporte-campo sistema-form-cheio"><span className="field-label">O que inclui</span>
            <input className="field" name="descricao" maxLength={500} defaultValue={editando?.descricao ?? ''} placeholder="Ex.: 1 unidade, equipe ilimitada, WhatsApp oficial" />
          </label>
          <label className="ajuda-check"><input type="checkbox" name="ativo" defaultChecked={editando ? editando.ativo : true} /> <span>À venda</span></label>
        </div>
        <p className="suporte-texto-fraco">Mudar o valor aqui não muda o que as redes já combinaram — vale para as próximas.</p>
        <div className="sistema-acoes">
          <button type="submit" className="btn-primary" disabled={pendente}>{pendente ? 'Salvando…' : editando ? 'Salvar plano' : 'Criar plano'}</button>
          {editando && <button type="button" className="btn-ghost" onClick={() => { setEditando(null); setChave(k => k + 1) }}>Cancelar</button>}
        </div>
      </form>
    </div>
  )
}
