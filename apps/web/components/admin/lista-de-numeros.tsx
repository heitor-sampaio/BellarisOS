'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Star, Link2, Trash2, Loader2, AlertCircle, Plus, Check, Settings2 } from 'lucide-react'
import {
  definirNumeroPadrao, atualizarVinculosDoNumero, removerNumeroWhatsApp,
  type NumeroNaTela, type OpcoesDeVinculo,
} from '@/actions/integrations'

/**
 * As caixas de WhatsApp da rede, uma por linha.
 *
 * Existe porque "o WhatsApp da clínica" deixou de ser uma coisa só: com duas
 * caixas, o cartão de integração que mostrava um formulário não conseguia nem
 * dizer QUAL conexão estava no ar. A lista é o mínimo para a rede reconhecer o
 * que tem.
 *
 * O que cada linha precisa responder, e por quê:
 *
 * - **o nome** — "WhatsApp" parou de ser um nome no dia em que apareceu o
 *   segundo. É o rótulo que aparece no aviso do inbox e nos eventos;
 * - **padrão** — por onde sai tudo que o SISTEMA inicia (automação, campanha,
 *   notificação). Hierarquia por preenchimento: é o único selo em `--brand`;
 * - **o provedor** — decide a janela de 24h e se dá para editar mensagem;
 * - **quem fala por ela** — o usuário vinculado manda SEMPRE por este número;
 * - **a unidade** — RÓTULO, e o texto diz isso na cara: quem lê precisa saber
 *   que marcar uma unidade aqui não restringe acesso nenhum.
 */

function Selo({ tom, children }: { tom: 'padrao' | 'ok' | 'off'; children: React.ReactNode }) {
  const cores = {
    padrao: { bg: 'var(--brand)',        fg: '#fff',                border: 'var(--brand)' },
    ok:     { bg: 'var(--success-soft)', fg: 'var(--success)',      border: 'var(--success-border)' },
    off:    { bg: 'var(--bg-app)',       fg: 'var(--text-faint)',   border: 'var(--border)' },
  }[tom]

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 'var(--radius-chip)',
      background: cores.bg, color: cores.fg, border: `1px solid ${cores.border}`,
      fontSize: 'var(--text-2xs)', fontWeight: 700, letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

function Campo({ rotulo, children, dica }: {
  rotulo: string; children: React.ReactNode; dica?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: '1 1 180px' }}>
      <label style={{
        fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)',
        letterSpacing: '0.04em',
      }}>
        {rotulo}
      </label>
      {children}
      {dica && (
        <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{dica}</p>
      )}
    </div>
  )
}

