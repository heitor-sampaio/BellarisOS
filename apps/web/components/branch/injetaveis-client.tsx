'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, Syringe, ExternalLink, UserPlus } from 'lucide-react'
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
      <div className="page-header" style={{ marginBottom: 20 }}>
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
      </div>

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
                  : 'Nenhum mapa ainda. Busque um cliente para começar o primeiro.'}
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
                Escolha um cliente ao lado para abrir o mapa.
              </p>
              <p style={{ color: 'var(--text-faint)', fontSize: 'var(--text-2xs)', marginTop: 4 }}>
                Registrar a aplicação só acontece dentro do atendimento — aqui se planeja.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
