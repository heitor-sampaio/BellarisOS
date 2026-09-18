'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Search, Syringe, ExternalLink, Plus, X, Loader2, UserPlus } from 'lucide-react'
import { MapaInjetavel } from '@/components/branch/mapa-injetavel'
import { criarPlanejamentoInjetavel, type MapaNaLista } from '@/actions/injectable-map'
import { rotaCliente } from '@/lib/rotas'

/**
 * Injetáveis — a mesma tela nos dois portais.
 *
 * O mapa só era alcançável por dentro da ficha de um cliente. Aqui a lista é a
 * porta, e o planejamento tem vida própria: **nome primeiro, cliente depois**,
 * como o plano de tratamento. Dá para desenhar uma avaliação por foto antes de
 * a pessoa existir no cadastro.
 */
export function InjetaveisClient({
  mapas, produtos, slug, branchId, podeEditar,
}: {
  mapas:    MapaNaLista[]
  produtos: string[]
  slug:     string
  /** Unidade da tela; vazio no portal da rede. */
  branchId: string
  podeEditar: boolean
}) {
  const pathname = usePathname()
  const router   = useRouter()
  const [, startT] = useTransition()

  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<MapaNaLista | null>(null)
  const [criando, setCriando] = useState(false)

  const termo = busca.trim().toLowerCase()
  const digitos = termo.replace(/\D/g, '')

  const visiveis = useMemo(() => {
    if (!termo) return mapas
    return mapas.filter(m =>
      m.nome.toLowerCase().includes(termo) ||
      (m.clientName ?? '').toLowerCase().includes(termo) ||
      (digitos.length >= 3 && (m.clientPhone ?? '').replace(/\D/g, '').includes(digitos)),
    )
  }, [mapas, termo, digitos])

  function recarregar() {
    startT(() => router.refresh())
  }

  return (
    <div>
      <div className="page-header" style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 20,
      }}>
        <div>
          <h1 style={{
            fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
            letterSpacing: 'var(--tracking-tight)', color: 'var(--text)',
          }}>
            Injetáveis
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            Planejamento com nome, com ou sem cliente. Marcar o mapa é planejar;
            registrar a aplicação congela o que foi aplicado no prontuário.
          </p>
        </div>

        {podeEditar && (
          <button type="button" onClick={() => setCriando(true)} className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Plus size={15} /> Novo planejamento
          </button>
        )}
      </div>

      {criando && (
        <NovoPlanejamento
          branchId={branchId}
          onFechar={() => setCriando(false)}
          onCriado={(id, nome) => {
            setCriando(false)
            setAberto({
              id, nome, clientId: null, clientName: null, clientPhone: null,
              unidade: null, pontos: 0, produtos: [], atualizadoEm: null,
              ultimaAplicacao: null, aplicacoes: 0,
            })
            recarregar()
          }}
        />
      )}

      <div className="master-detail">
        <aside style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{
              position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-faint)', pointerEvents: 'none',
            }} />
            <input
              type="text"
              className="field"
              style={{ paddingLeft: 32 }}
              placeholder="Buscar por nome do planejamento ou cliente…"
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>

          {visiveis.length === 0 && (
            <div className="card" style={{ padding: '28px 18px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
                {termo
                  ? 'Nada encontrado com esse termo.'
                  : podeEditar
                    ? 'Nenhum planejamento ainda. Use "Novo planejamento" para começar.'
                    : 'Nenhum planejamento ainda.'}
              </p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visiveis.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => setAberto(m)}
                className="card"
                style={{
                  textAlign: 'left', cursor: 'pointer', padding: '12px 14px',
                  display: 'flex', flexDirection: 'column', gap: 6,
                  borderColor: aberto?.id === m.id ? 'var(--brand)' : undefined,
                  background:  aberto?.id === m.id ? 'var(--brand-soft)' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <Syringe size={13} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                  <span style={{
                    fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {m.nome}
                  </span>
                </div>

                <span style={{
                  fontSize: 'var(--text-2xs)',
                  color: m.clientName ? 'var(--text-muted)' : 'var(--warning)',
                  fontWeight: m.clientName ? 400 : 600,
                }}>
                  {m.clientName ?? 'Sem cliente'}
                  {m.unidade && ` · ${m.unidade}`}
                </span>

                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                  {m.pontos} {m.pontos === 1 ? 'ponto' : 'pontos'}
                  {m.produtos.length > 0 && ` · ${m.produtos.slice(0, 2).join(', ')}`}
                  {m.ultimaAplicacao &&
                    ` · última aplicação em ${new Date(m.ultimaAplicacao).toLocaleDateString('pt-BR')}`}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div style={{ flex: 1, minWidth: 0 }}>
          {aberto ? (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {aberto.clientId && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {/* O portal certo sai do pathname: a ficha da rede é /admin. */}
                  <Link
                    href={rotaCliente(pathname, slug, aberto.clientId)}
                    className="btn-ghost"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-xs-sz)', textDecoration: 'none' }}
                  >
                    Abrir a ficha <ExternalLink size={12} />
                  </Link>
                </div>
              )}

              <MapaInjetavel
                key={aberto.id}
                mapId={aberto.id}
                slug={slug}
                produtos={produtos}
                podeEditar={podeEditar}
                onMudou={recarregar}
              />
            </div>
          ) : (
            <div className="card" style={{ padding: '56px 24px', textAlign: 'center' }}>
              <Syringe size={20} style={{ color: 'var(--text-faint)' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 10 }}>
                Escolha um planejamento ao lado, ou comece um novo.
              </p>
              <p style={{ color: 'var(--text-faint)', fontSize: 'var(--text-2xs)', marginTop: 4 }}>
                O cliente é opcional aqui; registrar a aplicação, que é prontuário, exige um.
              </p>
              {podeEditar && (
                <button type="button" onClick={() => setCriando(true)} className="btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16 }}>
                  <Plus size={15} /> Novo planejamento
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Só o nome — igual ao "Novo plano" de Tratamentos.
 *
 * Pedir o cliente aqui traria de volta o problema que esta mudança resolve:
 * quem está desenhando uma avaliação por foto ainda não tem ninguém cadastrado.
 * Ligar é um clique no cabeçalho do planejamento, depois.
 */
function NovoPlanejamento({
  branchId, onFechar, onCriado,
}: {
  branchId: string
  onFechar: () => void
  onCriado: (id: string, nome: string) => void
}) {
  const [nome, setNome] = useState(`Injetáveis — ${new Date().toLocaleDateString('pt-BR')}`)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function criar() {
    const titulo = nome.trim()
    if (!titulo) { setErro('Dê um nome ao planejamento.'); return }
    setErro(null); setSalvando(true)
    const res = await criarPlanejamentoInjetavel({ nome: titulo, branchId: branchId || null })
    setSalvando(false)
    if (res.error || !res.id) { setErro(res.error ?? 'Não foi possível criar.'); return }
    onCriado(res.id, titulo)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 440, padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 'var(--weight-extrabold)', color: 'var(--text)', flex: 1 }}>
            Novo planejamento
          </h2>
          <button type="button" onClick={onFechar} className="btn-ghost" style={{ padding: '4px 6px' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label className="field-label">Nome *</label>
            <input
              type="text" autoFocus className="field" value={nome}
              onChange={e => setNome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void criar() }}
              placeholder="Ex.: Toxina — terço superior"
            />
          </div>

          <p style={{
            display: 'flex', alignItems: 'flex-start', gap: 7,
            fontSize: 'var(--text-2xs)', color: 'var(--text-muted)',
          }}>
            <UserPlus size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            O cliente entra depois, pelo cabeçalho do planejamento — dá para
            desenhar antes de ele existir no cadastro.
          </p>

          {erro && (
            <p style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 600 }}>{erro}</p>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onFechar} className="btn-secondary">Cancelar</button>
            <button type="button" onClick={criar} disabled={salvando} className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 120, justifyContent: 'center' }}>
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {salvando ? 'Criando…' : 'Criar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
