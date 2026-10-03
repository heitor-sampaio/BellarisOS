import Link from 'next/link'
import { getPlatformContext } from '@/lib/plataforma/contexto'
import { filaDoSuporte } from '@/lib/suporte/chamados'
import { ehSituacao, ROTULO_DA_SITUACAO } from '@/lib/suporte/chamados-regras'
import { SegSelect } from '@/components/shared/seg-select'
import { SinalDaFila } from '@/components/suporte/sinal-da-fila'

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

export default async function ChamadosPage({ searchParams }: { searchParams: Promise<{ situacao?: string }> }) {
  await getPlatformContext()
  const { situacao } = await searchParams
  const filtro = situacao === 'todos' || ehSituacao(situacao) ? situacao : 'abertos'
  const chamados = await filaDoSuporte({ status: filtro })

  return (
    <div className="suporte-pilha-larga">
      <SinalDaFila />
      <div className="suporte-cabecalho">
        <div>
          <h1 className="suporte-titulo">Chamados</h1>
          <p className="suporte-sub">{chamados.length} {chamados.length === 1 ? 'chamado' : 'chamados'}</p>
        </div>
        <div className="suporte-filtros">
          <SegSelect options={FILTROS} value={filtro} basePath="/suporte/chamados" paramName="situacao" ariaLabel="Situação" />
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
                      <Link href={`/suporte/chamados/${c.id}`} className="suporte-link-forte">#{c.numero} · {c.assunto}</Link>
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
