'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { MapaInjetavel } from '@/components/branch/mapa-injetavel'

/**
 * Um planejamento aberto, ao lado da lista no desktop e sozinho no celular.
 *
 * O "voltar" só existe onde a lista saiu da tela (`.ld-voltar`): no desktop ela
 * continua do lado e um botão de voltar seria um convite a lugar nenhum.
 */
export function InjetavelAberto({
  mapId, slug, basePath, produtos, podeEditar,
}: {
  mapId:      string
  slug:       string
  basePath:   string
  produtos:   string[]
  podeEditar: boolean
}) {
  const router = useRouter()

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Link href={basePath} className="btn-ghost ld-voltar"
        style={{
          alignItems: 'center', gap: 4, alignSelf: 'flex-start',
          fontSize: 'var(--text-sm-sz)', padding: '5px 10px', textDecoration: 'none',
        }}>
        <ChevronLeft size={14} /> Planejamentos
      </Link>

      <MapaInjetavel
        key={mapId}
        mapId={mapId}
        slug={slug}
        produtos={produtos}
        podeEditar={podeEditar}
        // Nome, cliente e pontos aparecem na lista, que vem do layout: sem o
        // refresh ela continuaria mostrando o estado anterior ao lado.
        onMudou={() => router.refresh()}
      />
    </div>
  )
}
