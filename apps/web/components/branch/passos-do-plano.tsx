'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarPlus, Check } from 'lucide-react'
import { getPassosDoPlano, type PassosDoPlano as Passos, type SessaoDoPasso } from '@/actions/treatment-plans'
import { schedulePlanSession } from '@/actions/appointments'
import { SessionScheduler } from '@/components/branch/treatment-sessions-modal'
import { rotaCliente, rotaNoPortal } from '@/lib/rotas'
import { formatarNoFuso } from '@/lib/formatar-no-fuso'
import { useFuso } from '@/components/shared/fuso'

/**
 * Os passos do plano (PT1a, Bloco Plano de tratamento — a revisão do Heitor de
 * 2026-11-13): a página do plano é o centro, e mostra onde ele está —
 * ① Aceite ② Documentos ③ Contrato e pagamento ④ Sessões. Cada passo diz o
 * estado e leva aonde se faz: o aceite ali mesmo (os botões vêm de quem
 * hospeda o editor, que salva o que está na tela antes); os documentos, à
 * ficha da cliente (o link e o aparelho que já existem); o contrato e o
 * pagamento, à comanda do plano no PDV; as sessões, ao agendar (PT1d).
 *
 * A sessão do plano não cobra nada (PT1e): o dinheiro do plano é o do PDV.
 */

const PASSOS_FEITOS = new Set(['ACCEPTED', 'COMPLETED'])

function plural(n: number, um: string, varios: string) { return n === 1 ? um : varios }

function Chip({ texto, tom }: { texto: string; tom: 'feito' | 'falta' | 'neutro' }) {
  const cor   = tom === 'feito' ? 'var(--success)' : tom === 'falta' ? 'var(--warning)' : 'var(--text-muted)'
  const fundo = tom === 'feito' ? 'var(--success-bg)' : tom === 'falta' ? 'var(--warning-soft)' : 'var(--bg-app)'
  return (
    <span data-estado-do-passo style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-chip-token)', color: cor, background: fundo }}>
      {texto}
    </span>
  )
}

function Passo({ chave, numero, titulo, estado, atual, feito, children }: {
  chave: string; numero: number; titulo: string; estado: ReactNode
  /** O passo da vez: o número preenchido (hierarquia por preenchimento). */
  atual: boolean
  feito: boolean
  children?: ReactNode
}) {
  return (
    <div data-passo={chave} style={{ display: 'flex', gap: 12, padding: '14px 0', borderTop: numero > 1 ? '1px solid var(--hairline)' : 'none' }}>
      <span aria-hidden style={{
        width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 'var(--text-xs-sz)', fontWeight: 800,
        background: atual ? 'var(--brand)' : feito ? 'var(--success-bg)' : 'var(--bg-app)',
        color: atual ? 'var(--on-brand)' : feito ? 'var(--success)' : 'var(--text-muted)',
        border: atual || feito ? 'none' : '1px solid var(--border)',
      }}>
        {feito && !atual ? <Check size={13} /> : numero}
      </span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>{titulo}</h3>
          {estado}
        </div>
        {children}
      </div>
    </div>
  )
}

const texto = (t: ReactNode) => <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>{t}</p>

