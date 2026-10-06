import Link from 'next/link'
import { getPlatformContext } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { filaDoSuporte } from '@estetica-os/nucleo/lib/suporte/chamados'
import { ehSituacao, ROTULO_DA_SITUACAO } from '@estetica-os/nucleo/lib/suporte/chamados-regras'
import { SegSelect } from '@estetica-os/nucleo/components/shared/seg-select'
import { SinalDaFila } from '@/components/suporte/sinal-da-fila'
import { BuscaNaUrl } from '@estetica-os/nucleo/components/shared/busca-na-url'
import { contemSemAcento, termoDaUrl } from '@estetica-os/nucleo/lib/texto'

/**
 * A fila de chamados das clínicas. Recarrega sozinha quando chega chamado ou
 * resposta (`SinalDaFila`: o sinal pelo Realtime, e um refresh a cada minuto
 * de reserva).
 */
const FILTROS = [
  { key: 'abertos',            label: 'Em aberto' },
  { key: 'aguardando_clinica', label: 'Aguardando a clínica' },
  { key: 'resolvido',          label: 'Resolvidos' },
  { key: 'todos',              label: 'Todos' },
]
const quando = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

export default async function ChamadosPage({ searchParams }: { searchParams: Promise<{ situacao?: string; q?: string }> }) {
  await getPlatformContext()
  const { situacao, q } = await searchParams
  const filtro = situacao === 'todos' || ehSituacao(situacao) ? situacao : 'abertos'
  const termo = termoDaUrl(q)
  // A busca (rede, assunto, quem, atendente, número) é sobre a fila já recortada
  // pela situação — no máximo 200 linhas, as mais recentes.
  const chamados = (await filaDoSuporte({ status: filtro }))
    .filter(c => contemSemAcento([c.rede, c.assunto, c.quem, c.atendente, `#${c.numero}`], termo))

  return (
    <div className="suporte-pilha-larga">
      <SinalDaFila />
      <div className="suporte-cabecalho">
        <div>
          <h1 className="suporte-titulo">Chamados</h1>
          <p className="suporte-sub">{chamados.length} {chamados.length === 1 ? 'chamado' : 'chamados'}</p>
        </div>
        <div className="suporte-filtros">
          <BuscaNaUrl inicial={termo} placeholder="Buscar rede, assunto, pessoa ou #número…" rotulo="Buscar chamado" />
          <SegSelect options={FILTROS} value={filtro} basePath="/chamados" paramName="situacao" ariaLabel="Situação"
            extraParams={termo ? { q: termo } : undefined} />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {chamados.length === 0 ? (
          <p className="suporte-vazio">Nenhum chamado aqui.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="suporte-tabela">
              <thead>
                <tr><th>Chamado</th><th>Rede</th><th>Quem abriu</th><th>Situação</th><th>Atendente</th><th>Última mensagem</th></tr>
              </thead>
              <tbody>
                {chamados.map(c => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/chamados/${c.id}`} className="suporte-link-forte">#{c.numero} · {c.assunto}</Link>
                    </td>
                    <td>{c.rede}</td>
                    <td>{c.quem ?? '—'}</td>
                    <td><span className="chamado-situacao" data-situacao={c.status}>{ROTULO_DA_SITUACAO[c.status]}</span></td>
                    <td>{c.atendente ?? '—'}</td>
                    <td>{quando(c.ultimaMensagem)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
