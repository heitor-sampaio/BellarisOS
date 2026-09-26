'use client'

import { useEffect, useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { SegSelect } from '@/components/shared/seg-select'
import { atualizarVisibilidadeDoInbox } from '@/actions/rede'
import {
  OPCOES_DE_VISIBILIDADE, type VisibilidadeDoInbox,
} from '@/lib/inbox/visibilidade'

/**
 * Configurações → Cargos: com "só os próprios leads", o inbox segue a pessoa
 * ou a conversa. Escolha da clínica (2026-09-26).
 *
 * Mora na aba de Cargos, e não em Geral, porque refina o escopo que se escolhe
 * logo abaixo, na matriz — quem decide quem vê o quê é quem monta os cargos.
 *
 * Grava ao escolher, sem botão: são duas opções fixas, e um "Salvar" para um
 * clique só seria um passo a mais para esquecer. O texto da opção escolhida fica
 * sempre à vista — a consequência é o que importa, não o rótulo.
 */
export function SettingsVisibilidadeInbox({
  inicial, podeEditar,
}: {
  inicial: VisibilidadeDoInbox
  podeEditar: boolean
}) {
  const [modo, setModo] = useState<VisibilidadeDoInbox>(inicial)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [salvando, iniciar] = useTransition()

  // O "salvo" é um aviso, não um estado: some sozinho.
  useEffect(() => {
    if (!salvo) return
    const id = setTimeout(() => setSalvo(false), 4000)
    return () => clearTimeout(id)
  }, [salvo])

  const escolher = (chave: string) => {
    if (!podeEditar || chave === modo) return
    const anterior = modo
    setModo(chave as VisibilidadeDoInbox)
    setErro(null)
    setSalvo(false)
    iniciar(async () => {
      try {
        const res = await atualizarVisibilidadeDoInbox(chave)
        if ('error' in res) {
          setModo(anterior)
          setErro(res.error)
        } else {
          setSalvo(true)
        }
      } catch (e) {
        // A tela não pode ficar mostrando uma escolha que o banco não gravou.
        setModo(anterior)
        setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
      }
    })
  }

  const atual = OPCOES_DE_VISIBILIDADE.find(o => o.key === modo) ?? OPCOES_DE_VISIBILIDADE[0]!

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      aria-labelledby="titulo-visibilidade-inbox">
      <div>
        <h3 id="titulo-visibilidade-inbox"
          style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
          Inbox de quem vê só os próprios leads
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 3 }}>
          Vale para cargos com o escopo &ldquo;só os meus&rdquo; no CRM. Quem vê tudo não muda.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {podeEditar ? (
          <SegSelect
            options={OPCOES_DE_VISIBILIDADE.map(o => ({ key: o.key, label: o.label }))}
            value={modo}
            onSelect={escolher}
            ariaLabel="O inbox segue a pessoa ou a conversa"
          />
        ) : (
          <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>
            {atual.label}
          </span>
        )}
        {salvando && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
            <Loader2 size={14} className="animate-spin" /> Salvando…
          </span>
        )}
        {salvo && !salvando && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--success)' }}>
            <Check size={14} /> Salvo
          </span>
        )}
      </div>

      <p data-testid="explicacao-visibilidade"
        style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', lineHeight: 1.5 }}>
        {atual.explicacao}
      </p>

      {erro && (
        <p role="alert" style={{
          fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--danger)',
          background: 'var(--danger-soft)', border: '1px solid var(--danger-border)',
          borderRadius: 'var(--radius-row)', padding: '8px 12px',
        }}>
          {erro}
        </p>
      )}
    </section>
  )
}
