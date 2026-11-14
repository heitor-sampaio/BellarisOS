'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquarePlus, Loader2, History } from 'lucide-react'
import type { AnotacaoDoAtendimento, VersaoDoRegistro } from '@/lib/prontuario/anotacoes-e-versoes'
import { acrescentarAnotacao } from '@/actions/prontuario'
import { AnamnesisFormRenderer, type AnamnesisAnswers } from '@/components/branch/anamnesis-form-renderer'
import { formatarNoFuso } from '@/lib/formatar-no-fuso'
import { useFuso } from '@/components/shared/fuso'

const overline: React.CSSProperties = {
  fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.06em',
}

/**
 * As anotações DEPOIS do atendimento concluído (bloco Prontuário, PR2a — a
 * revisão do Heitor, 2026-11-13). "A cliente ligou três dias depois com
 * vermelhidão" vira um texto datado, com quem escreveu, que não se edita nem
 * se apaga — não há botão para isso, e o banco recusa. Aparecem no
 * atendimento e na aba Prontuário, na ordem do tempo.
 */
export function AnotacoesDoAtendimento({ appointmentId, anotacoes, podeAnotar }: {
  appointmentId: string
  anotacoes:     AnotacaoDoAtendimento[]
  /** O Prontuário em Gerenciar, com o alcance de hoje (a action confere de novo). */
  podeAnotar:    boolean
}) {
  const fuso = useFuso()
  const router = useRouter()
  const [escrevendo, setEscrevendo] = useState(false)
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const idDoCampo = `anotacao-${appointmentId}`

  if (anotacoes.length === 0 && !podeAnotar) return null

  async function salvar() {
    setSalvando(true); setErro(null)
    const r = await acrescentarAnotacao(appointmentId, texto)
    setSalvando(false)
    if (r.error) { setErro(r.error); return }
    setTexto(''); setEscrevendo(false)
    router.refresh()
  }

  return (
    <div data-anotacoes-do-atendimento style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <p style={{ ...overline, flex: 1 }}>Anotações depois do atendimento</p>
        {podeAnotar && !escrevendo && (
          <button type="button" onClick={() => setEscrevendo(true)} className="btn-secondary" style={{ gap: 6, fontSize: 'var(--text-sm-sz)' }}>
            <MessageSquarePlus size={13} aria-hidden="true" /> Acrescentar anotação
          </button>
        )}
      </div>

      {anotacoes.length === 0 && !escrevendo && (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>
          O que acontecer depois (um retorno, uma ligação da cliente) entra aqui, com a data e quem escreveu. A anotação não se edita nem se apaga.
        </p>
      )}

      {anotacoes.length > 0 && (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {anotacoes.map(a => (
            <li key={a.id} data-anotacao={a.id} style={{ padding: '10px 14px', borderRadius: 'var(--radius-field-token)', border: '1px solid var(--hairline)', background: 'var(--bg-app)' }}>
              <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{a.texto}</p>
              <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 4 }}>
                {a.autorNome} · {formatarNoFuso(a.criadaEm, "dd/MM/yyyy 'às' HH:mm", fuso)}
              </p>
            </li>
          ))}
        </ol>
      )}

      {escrevendo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label htmlFor={idDoCampo} className="field-label">Anotação</label>
          <textarea id={idDoCampo} value={texto} onChange={e => setTexto(e.target.value)} rows={3} maxLength={5000} className="field"
            placeholder="Ex.: a cliente ligou com vermelhidão leve; orientada a usar compressa fria." style={{ resize: 'vertical' }} />
          <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
            Fica com a data de hoje e o seu nome, e não se edita nem se apaga depois.
          </p>
          {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600 }}>{erro}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => { setEscrevendo(false); setTexto(''); setErro(null) }} className="btn-secondary">Cancelar</button>
            <button type="button" onClick={salvar} disabled={salvando || !texto.trim()} className="btn-primary" style={{ gap: 6 }}>
              {salvando && <Loader2 size={13} className="animate-spin" />} Salvar anotação
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * "Editado por X em dd/mm — ver a anterior" (bloco Prontuário, PR2b): o
 * registro concluído corrigido guarda a versão de antes, que não se altera.
 * A tela diz quem corrigiu por último e mostra as anteriores, da mais nova à
 * mais antiga.
 */
export function RegistroEditado({ versoes, appointmentId, slug }: {
  versoes:       VersaoDoRegistro[]
  appointmentId: string
  slug:          string
}) {
  const fuso = useFuso()
  const [aberto, setAberto] = useState(false)
  const ultima = versoes[versoes.length - 1]
  if (!ultima) return null

  return (
    <div data-registro-editado style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
        <History size={13} aria-hidden="true" />
        <span>Editado por {ultima.editadaPorNome} em {formatarNoFuso(ultima.substituidaEm, 'dd/MM', fuso)}</span>
        <span aria-hidden="true">—</span>
        <button type="button" onClick={() => setAberto(v => !v)} className="btn-ghost" aria-expanded={aberto}
          style={{ padding: '2px 6px', fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--brand)' }}>
          {aberto ? 'esconder a anterior' : 'ver a anterior'}
        </button>
      </p>

      {aberto && [...versoes].reverse().map((v, i) => (
        <div key={v.id} data-versao-anterior style={{ padding: '12px 14px', borderRadius: 'var(--radius-field-token)', border: '1px dashed var(--border)', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
            {i === 0 ? 'Como estava' : 'Antes disso'} até {formatarNoFuso(v.substituidaEm, "dd/MM/yyyy 'às' HH:mm", fuso)}, quando {v.editadaPorNome} corrigiu
          </p>
          <TextoDaVersao rotulo="Evolução" texto={v.evolucao} />
          <TextoDaVersao rotulo="Intercorrências" texto={v.intercorrencias} />
          {v.ficha && v.ficha.rows.length > 0 && (
            <div>
              <p style={{ ...overline, color: 'var(--text-faint)', marginBottom: 6 }}>{v.ficha.nome}</p>
              <AnamnesisFormRenderer appointmentId={appointmentId} slug={slug} formName={v.ficha.nome} rows={v.ficha.rows}
                initial={v.ficha.respostas as AnamnesisAnswers} canEdit={false} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function TextoDaVersao({ rotulo, texto }: { rotulo: string; texto: string | null }) {
  return (
    <div>
      <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{rotulo}</p>
      <p style={{ fontSize: 'var(--text-base-sz)', color: texto ? 'var(--text)' : 'var(--text-faint)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {texto || 'Em branco'}
      </p>
    </div>
  )
}
