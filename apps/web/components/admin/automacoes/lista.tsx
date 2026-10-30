'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Workflow, Plus, Zap, AlertCircle, ChevronRight, LayoutTemplate, X } from 'lucide-react'
import { criarAutomacao, criarAutomacaoDeModelo, type AutomacaoNaLista } from '@/actions/automacoes'
import { MODELOS_DE_AUTOMACAO } from '@/lib/automacoes/modelos'
import { JanelaModal } from '@/components/shared/janela-modal'

/**
 * A lista de automações.
 *
 * As colunas respondem, nesta ordem, o que se pergunta ao abrir: **está
 * ligada?**, **o que a dispara?** e **rodou?**. O número de execuções dos
 * últimos 7 dias é o que separa "montei e funciona" de "montei e nunca
 * disparou" — o erro mudo que esta frente inteira tenta evitar.
 */

export function ListaDeAutomacoes({
  automacoes, podeEditar, erro,
}: { automacoes: AutomacaoNaLista[]; podeEditar: boolean; erro?: string }) {
  const router = useRouter()
  const [criando, criar] = useTransition()
  const [nome, setNome]  = useState('')
  const [abrindo, setAbrindo] = useState(false)
  const [vendoModelos, setVendoModelos] = useState(false)
  const [usando, setUsando] = useState<string | null>(null)

  function usarModelo(chave: string) {
    setUsando(chave)
    criar(async () => {
      const r = await criarAutomacaoDeModelo(chave)
      if (r.error || !r.id) { setUsando(null); toast.error(r.error ?? 'Erro ao criar.'); return }
      router.push(`/admin/automacoes/${r.id}`)
    })
  }

  function aoCriar() {
    const titulo = nome.trim()
    if (!titulo) return
    criar(async () => {
      const r = await criarAutomacao(titulo)
      if (r.error || !r.id) { toast.error(r.error ?? 'Erro ao criar.'); return }
      router.push(`/admin/automacoes/${r.id}`)
    })
  }

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 14, flexWrap: 'wrap', marginBottom: 24,
      }}>
        <div>
          <h1 style={{
            fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
            letterSpacing: 'var(--tracking-tight)', color: 'var(--text)',
          }}>
            Automações
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            Fluxos que reagem sozinhos ao que acontece na clínica.
          </p>
        </div>

        {podeEditar && (
          abrindo ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="field" autoFocus value={nome}
                onChange={e => setNome(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') aoCriar() }}
                placeholder="Nome da automação"
                style={{ minWidth: 200 }}
              />
              <button type="button" className="btn-primary" onClick={aoCriar} disabled={criando}>
                {criando ? 'Criando…' : 'Criar'}
              </button>
            </div>
          ) : (
            // "Nova automação" continua começando VAZIA; o modelo é a opção ao
            // lado (D-4, decisão do Heitor em 2026-10-29).
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary" onClick={() => setVendoModelos(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <LayoutTemplate size={15} /> Usar um modelo
              </button>
              <button type="button" className="btn-primary" onClick={() => setAbrindo(true)}>
                <Plus size={15} /> Nova automação
              </button>
            </div>
          )
        )}

      {vendoModelos && (
        <JanelaModal onFechar={() => setVendoModelos(false)} rotulo="Modelos de automação" largura={560} travado={criando}>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)', margin: 0 }}>
                  Modelos de automação
                </h2>
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
                  O modelo cria a automação desligada, com o fluxo montado. Revise e ligue quando estiver do seu jeito.
                </p>
              </div>
              <button type="button" className="btn-ghost" aria-label="Fechar" onClick={() => setVendoModelos(false)} disabled={criando}>
                <X size={15} />
              </button>
            </div>
            {MODELOS_DE_AUTOMACAO.map(m => (
              <div key={m.chave} data-modelo={m.chave} className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)', margin: 0 }}>{m.nome}</p>
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{m.descricao}</p>
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-soft)', margin: 0, lineHeight: 1.5 }}>
                  Para revisar: {m.revisar}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={() => usarModelo(m.chave)} disabled={criando}>
                    {usando === m.chave ? 'Criando…' : 'Usar este modelo'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </JanelaModal>
      )}
      </div>

      {erro && (
        <div className="card" style={{ borderColor: 'var(--danger-border)', background: 'var(--danger-soft)', marginBottom: 16 }}>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>
            Não foi possível carregar: {erro}
          </p>
        </div>
      )}

      {automacoes.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '44px 24px' }}>
          <Workflow size={28} color="var(--text-faint)" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>
            Nenhuma automação ainda
          </p>
          <p style={{
            fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)',
            marginTop: 6, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6,
          }}>
            Uma automação começa num fato — cliente cadastrado, conversa iniciada,
            pagamento recebido — e faz o que você montar a partir dali.
          </p>
        </div>
      ) : (
        <div className="cards-1-col" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {automacoes.map(a => (
            <Link
              key={a.id} href={`/admin/automacoes/${a.id}`}
              className="card card-hover"
              style={{ textDecoration: 'none', display: 'block', padding: '14px 18px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>

                {/* No ar ou não, à esquerda e antes do nome.
                    O chip dizia "Ligada" no meio da linha, do mesmo tamanho de
                    tudo; e o que se quer saber varrendo a lista é uma coisa
                    só — o que está rodando agora. Ponto preenchido em rosé
                    para quem está no ar, anel vazado para o resto: dá para ler
                    a coluna inteira sem ler uma palavra. */}
                <span
                  title={
                    a.status === 'ATIVA' ? 'No ar'
                    : a.status === 'PAUSADA' ? 'Desligada' : 'Rascunho'
                  }
                  style={{
                    width: 9, height: 9, borderRadius: 'var(--radius-full)', flexShrink: 0,
                    background: a.status === 'ATIVA' ? 'var(--brand)' : 'transparent',
                    border: a.status === 'ATIVA' ? 'none' : '1.5px solid var(--border)',
                    boxShadow: a.status === 'ATIVA'
                      ? '0 0 0 3px color-mix(in srgb, var(--brand) 16%, transparent)'
                      : 'none',
                  }}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)',
                  }}>
                    {a.nome}
                  </span>

                  {/* O FLUXO, em uma linha. Antes era o nome técnico do evento
                      (`conversa.mensagem_recebida`) e mais nada — o card dizia
                      por onde começa e escondia o que faz. */}
                  {a.passos.length > 0 ? (
                    <p style={{
                      fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 3,
                      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                    }}>
                      <Zap size={11} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                      {a.passos.map((passo, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {i > 0 && <ChevronRight size={11} style={{ color: 'var(--text-faint)' }} />}
                          {passo}
                        </span>
                      ))}
                      {a.passos.length === 4 && <span style={{ color: 'var(--text-faint)' }}>…</span>}
                    </p>
                  ) : (
                    <p style={{
                      fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', marginTop: 3,
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      <AlertCircle size={11} /> sem gatilho — nada o inicia
                    </p>
                  )}
                </div>

                {/* Execuções: o número e o período na MESMA linha. Empilhados,
                    duas linhas de rótulo para um dígito esticavam o card à
                    altura de um parágrafo que não existe. */}
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 5, flexShrink: 0,
                  fontSize: 'var(--text-overline)', color: 'var(--text-muted)',
                }}>
                  <span style={{
                    fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-extrabold)',
                    color: a.execucoes ? 'var(--text)' : 'var(--text-faint)',
                  }}>
                    {a.execucoes}
                  </span>
                  {a.execucoes === 1 ? 'execução · 7 dias' : 'execuções · 7 dias'}
                  {a.falhas > 0 && (
                    <span style={{
                      color: 'var(--danger)', fontWeight: 'var(--weight-bold)',
                      background: 'var(--danger-soft)', borderRadius: 'var(--radius-chip)',
                      padding: '2px 7px', marginLeft: 3,
                    }}>
                      {a.falhas} {a.falhas === 1 ? 'falhou' : 'falharam'}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
