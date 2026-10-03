'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import {
  autorizarSuporte, revogarAutorizacaoDeSuporte, oQueFoiFeitoNaSessao,
} from '@/actions/suporte-autorizacao'
import { HORAS_DE_AUTORIZACAO, HORAS_PADRAO, ROTULO_DAS_HORAS, type HorasDeAutorizacao } from '@/lib/suporte/regras'
import type { DadosDaAbaSuporte } from '@/lib/suporte/painel-da-clinica'

/**
 * Configurações → Suporte: a clínica decide se (e por quanto tempo) o suporte
 * do BellarisOS pode entrar na conta de alguém dela, e vê tudo o que ele fez.
 */
const quando = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

const FIM: Record<string, string> = {
  saiu: 'saiu', venceu: 'o prazo venceu', 'autorização revogada': 'autorização revogada',
}

export function SettingsSuporte({ dados, podeClinico }: { dados: DadosDaAbaSuporte; podeClinico: boolean }) {
  const router = useRouter()
  const [membro, setMembro] = useState(dados.membros[0]?.id ?? '')
  const [horas, setHoras] = useState<HorasDeAutorizacao>(HORAS_PADRAO)
  const [clinico, setClinico] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, startTransition] = useTransition()
  const [aberta, setAberta] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<Awaited<ReturnType<typeof oQueFoiFeitoNaSessao>> | null>(null)

  function rodar(fazer: () => Promise<{ ok: true } | { ok: false; error: string }>, sucesso: string) {
    setAviso(null)
    startTransition(async () => {
      const r = await fazer()
      setAviso(r.ok ? { ok: true, texto: sucesso } : { ok: false, texto: r.error })
      if (r.ok) router.refresh()
    })
  }

  function abrirDetalhe(id: string) {
    if (aberta === id) { setAberta(null); return }
    setAberta(id)
    setDetalhe(null)
    startTransition(async () => setDetalhe(await oQueFoiFeitoNaSessao(id)))
  }

  return (
    <div className="suporte-pilha-larga">
      <section className="card suporte-secao">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={16} style={{ color: 'var(--brand)' }} />
          <h3 className="suporte-subtitulo" style={{ margin: 0 }}>Autorizar o suporte do BellarisOS</h3>
        </div>
        <p className="suporte-sub">
          Sem autorização, o suporte não entra na conta de ninguém. Com ela, entra por até 60 minutos de cada vez, tudo
          fica registrado aqui, e o prontuário fica de fora — a não ser que você o inclua.
        </p>
        <form
          className="suporte-form-linha"
          onSubmit={e => {
            e.preventDefault()
            rodar(() => autorizarSuporte({ userId: membro, horas, incluiClinico: clinico }), 'Autorização registrada.')
          }}
        >
          <label className="suporte-campo">
            <span className="field-label">Conta</span>
            <select className="filtro-select" value={membro} onChange={e => setMembro(e.target.value)}>
              {dados.membros.map(m => (
                <option key={m.id} value={m.id}>{m.nome}{m.cargo ? ` · ${m.cargo}` : ''}{m.unidade ? ` · ${m.unidade}` : ''}</option>
              ))}
            </select>
          </label>
          <label className="suporte-campo">
            <span className="field-label">Por quanto tempo</span>
            <select className="filtro-select" value={horas} onChange={e => setHoras(Number(e.target.value) as HorasDeAutorizacao)}>
              {HORAS_DE_AUTORIZACAO.map(h => <option key={h} value={h}>{ROTULO_DAS_HORAS[h]}</option>)}
            </select>
          </label>
          {podeClinico && (
            <label className="suporte-campo" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={clinico} onChange={e => setClinico(e.target.checked)} />
              <span className="suporte-texto">Incluir dados clínicos (prontuário, fichas, fotos)</span>
            </label>
          )}
          <button type="submit" className="btn-primary" disabled={pendente || !membro}>Autorizar</button>
        </form>
        {aviso && <p className={aviso.ok ? 'suporte-ok' : 'suporte-erro'} role="status">{aviso.texto}</p>}
      </section>

      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <h3 className="overline suporte-secao-titulo">Autorizações vigentes</h3>
        {dados.autorizacoes.length === 0 ? <p className="suporte-vazio">Nenhuma. O suporte não pode entrar em conta nenhuma.</p> : (
          <table className="cards-mobile suporte-tabela">
            <thead><tr><th>Conta</th><th>Até</th><th>Prontuário</th><th>Por</th><th></th></tr></thead>
            <tbody>
              {dados.autorizacoes.map(a => (
                <tr key={a.id}>
                  <td data-label="">{a.membro}</td>
                  <td data-label="Até" data-par>{quando(a.expiraEm)}</td>
                  <td data-label="Prontuário" data-par>{a.clinico ? 'Incluído' : 'Fora'}</td>
                  <td data-label="Por" data-par>{a.por ?? '—'}{a.via === 'chamado' ? ' (chamado)' : ''}</td>
                  <td data-label="">
                    <button type="button" className="btn-ghost" disabled={pendente}
                      onClick={() => rodar(() => revogarAutorizacaoDeSuporte(a.id), 'Autorização revogada.')}>
                      Revogar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <h3 className="overline suporte-secao-titulo">Acessos do suporte</h3>
        {dados.sessoes.length === 0 ? <p className="suporte-vazio">O suporte ainda não entrou em nenhuma conta.</p> : (
          <ul className="suporte-lista" style={{ padding: '8px 16px 16px' }}>
            {dados.sessoes.map(s => (
              <li key={s.id} className="suporte-pilha" style={{ borderBottom: '1px solid var(--hairline)', paddingBottom: 8 }}>
                <div>
                  <strong>{s.atendente}</strong> entrou como <strong>{s.membro}</strong>
                  <span className="suporte-texto-fraco">
                    {' · '}{quando(s.inicio)}{s.fim ? ` até ${quando(s.fim)}` : ' · em curso'}
                    {s.motivoDoFim ? ` · ${FIM[s.motivoDoFim] ?? s.motivoDoFim}` : ''}
                    {' · '}{s.acessos} {s.acessos === 1 ? 'acesso' : 'acessos'}
                    {s.clinico ? ' · com prontuário' : ''}
                  </span>
                </div>
                <div className="suporte-texto-fraco">Motivo: {s.motivo}</div>
                <button type="button" className="btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => abrirDetalhe(s.id)}>
                  {aberta === s.id ? 'Esconder o que foi feito' : 'O que foi feito'}
                </button>
                {aberta === s.id && (
                  !detalhe ? <p className="suporte-texto-fraco">Carregando…</p>
                  : !detalhe.ok ? <p className="suporte-erro">{detalhe.error}</p>
                  : (
                    <div className="suporte-grade">
                      <div>
                        <h4 className="overline">Telas e ações</h4>
                        <ul className="suporte-lista suporte-lista-densa">
                          {detalhe.acessos.map((a, i) => (
                            <li key={i}><code>{a.method}</code> {a.path}{a.acao ? ' · ação' : ''} <span className="suporte-texto-fraco">{quando(a.at)}</span></li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="overline">Fatos registrados</h4>
                        {detalhe.eventos.length === 0 ? <p className="suporte-texto-fraco">Nenhum.</p> : (
                          <ul className="suporte-lista suporte-lista-densa">
                            {detalhe.eventos.map((e, i) => <li key={i}><code>{e.nome}</code> <span className="suporte-texto-fraco">{quando(e.em)}</span></li>)}
                          </ul>
                        )}
                      </div>
                    </div>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <h3 className="overline suporte-secao-titulo">O que a plataforma fez na sua rede</h3>
        {dados.registros.length === 0 ? <p className="suporte-vazio">Nada registrado.</p> : (
          <ul className="suporte-lista" style={{ padding: '8px 16px 16px' }}>
            {dados.registros.map(r => (
              <li key={r.id}>{r.oQue} <span className="suporte-texto-fraco">· {r.quem} · {quando(r.em)}</span></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
