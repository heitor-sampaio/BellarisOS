'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, X } from 'lucide-react'
import { JanelaModal } from '@estetica-os/nucleo/components/shared/janela-modal'
import { ativarAtendente, criarAtendente, redefinirVerificacao, reenviarConvite } from '@/actions/plataforma'
import type { PapelDaPlataforma } from '@estetica-os/nucleo/lib/plataforma/contexto'

export interface PessoaDaPlataforma {
  id: string; nome: string; email: string; papel: PapelDaPlataforma; ativo: boolean; euMesmo: boolean
}

const PAPEL: Record<PessoaDaPlataforma['papel'], string> = { SUPORTE: 'Suporte', ADMIN: 'Admin da plataforma', GERENTE: 'Gerente (só vê o sistema)' }

/**
 * A equipe da plataforma: a lista, e "Adicionar pessoa" num modal (2026-10-07:
 * o formulário solto na página ocupava um card enorme, alinhado à direita).
 */
export function EquipeDaPlataforma({ pessoas }: { pessoas: PessoaDaPlataforma[] }) {
  const router = useRouter()
  const [adicionando, setAdicionando] = useState(false)
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
      <div className="sistema-acoes">
        <button type="button" className="btn-primary" disabled={pendente} onClick={() => { setAviso(null); setAdicionando(true) }}>
          <UserPlus size={15} aria-hidden /> Adicionar pessoa
        </button>
      </div>
      {adicionando && (
        <NovaPessoa
          onFechar={() => setAdicionando(false)}
          onCadastrada={(texto, ok) => { setAdicionando(false); setAviso({ ok, texto }); router.refresh() }}
        />
      )}

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

/** O cadastro, no modal: nome, e-mail e papel. O erro fica no modal; o sucesso fecha e avisa na página. */
function NovaPessoa({ onFechar, onCadastrada }: {
  onFechar: () => void
  onCadastrada: (texto: string, ok: boolean) => void
}) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<PapelDaPlataforma>('SUPORTE')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  return (
    <JanelaModal onFechar={onFechar} rotulo="Adicionar pessoa à equipe" largura={460} travado={pendente} fechaNoFundo={false}>
      <form
        className="sistema-janela"
        onSubmit={e => {
          e.preventDefault()
          setErro(null)
          iniciar(async () => {
            const r = await criarAtendente({ nome, email, papel })
            if (!r.ok) { setErro(r.error); return }
            // Deu certo com ressalva (o e-mail que não saiu): a ressalva é o que se mostra.
            onCadastrada(r.aviso ?? 'Cadastrado. O e-mail para definir a senha foi enviado.', !r.aviso)
          })
        }}
      >
        <div className="sistema-janela-topo">
          <h2>Adicionar pessoa à equipe</h2>
          <button type="button" className="btn-ghost" onClick={onFechar} disabled={pendente} aria-label="Fechar"><X size={15} /></button>
        </div>
        <label className="suporte-campo">
          <span className="field-label">Nome</span>
          <input className="field" value={nome} onChange={e => setNome(e.target.value)} required autoFocus />
        </label>
        <label className="suporte-campo">
          <span className="field-label">E-mail</span>
          <input className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </label>
        <label className="suporte-campo">
          <span className="field-label">Papel</span>
          <select className="filtro-select" value={papel} onChange={e => setPapel(e.target.value as PapelDaPlataforma)}>
            <option value="SUPORTE">{PAPEL.SUPORTE}</option>
            <option value="GERENTE">{PAPEL.GERENTE}</option>
            <option value="ADMIN">{PAPEL.ADMIN}</option>
          </select>
        </label>
        <p className="suporte-texto-fraco">A pessoa recebe por e-mail o link para definir a senha.</p>
        {erro && <p className="suporte-erro" role="alert">{erro}</p>}
        <div className="sistema-janela-acoes">
          <button type="button" className="btn-ghost" onClick={onFechar} disabled={pendente}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={pendente}>{pendente ? 'Cadastrando…' : 'Cadastrar'}</button>
        </div>
      </form>
    </JanelaModal>
  )
}
