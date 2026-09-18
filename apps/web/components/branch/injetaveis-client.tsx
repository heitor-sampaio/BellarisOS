'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, Syringe, ExternalLink, UserPlus, Plus, X } from 'lucide-react'
import { MapaInjetaveisCliente } from '@/components/branch/mapa-injetaveis-cliente'
import { rotaCliente } from '@/lib/rotas'
import type { MapaNaLista } from '@/actions/injectable-map'

/**
 * Injetáveis — a mesma tela nos dois portais.
 *
 * O mapa só era alcançável por dentro da ficha de um cliente: para "ver os
 * planejamentos de injetáveis" era preciso saber de antemão de quem eram. Aqui
 * a lista é a porta, e a busca abre o mapa de qualquer cliente — inclusive de
 * quem ainda não tem nenhum.
 *
 * O mapa em si continua sendo o mesmo componente da ficha e do atendimento:
 * planejamento vivo de um lado, aplicações congeladas do outro.
 */
export function InjetaveisClient({
  mapas, clientes, produtos, slug, podeEditar,
}: {
  mapas:    MapaNaLista[]
  /** Clientes ativos, para começar um mapa de quem ainda não tem. */
  clientes: { id: string; name: string; phone: string | null }[]
  produtos: string[]
  slug:     string
  podeEditar: boolean
}) {
  const pathname = usePathname()
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState<{ id: string; nome: string } | null>(null)
  const [escolhendo, setEscolhendo] = useState(false)

  const termo = busca.trim().toLowerCase()
  const digitos = termo.replace(/\D/g, '')

  const comMapa = useMemo(() => {
    if (!termo) return mapas
    return mapas.filter(m =>
      m.clientName.toLowerCase().includes(termo) ||
      (digitos.length >= 3 && (m.clientPhone ?? '').replace(/\D/g, '').includes(digitos)),
    )
  }, [mapas, termo, digitos])

  // Só aparecem quando se busca: a lista de partida é de quem já tem mapa.
  const semMapa = useMemo(() => {
    if (termo.length < 2) return []
    const jaListados = new Set(mapas.map(m => m.clientId))
    return clientes
      .filter(c => !jaListados.has(c.id))
      .filter(c =>
        c.name.toLowerCase().includes(termo) ||
        (digitos.length >= 3 && (c.phone ?? '').replace(/\D/g, '').includes(digitos)),
      )
      .slice(0, 12)
  }, [clientes, mapas, termo, digitos])

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
            Planejamento por cliente e histórico de aplicações. Marcar o mapa é planejar;
            registrar a aplicação congela o que foi aplicado no prontuário.
          </p>
        </div>

        {/* A lista só tem quem já tem mapa. Sem este botão, começar o primeiro
            de alguém dependia de adivinhar que a busca alcança qualquer
            cliente — a ação principal da tela ficava invisível. */}
        {podeEditar && (
          <button type="button" onClick={() => setEscolhendo(true)} className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Plus size={15} /> Novo mapa
          </button>
        )}
      </div>

      {escolhendo && (
        <EscolherCliente
          clientes={clientes}
          comMapa={new Set(mapas.map(m => m.clientId))}
          onEscolher={c => { setSelecionado({ id: c.id, nome: c.name }); setEscolhendo(false); setBusca('') }}
          onFechar={() => setEscolhendo(false)}
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
              placeholder="Buscar cliente por nome ou telefone…"
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>

          {comMapa.length === 0 && semMapa.length === 0 && (
            <div className="card" style={{ padding: '28px 18px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
                {termo
                  ? 'Nenhum cliente com esse nome.'
                  : podeEditar
                    ? 'Nenhum mapa ainda. Use "Novo mapa" para começar o primeiro.'
                    : 'Nenhum mapa ainda.'}
              </p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {comMapa.map(m => (
              <button
                key={m.clientId}
                type="button"
                onClick={() => setSelecionado({ id: m.clientId, nome: m.clientName })}
                className="card"
                style={{
                  textAlign: 'left', cursor: 'pointer', padding: '12px 14px',
                  display: 'flex', flexDirection: 'column', gap: 6,
                  borderColor: selecionado?.id === m.clientId ? 'var(--brand)' : undefined,
                  background:  selecionado?.id === m.clientId ? 'var(--brand-soft)' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <Syringe size={13} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                  <span style={{
                    fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {m.clientName}
                  </span>
                </div>
                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                  {m.pontos} {m.pontos === 1 ? 'ponto' : 'pontos'}
                  {m.produtos.length > 0 && ` · ${m.produtos.slice(0, 2).join(', ')}`}
                  {m.unidade && ` · ${m.unidade}`}
                </span>
                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                  {m.ultimaAplicacao
                    ? `Última aplicação em ${new Date(m.ultimaAplicacao).toLocaleDateString('pt-BR')}`
                    : 'Sem aplicação registrada'}
                </span>
              </button>
            ))}

            {semMapa.length > 0 && (
              <>
                <span className="overline" style={{ marginTop: 6 }}>Sem mapa ainda</span>
                {semMapa.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelecionado({ id: c.id, nome: c.name })}
                    className="card"
                    style={{
                      textAlign: 'left', cursor: 'pointer', padding: '10px 14px',
                      display: 'flex', alignItems: 'center', gap: 7,
                      borderColor: selecionado?.id === c.id ? 'var(--brand)' : undefined,
                      background:  selecionado?.id === c.id ? 'var(--brand-soft)' : undefined,
                    }}
                  >
                    <UserPlus size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                    <span style={{
                      fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)', color: 'var(--text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {c.name}
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        </aside>

        <div style={{ flex: 1, minWidth: 0 }}>
          {selecionado ? (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12, flexWrap: 'wrap',
              }}>
                <h2 style={{
                  fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)',
                }}>
                  {selecionado.nome}
                </h2>
                {/* O portal certo sai do pathname: a ficha da rede é /admin. */}
                <Link
                  href={rotaCliente(pathname, slug, selecionado.id)}
                  className="btn-ghost"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-xs-sz)', textDecoration: 'none' }}
                >
                  Abrir a ficha <ExternalLink size={12} />
                </Link>
              </div>

              <MapaInjetaveisCliente
                key={selecionado.id}
                clientId={selecionado.id}
                slug={slug}
                produtos={produtos}
                podeEditar={podeEditar}
              />
            </div>
          ) : (
            <div className="card" style={{ padding: '56px 24px', textAlign: 'center' }}>
              <Syringe size={20} style={{ color: 'var(--text-faint)' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 10 }}>
                Escolha um cliente ao lado, ou comece um mapa novo.
              </p>
              <p style={{ color: 'var(--text-faint)', fontSize: 'var(--text-2xs)', marginTop: 4 }}>
                Registrar a aplicação só acontece dentro do atendimento — aqui se planeja.
              </p>
              {podeEditar && (
                <button type="button" onClick={() => setEscolhendo(true)} className="btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16 }}>
                  <Plus size={15} /> Novo mapa
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
 * Escolher de quem é o mapa novo.
 *
 * A busca alcança qualquer cliente, com ou sem mapa — quem já tem aparece
 * marcado, para não se abrir um "novo" achando que é o primeiro.
 */
function EscolherCliente({
  clientes, comMapa, onEscolher, onFechar,
}: {
  clientes:   { id: string; name: string; phone: string | null }[]
  comMapa:    Set<string>
  onEscolher: (c: { id: string; name: string }) => void
  onFechar:   () => void
}) {
  const [termo, setTermo] = useState('')

  const t = termo.trim().toLowerCase()
  const digitos = t.replace(/\D/g, '')
  const achados = clientes
    .filter(c =>
      !t ||
      c.name.toLowerCase().includes(t) ||
      (digitos.length >= 3 && (c.phone ?? '').replace(/\D/g, '').includes(digitos)),
    )
    .slice(0, 50)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}
    >
      <div className="card" style={{
        width: '100%', maxWidth: 460, padding: 0, overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column', maxHeight: '80vh',
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 'var(--weight-extrabold)', color: 'var(--text)', flex: 1 }}>
            Mapa de quem?
          </h2>
          <button type="button" onClick={onFechar} className="btn-ghost" style={{ padding: '4px 6px' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '14px 20px 10px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{
              position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-faint)', pointerEvents: 'none',
            }} />
            <input
              type="text" autoFocus className="field" style={{ paddingLeft: 32 }}
              placeholder="Buscar por nome ou telefone…"
              value={termo}
              onChange={e => setTermo(e.target.value)}
            />
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: '0 10px 14px' }}>
          {achados.length === 0 ? (
            <p style={{ padding: '18px 10px', color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
              Nenhum cliente com esse nome. Cadastre em Clientes e volte aqui.
            </p>
          ) : achados.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => onEscolher(c)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10,
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{
                  display: 'block', fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)',
                  color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {c.name}
                </span>
                {c.phone && (
                  <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>{c.phone}</span>
                )}
              </span>
              {comMapa.has(c.id) && (
                <span style={{
                  fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--brand)',
                  flexShrink: 0,
                }}>
                  já tem mapa
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
