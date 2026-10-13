'use client'

import { useMemo, useState, useTransition } from 'react'
import { Plus, Search, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { criarTag, renomearTag, arquivarTag, listarTagsComUso, type TagDaRede } from '@/actions/tags'

/**
 * Configurações → Tags (2026-10-13): o vocabulário da rede, um só para a ficha
 * do cliente e o CRM. Tag gravada em qualquer lugar (importação, card,
 * automação) entra aqui sozinha; aqui se cria, renomeia — em todo lugar, e
 * junta se o nome já existe — e arquiva (sai das opções, fica em quem tem).
 */

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

function uso(t: TagDaRede): string {
  const partes = [
    t.clientes ? plural(t.clientes, 'cliente', 'clientes') : null,
    t.contatos ? plural(t.contatos, 'contato', 'contatos') : null,
    t.oportunidades ? plural(t.oportunidades, 'oportunidade', 'oportunidades') : null,
  ].filter(Boolean)
  return partes.length ? partes.join(' · ') : 'Sem uso'
}

const semAcento = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function SettingsTags({ iniciais }: { iniciais: TagDaRede[] }) {
  const [tags, setTags] = useState(iniciais)
  const [nova, setNova] = useState('')
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [nomeNovo, setNomeNovo] = useState('')
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const visiveis = useMemo(() => {
    const k = semAcento(busca.trim())
    const lista = k ? tags.filter(t => semAcento(t.nome).includes(k)) : tags
    // As ativas primeiro; as arquivadas no fim, para não poluir.
    return [...lista.filter(t => !t.arquivada), ...lista.filter(t => t.arquivada)]
  }, [tags, busca])

  const agir = (fn: () => Promise<{ tom: 'ok' | 'erro'; texto: string } | null>) => {
    setAviso(null)
    startTransition(async () => {
      const r = await fn()
      setTags(await listarTagsComUso())
      if (r) setAviso(r)
    })
  }

  function criar() {
    const nome = nova
    agir(async () => {
      const r = await criarTag(nome)
      if (!r.ok) return { tom: 'erro', texto: r.error }
      setNova('')
      return null
    })
  }

  function salvarNome(t: TagDaRede) {
    const nome = nomeNovo
    agir(async () => {
      const r = await renomearTag(t.id, nome)
      if (!r.ok) return { tom: 'erro', texto: r.error }
      setEditando(null)
      const onde = r.registros ? ` em ${plural(r.registros, 'registro', 'registros')}` : ''
      let texto = r.juntou ? `"${t.nome}" foi juntada com "${r.nome}"${onde}.` : `Renomeada para "${r.nome}"${onde}.`
      if (r.automacoes.length) {
        texto += ` Estas automações citam o nome antigo e precisam ser ajustadas: ${r.automacoes.join(', ')}.`
      }
      return { tom: 'ok', texto }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
        As tags da rede, as mesmas na ficha do cliente e no CRM. A que alguém grava por outro caminho
        — o card da oportunidade, a importação, uma automação — entra aqui sozinha. Renomear troca a
        tag em todos os clientes, contatos e oportunidades; arquivar tira das opções, mas quem já tem
        continua com ela.
      </p>

      <div className="card" style={{ padding: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="field" aria-label="Nova tag" placeholder="Nova tag" value={nova} maxLength={60}
          onChange={e => setNova(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && nova.trim()) { e.preventDefault(); criar() } }}
          style={{ flex: '1 1 220px' }}
        />
        <button type="button" className="btn-primary" onClick={criar} disabled={!nova.trim() || isPending}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> Criar tag
        </button>
      </div>

      {aviso && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 12px', borderRadius: 'var(--radius-field-token)',
          background: aviso.tom === 'ok' ? 'var(--success-soft)' : 'var(--danger-soft)',
          color: aviso.tom === 'ok' ? 'var(--success)' : 'var(--danger)', fontSize: 'var(--text-sm-sz)', fontWeight: 600,
        }}>
          {aviso.tom === 'ok' ? <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 2 }} /> : <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />}
          <span>{aviso.texto}</span>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Search size={14} color="var(--text-faint)" />
          <input
            aria-label="Procurar tag" placeholder={`Procurar entre ${plural(tags.length, 'tag', 'tags')}`} value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontFamily: 'inherit' }}
          />
          {isPending && <Loader2 size={14} className="animate-spin" color="var(--text-faint)" />}
        </div>

        {visiveis.length === 0 && (
          <p style={{ padding: 16, margin: 0, fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>
            {busca ? 'Nenhuma tag com esse nome.' : 'A rede ainda não tem tags.'}
          </p>
        )}

        {visiveis.map((t, i) => (
          <div key={t.id} data-tag={t.nome} style={{
            padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            borderTop: i ? '1px solid var(--hairline)' : 'none', opacity: t.arquivada ? 0.7 : 1,
          }}>
            {editando === t.id ? (
              <>
                <input
                  className="field" aria-label="Novo nome" value={nomeNovo} maxLength={60} autoFocus
                  onChange={e => setNomeNovo(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); salvarNome(t) }
                    if (e.key === 'Escape') setEditando(null)
                  }}
                  style={{ flex: '1 1 200px' }}
                />
                <button type="button" className="btn-primary" disabled={!nomeNovo.trim() || isPending} onClick={() => salvarNome(t)}>Salvar</button>
                <button type="button" className="btn-ghost" disabled={isPending} onClick={() => setEditando(null)}>Cancelar</button>
              </>
            ) : (
              <>
                <div style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)', overflowWrap: 'anywhere' }}>{t.nome}</span>
                  <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)' }}>
                    {uso(t)}{t.arquivada && <> · <strong style={{ color: 'var(--warning)' }}>Arquivada</strong></>}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {!t.arquivada && (
                    <button type="button" className="btn-ghost" disabled={isPending}
                      onClick={() => { setEditando(t.id); setNomeNovo(t.nome); setAviso(null) }}>
                      Renomear
                    </button>
                  )}
                  <button type="button" className="btn-ghost" disabled={isPending}
                    onClick={() => agir(async () => {
                      const r = await arquivarTag(t.id, !t.arquivada)
                      return r.ok ? null : { tom: 'erro', texto: r.error ?? 'Não foi possível.' }
                    })}>
                    {t.arquivada ? 'Reativar' : 'Arquivar'}
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
