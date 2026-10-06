'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ativarAtendente, criarAtendente, redefinirVerificacao, reenviarConvite } from '@/actions/plataforma'

export interface PessoaDaPlataforma {
  id: string; nome: string; email: string; papel: 'SUPORTE' | 'ADMIN'; ativo: boolean; euMesmo: boolean
}

const PAPEL: Record<PessoaDaPlataforma['papel'], string> = { SUPORTE: 'Suporte', ADMIN: 'Admin da plataforma' }

export function EquipeDaPlataforma({ pessoas }: { pessoas: PessoaDaPlataforma[] }) {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<'SUPORTE' | 'ADMIN'>('SUPORTE')
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, startTransition] = useTransition()

  function rodar(fazer: () => Promise<{ ok: true; aviso?: string } | { ok: false; error: string }>, sucesso: string, depois?: () => void) {
    setAviso(null)
    startTransition(async () => {
      const r = await fazer()
      // Deu certo com ressalva (o e-mail que não saiu): a ressalva é o que se mostra.
      setAviso(r.ok ? (r.aviso ? { ok: false, texto: r.aviso } : { ok: true, texto: sucesso }) : { ok: false, texto: r.error })
      if (r.ok) { depois?.(); router.refresh() }
    })
  }

  return (
    <div className="suporte-pilha-larga">
      <form
        className="card suporte-secao suporte-form-linha"
        onSubmit={e => {
          e.preventDefault()
          rodar(() => criarAtendente({ nome, email, papel }), 'Cadastrado. O e-mail para definir a senha foi enviado.',
            () => { setNome(''); setEmail('') })
        }}
      >
        <label className="suporte-campo">
          <span className="field-label">Nome</span>
          <input className="field" value={nome} onChange={e => setNome(e.target.value)} required />
        </label>
        <label className="suporte-campo">
          <span className="field-label">E-mail</span>
          <input className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </label>
        <label className="suporte-campo">
          <span className="field-label">Papel</span>
          <select className="filtro-select" value={papel} onChange={e => setPapel(e.target.value as 'SUPORTE' | 'ADMIN')}>
            <option value="SUPORTE">Suporte</option>
            <option value="ADMIN">Admin da plataforma</option>
          </select>
        </label>
        <button type="submit" className="btn-primary" disabled={pendente}>Cadastrar</button>
      </form>

      {aviso && <p className={aviso.ok ? 'suporte-ok' : 'suporte-erro'} role="status">{aviso.texto}</p>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="cards-mobile suporte-tabela">
          <thead><tr><th>Pessoa</th><th>Papel</th><th>Situação</th><th></th></tr></thead>
          <tbody>
            {pessoas.map(p => (
              <tr key={p.id}>
                <td data-label="">
                  <span className="suporte-link-forte">{p.nome}</span>
                  <span className="suporte-texto-fraco"> · {p.email}{p.euMesmo ? ' · você' : ''}</span>
                </td>
                <td data-label="Papel" data-par>{PAPEL[p.papel]}</td>
                <td data-label="Situação" data-par>{p.ativo ? 'Ativo' : 'Desativado'}</td>
                <td data-label="">
                  <div className="suporte-acoes">
                    {!p.euMesmo && p.ativo && (
                      <button type="button" className="btn-ghost" disabled={pendente}
                        onClick={() => rodar(() => reenviarConvite(p.id), `Convite reenviado para ${p.email}.`)}>
                        Reenviar convite
                      </button>
                    )}
                    {!p.euMesmo && (
                      <button type="button" className="btn-ghost" disabled={pendente}
                        onClick={() => rodar(() => ativarAtendente(p.id, !p.ativo), p.ativo ? 'Desativado.' : 'Reativado.')}>
                        {p.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                    )}
                    <button type="button" className="btn-ghost" disabled={pendente}
                      onClick={() => rodar(() => redefinirVerificacao(p.id), 'Verificação redefinida: no próximo login, cadastra outro autenticador.')}>
                      Redefinir verificação
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