function LinhaDoNumero({ numero, opcoes, onMudou, onConfigurar }: {
  numero:  NumeroNaTela
  opcoes:  OpcoesDeVinculo
  onMudou: () => void
  /** Abre o formulário de CREDENCIAL desta caixa. */
  onConfigurar: () => void
}) {
  const [aberto,   setAberto]   = useState(false)
  const [rotulo,   setRotulo]   = useState(numero.label)
  const [branchId, setBranchId] = useState(numero.branchId ?? '')
  const [userId,   setUserId]   = useState(numero.userId ?? '')
  const [erro,     setErro]     = useState<string | null>(null)
  const [salvo,    setSalvo]    = useState(false)
  const [isPending, startTransition] = useTransition()

  const pessoa  = opcoes.pessoas.find(p => p.id === numero.userId)
  const unidade = opcoes.unidades.find(u => u.id === numero.branchId)

  function acao(fn: () => Promise<{ ok: boolean; error?: string }>, depois?: () => void) {
    setErro(null); setSalvo(false)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) { setErro(res.error ?? 'Não foi possível concluir.'); return }
      depois?.()
      onMudou()
    })
  }

  function remover() {
    if (!confirm(`Remover "${numero.label}"? As conversas que passaram por ele continuam, sem caixa.`)) return
    acao(() => removerNumeroWhatsApp(numero.id))
  }

  return (
    <div
      // Âncora da linha. O teste precisa agir sobre UMA caixa ("torne ESTA o
      // padrão"), e procurar a linha por texto casa com qualquer `div` que
      // contenha o rótulo — inclusive as de dentro, que não têm os botões.
      data-numero={numero.id}
      style={{
        border: '1px solid var(--border)', borderRadius: 'var(--radius-row)',
        background: 'var(--bg-app)', padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {numero.label}
            </span>
            {numero.isDefault && <Selo tom="padrao"><Star size={10} /> Padrão</Selo>}
            <Selo tom={numero.isActive ? 'ok' : 'off'}>
              {numero.isActive ? 'No ar' : 'Fora do ar'}
            </Selo>
          </div>

          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginTop: 3 }}>
            {numero.provider === 'uazapi' ? 'uazapi' : 'WhatsApp Oficial'}
            {numero.phone ? ` · ${numero.phone}` : ''}
            {numero.managed ? ' · gerenciada por nós' : ''}
          </p>

          {(pessoa || unidade) && (
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', marginTop: 3 }}>
              {pessoa  && <>Fala por aqui: <strong>{pessoa.nome}</strong></>}
              {pessoa && unidade && ' · '}
              {unidade && <>Unidade: {unidade.nome}</>}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {!numero.isDefault && (
            <button
              type="button"
              className="btn-ghost"
              disabled={isPending || !numero.isActive}
              onClick={() => acao(() => definirNumeroPadrao(numero.id))}
              title={numero.isActive
                ? 'Tudo que o sistema inicia passa a sair por este número'
                : 'Só um número no ar pode ser o padrão'}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <Star size={13} /> Tornar padrão
            </button>
          )}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setAberto(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <Link2 size={13} /> {aberto ? 'Fechar' : 'Nome e vínculos'}
          </button>
          {/* Credencial é outra coisa de vínculo: mexer no token é mexer na
              conexão, e quem quer só renomear não deve ter de reenviá-lo. */}
          <button
            type="button"
            className="btn-ghost"
            onClick={onConfigurar}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <Settings2 size={13} /> Conexão
          </button>
          {!numero.managed && (
            <button
              type="button"
              className="btn-ghost"
              disabled={isPending}
              onClick={remover}
              style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {aberto && (
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap',
          borderTop: '1px solid var(--border)', paddingTop: 10,
        }}>
          <Campo rotulo="NOME DA CONEXÃO" dica="É o que aparece no aviso do inbox.">
            <input
              className="field"
              value={rotulo}
              onChange={e => setRotulo(e.target.value)}
              placeholder="Recepção, Comercial…"
              style={{ fontSize: 'var(--text-base-sz)' }}
            />
          </Campo>

          <Campo rotulo="QUEM FALA POR ELE" dica="Esta pessoa responde sempre por este número.">
            <select
              className="field"
              value={userId}
              onChange={e => setUserId(e.target.value)}
              style={{ fontSize: 'var(--text-base-sz)' }}
            >
              <option value="">Ninguém em especial</option>
              {opcoes.pessoas.map(p => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </Campo>

          <Campo rotulo="UNIDADE" dica="Só rótulo: não restringe quem vê nem por onde sai.">
            <select
              className="field"
              value={branchId}
              onChange={e => setBranchId(e.target.value)}
              style={{ fontSize: 'var(--text-base-sz)' }}
            >
              <option value="">Da rede</option>
              {opcoes.unidades.map(u => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </Campo>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flex: '0 0 auto' }}>
            <button
              type="button"
              className="btn-primary"
              disabled={isPending || !rotulo.trim()}
              onClick={() => acao(
                () => atualizarVinculosDoNumero(numero.id, {
                  rotulo,
                  branchId: branchId || null,
                  userId:   userId   || null,
                }),
                () => setSalvo(true),
              )}
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              Salvar
            </button>
            {salvo && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 'var(--text-sm-sz)', color: 'var(--success)', fontWeight: 700,
              }}>
                <Check size={13} /> Salvo
              </span>
            )}
          </div>
        </div>
      )}

      {erro && (
        <p style={{
          display: 'flex', alignItems: 'flex-start', gap: 6,
          fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600,
        }}>
          <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 2 }} /> {erro}
        </p>
      )}
    </div>
  )
}

export function ListaDeNumeros({ numeros, opcoes, onAdicionar, onConfigurar }: {
  numeros: NumeroNaTela[]
  opcoes:  OpcoesDeVinculo
  /** Abre o formulário de conexão para uma caixa NOVA. */
  onAdicionar: () => void
  /** Abre o formulário de credencial de UMA caixa existente. */
  onConfigurar: (numeroId: string) => void
}) {
  const router = useRouter()
  const semPadrao = numeros.some(n => n.isActive) && !numeros.some(n => n.isDefault)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
      {numeros.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          Nenhum número conectado ainda.
        </p>
      ) : (
        numeros.map(n => (
          <LinhaDoNumero
            key={n.id} numero={n} opcoes={opcoes}
            onMudou={() => router.refresh()}
            onConfigurar={() => onConfigurar(n.id)}
          />
        ))
      )}

      {/*
        Rede com número no ar e nenhum padrão é estado que ela precisa resolver:
        `escolherNumeroDeSaida` devolve `null` em vez de chutar um, e tudo que o
        sistema inicia para de sair. Eleger um aqui seria o `data[0]` de volta,
        com outro nome — então o certo é dizer, e não consertar por conta.
      */}
      {semPadrao && (
        <p style={{
          display: 'flex', alignItems: 'flex-start', gap: 7,
          padding: '9px 11px', borderRadius: 8,
          background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
          fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600,
        }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Nenhum número é o padrão da rede. Automações, campanhas e avisos não
            têm por onde sair — escolha um acima.
          </span>
        </p>
      )}

      <button
        type="button"
        onClick={onAdicionar}
        className="btn-secondary"
        style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <Plus size={14} /> Adicionar número
      </button>
    </div>
  )
}