export function PassosDoPlano({
  planId, slug, unidadesParaAgendar, acoesDoAceite, onMudou,
}: {
  planId: string
  /** O slug da TELA (o portal decide as rotas — lib/rotas). */
  slug: string
  /** As unidades em que a sessão se agenda (as ativas, ao alcance). */
  unidadesParaAgendar: { id: string; name: string }[]
  /** Os botões do aceite ("Aceitar plano", "Cliente vai pensar"): de quem hospeda o editor. */
  acoesDoAceite?: ReactNode
  /** Uma sessão agendada: quem hospeda relê o que mostra (o resumo). */
  onMudou?: () => void
}) {
  const fuso = useFuso()
  const pathname = usePathname()
  const [passos, setPassos] = useState<Passos | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  // A sessão com o agendar aberto; em sequência, o "Agendar todas" segue para a próxima.
  const [agendandoId, setAgendandoId] = useState<string | null>(null)
  const [emSequencia, setEmSequencia] = useState(false)

  const carregar = useCallback(async () => {
    const res = await getPassosDoPlano(planId)
    if (res.passos) { setPassos(res.passos); setErro(null) } else setErro(res.error ?? 'Não foi possível ler o plano.')
    return res.passos ?? null
  }, [planId])

  useEffect(() => {
    let vivo = true
    getPassosDoPlano(planId)
      .then(res => { if (!vivo) return; if (res.passos) setPassos(res.passos); else setErro(res.error ?? 'Não foi possível ler o plano.') })
      .catch(() => { if (vivo) setErro('Não foi possível ler o plano.') })
    return () => { vivo = false }
  }, [planId])

  if (erro) return <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)' }}>{erro}</p>
  if (!passos) return <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>Carregando os passos do plano…</p>

  const aceito    = PASSOS_FEITOS.has(passos.status)
  const cancelado = passos.status === 'CANCELLED' || passos.status === 'REJECTED'
  const { documentos: docs, contagem } = passos
  const docsFeitos = aceito && docs.abertos === 0
  const pago       = aceito && passos.recebido
  const sessoesFeitas = passos.status === 'COMPLETED' || (contagem.total > 0 && contagem.feitas === contagem.total)
  // O passo da vez é o primeiro que falta (a ordem do Heitor: aceitar → assinar → pagar → agendar).
  const atual = cancelado ? null : !aceito ? 'aceite' : !docsFeitos ? 'documentos' : !pago ? 'pagamento' : !sessoesFeitas ? 'sessoes' : null
  const livres = passos.sessoes.filter(s => !s.appointmentId)
  const agendaAqui = passos.status === 'ACCEPTED' && passos.podeAgendar

  function agendarTodas() {
    setEmSequencia(true)
    setAgendandoId(livres[0]?.id ?? null)
  }

  async function agendar(sess: SessaoDoPasso, params: { branchId: string; professionalId: string; scheduledAt: string; roomId: string | null }) {
    const res = await schedulePlanSession({
      planId, sessionId: sess.id, clientId: passos!.clienteId ?? '', procedureId: sess.procedureId,
      // O preço e a duração são os da sessão, lidos no servidor (D5 da 9ª).
      price: 0, durationMin: sess.duracaoMin, slug, ...params,
    })
    if (res.error) return { error: res.error }
    const novos = await carregar()
    onMudou?.()
    const proxima = emSequencia ? novos?.sessoes.find(s => !s.appointmentId && s.id !== sess.id) : undefined
    if (proxima) setAgendandoId(proxima.id)
    else { setAgendandoId(null); setEmSequencia(false) }
    return {}
  }

  const estadoDoAceite = cancelado ? <Chip texto="Cancelado" tom="neutro" />
    : aceito ? <Chip texto={passos.aceitoEm ? `Aceito em ${formatarNoFuso(passos.aceitoEm, 'dd/MM/yyyy', fuso)}` : 'Aceito'} tom="feito" />
    : <Chip texto={passos.status === 'DRAFT' ? 'Rascunho · falta aceitar' : 'Falta aceitar'} tom="falta" />

  const estadoDosDocs = !aceito ? <Chip texto="Depois do aceite" tom="neutro" />
    : docs.total === 0 ? <Chip texto="Nenhum a assinar" tom="feito" />
    : <Chip texto={`${docs.assinados} de ${docs.total} ${plural(docs.total, 'assinado', 'assinados')}`} tom={docs.abertos ? 'falta' : 'feito'} />

  const estadoDoPagamento = !aceito ? <Chip texto="Depois do aceite" tom="neutro" />
    : pago ? <Chip texto="Recebido" tom="feito" />
    : <Chip texto="Falta receber" tom="falta" />

  const contrato = {
    SEM_CONTRATO:  null,
    NO_PDV:        'O contrato do plano sai no PDV, com a forma de pagamento escolhida.',
    FALTA_ASSINAR: 'Contrato emitido: falta a cliente assinar.',
    ASSINADO:      'Contrato assinado.',
    DISPENSADO:    'Contrato dispensado.',
  }[passos.contrato]

  const linkDosDocs = passos.clienteId ? `${rotaCliente(pathname, slug, passos.clienteId)}?aba=documentos` : null
  const linkDoPdv = `${rotaNoPortal(pathname, slug, '/pdv')}?unidade=${passos.unidadeId}${passos.comandaId ? `&comanda=${passos.comandaId}` : ''}`

  return (
    <section data-passos-do-plano className="card" style={{ padding: '6px 20px' }} aria-label="Passos do plano">
      <Passo chave="aceite" numero={1} titulo="Aceite" estado={estadoDoAceite} atual={atual === 'aceite'} feito={aceito}>
        {!aceito && !cancelado && (acoesDoAceite ?? texto('Quem aceita é quem monta o plano (quem atende na unidade) ou quem recebe no caixa.'))}
      </Passo>

      <Passo chave="documentos" numero={2} titulo="Documentos" estado={estadoDosDocs} atual={atual === 'documentos'} feito={docsFeitos}>
        {!aceito
          ? texto('Os termos e documentos do plano ficam prontos no aceite, para a cliente assinar pelo link ou no aparelho.')
          : docs.total > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {texto(docs.abertos
                ? `${docs.abertos} ${plural(docs.abertos, 'documento falta', 'documentos faltam')} assinar${docs.faltamDados ? ` (${docs.faltamDados} com dados do cadastro faltando)` : ''}: pelo link ou no aparelho, na ficha da cliente.`
                : 'Todos assinados.')}
              {linkDosDocs && (
                <Link href={linkDosDocs} className={docs.abertos && atual === 'documentos' ? 'btn-primary' : 'btn-secondary'} style={{ textDecoration: 'none' }}>
                  Ver documentos
                </Link>
              )}
            </div>
          )}
      </Passo>

      <Passo chave="pagamento" numero={3} titulo="Contrato e pagamento" estado={estadoDoPagamento} atual={atual === 'pagamento'} feito={pago}>
        {!aceito ? texto('No aceite, a comanda do plano vai ao PDV: lá se escolhe a forma, a cliente assina o contrato e paga.') : (
          <>
            {contrato && texto(contrato)}
            {!pago && !cancelado && (
              <div data-plano-falta-receber style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderRadius: 'var(--radius-field-token)', background: 'var(--brand-soft)', border: '1px solid var(--brand-soft-border)' }}>
                <p style={{ flex: 1, minWidth: 220, fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
                  <b>Plano aceito. Falta receber:</b> a comanda do plano está no PDV — lá se escolhe a forma, a cliente assina o contrato e paga.
                </p>
                {passos.podeReceber && (
                  <Link className="btn-primary" style={{ textDecoration: 'none' }} href={linkDoPdv}>Receber no PDV</Link>
                )}
              </div>
            )}
          </>
        )}
      </Passo>

      <Passo chave="sessoes" numero={4} titulo="Sessões" atual={atual === 'sessoes'} feito={sessoesFeitas}
        estado={<Chip tom={sessoesFeitas ? 'feito' : 'neutro'}
          texto={`${contagem.agendadas} de ${contagem.total} ${plural(contagem.total, 'agendada', 'agendadas')} · ${contagem.feitas} ${plural(contagem.feitas, 'realizada', 'realizadas')}`} />}>
        {!aceito ? texto('As sessões se agendam depois do aceite — a qualquer momento, uma a uma ou todas de uma vez. A sessão não cobra nada: o plano se paga no PDV.') : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {passos.sessoes.map(s => {
              const feita = s.apptStatus === 'COMPLETED'
              const quando = s.scheduledAt ? formatarNoFuso(s.scheduledAt, "dd/MM 'às' HH:mm", fuso) : null
              return (
                <div key={s.id} data-sessao-do-plano>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)', minWidth: 70 }}>Sessão {s.numero}</span>
                    <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', flex: 1, minWidth: 140 }}>{s.procedimentos}</span>
                    <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 600, color: feita ? 'var(--success)' : s.appointmentId ? 'var(--info)' : 'var(--text-faint)' }}>
                      {feita ? `Realizada${quando ? ` em ${quando}` : ''}`
                        : s.appointmentId ? `Agendada${quando ? ` para ${quando}` : ''}${s.profissional ? ` · ${s.profissional}` : ''}`
                        : 'Não agendada'}
                    </span>
                    {!s.appointmentId && agendaAqui && agendandoId !== s.id && (
                      <button type="button" className="btn-secondary" onClick={() => { setEmSequencia(false); setAgendandoId(s.id) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm-sz)' }}>
                        <CalendarPlus size={13} /> Agendar
                      </button>
                    )}
                  </div>
                  {agendandoId === s.id && (
                    <SessionScheduler
                      key={s.id}
                      branches={unidadesParaAgendar}
                      currentBranchId={unidadesParaAgendar.some(u => u.id === passos.unidadeId) ? passos.unidadeId : (unidadesParaAgendar[0]?.id ?? '')}
                      procedimento={s.procedureId ? { id: s.procedureId, nome: s.procedimentos, duracaoMin: s.duracaoMin } : null}
                      onCancel={() => { setAgendandoId(null); setEmSequencia(false) }}
                      onSave={params => agendar(s, params)}
                    />
                  )}
                </div>
              )
            })}
            {/* "Agendar todas" abre o agendar da primeira livre e, salva, segue para a próxima. */}
            {agendaAqui && livres.length > 0 && !agendandoId && (
              <button type="button" className="btn-primary" onClick={agendarTodas}
                style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 7 }}>
                <CalendarPlus size={14} /> Agendar todas
              </button>
            )}
            {passos.status === 'ACCEPTED' && !passos.podeAgendar && livres.length > 0 && texto('Agendar as sessões é de quem tem a Agenda em Gerenciar.')}
          </div>
        )}
      </Passo>
    </section>
  )
}
