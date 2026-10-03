import { Fragment } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPlatformContext } from '@/lib/plataforma/contexto'
import { lerChamado } from '@/lib/suporte/chamados'
import { ROTULO_DA_SITUACAO } from '@/lib/suporte/chamados-regras'
import { EntrarComo } from '@/components/suporte/entrar-como'
import { RespostaDoSuporte, AcoesDoChamado } from '@/components/suporte/chamado-do-suporte'
import { SinalDaFila } from '@/components/suporte/sinal-da-fila'

/**
 * Um chamado, visto pelo suporte: a conversa (com as notas internas), o
 * contexto de onde a pessoa estava, a resposta e — com a autorização de quem
 * abriu vigente — o "Entrar como", que volta para cá ao sair.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const quando = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

const ROTULO_DO_CONTEXTO: Record<string, string> = {
  pagina: 'Tela', usuario: 'Quem', cargo: 'Cargo', unidade: 'Unidade', portal: 'Portal', tela: 'Janela', navegador: 'Navegador',
}

export default async function ChamadoPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string }>
}) {
  await getPlatformContext()
  const { id } = await params
  const { erro } = await searchParams
  if (!UUID.test(id)) notFound()
  const c = await lerChamado(id, { comInternas: true })
  if (!c) notFound()

  const contexto = Object.entries(c.contexto)
    .filter(([k, v]) => k in ROTULO_DO_CONTEXTO && typeof v === 'string' && v)
    .map(([k, v]) => [ROTULO_DO_CONTEXTO[k]!, String(v)] as const)

  return (
    <div className="suporte-pilha-larga">
      <SinalDaFila />
      <div className="suporte-cabecalho">
        <div>
          <Link href="/suporte/chamados" className="suporte-voltar">← Chamados</Link>
          <h1 className="suporte-titulo">#{c.numero} · {c.assunto}</h1>
          <p className="suporte-sub">
            <Link href={`/suporte/redes/${c.redeId}`} className="suporte-voltar">{c.rede}</Link>
            {' · '}{c.quem ?? 'membro removido'} · aberto em {quando(c.criadoEm)}
            {c.atendente ? ` · com ${c.atendente}` : ''}
          </p>
        </div>
        <span className="chamado-situacao" data-situacao={c.status}>{ROTULO_DA_SITUACAO[c.status]}</span>
      </div>
      {erro && <p className="suporte-erro" role="alert">{erro}</p>}

      <div className="chamado-detalhe">
        <div className="card suporte-secao">
          <div className="chamado-conversa" style={{ marginTop: 0 }}>
            {c.mensagens.map(m => (
              <div key={m.id} className="chamado-msg" data-autor={m.autor} data-interna={m.interna ? 'true' : undefined}>
                <p className="chamado-msg-quem">
                  <span>{m.nome}{m.interna ? ' · nota interna' : ''}</span><span>{quando(m.em)}</span>
                </p>
                <p className="chamado-msg-corpo">{m.corpo}</p>
                {m.anexos.length > 0 && (
                  <div className="chamado-anexos">
                    {m.anexos.map(a => a.url && (
                      <a key={a.path} className="chamado-anexo" href={a.url} target="_blank" rel="noreferrer" title={a.nome}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do bucket privado */}
                        <img src={a.url} alt={a.nome} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <RespostaDoSuporte chamadoId={c.id} />
        </div>

        <div className="suporte-pilha">
          <div className="card suporte-secao">
            <p className="overline">Acesso à conta</p>
            {c.autorizacao && c.quemId ? (
              <EntrarComo tenantId={c.redeId} userId={c.quemId} nome={c.quem ?? 'o membro'}
                expiraEm={c.autorizacao.expiraEm} clinico={c.autorizacao.clinico} chamadoId={c.id} />
            ) : (
              <p className="suporte-texto-fraco">
                {c.quemId ? 'Sem autorização vigente: só a clínica libera o acesso.' : 'Quem abriu não está mais na rede.'}
              </p>
            )}
            <AcoesDoChamado chamadoId={c.id} status={c.status} podePedir={!c.autorizacao && !!c.quemId} />
          </div>
          {contexto.length > 0 && (
            <div className="card suporte-secao">
              <p className="overline">Onde a pessoa estava</p>
              <dl className="chamado-contexto">
                {contexto.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
