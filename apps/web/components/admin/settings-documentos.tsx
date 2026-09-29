'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, FileSignature, FileText, ScrollText } from 'lucide-react'
import { EditorDeDocumento, type ModeloEmEdicao } from '@/components/admin/editor-de-documento'
import { definirModeloAtivo, definirEnvioDoLinkPelaConversa } from '@/actions/modelos-de-documento'
import { SegSelect } from '@/components/shared/seg-select'
import type { TipoDeModelo } from '@/lib/documentos/variaveis'

/**
 * Configurações → Documentos: os modelos de termo e contrato da rede.
 *
 * Três grupos, porque cada um tem um lugar diferente no fluxo: o termo e o
 * contrato se ligam ao PROCEDIMENTO (no cadastro dele); o contrato de plano é
 * da rede, um só ativo, e vale para todo plano de tratamento.
 */

export interface ItemDeModelo extends ModeloEmEdicao {
  ativo:         boolean
  procedimentos: number
}

type Vista =
  | { modo: 'lista' }
  | { modo: 'novo'; tipo: TipoDeModelo }
  | { modo: 'editar'; modelo: ItemDeModelo }

const GRUPOS: { tipo: TipoDeModelo; titulo: string; dica: string; icone: typeof FileText }[] = [
  { tipo: 'TERMO',          titulo: 'Termos de consentimento', icone: FileSignature,
    dica: 'Ligue ao procedimento no cadastro dele. No plano, o cliente assina o termo de cada procedimento.' },
  { tipo: 'CONTRATO',       titulo: 'Contratos do procedimento', icone: FileText,
    dica: 'Assinados no atendimento avulso do procedimento a que estão ligados.' },
  { tipo: 'CONTRATO_PLANO', titulo: 'Contrato de plano', icone: ScrollText,
    dica: 'Assinado no fechamento de todo plano de tratamento, com os procedimentos, o valor e a forma de pagamento. Um só ativo.' },
]

const MOMENTO = { AGENDAMENTO: 'nasce ao agendar', INICIO_ATENDIMENTO: 'nasce no início do atendimento' } as const

export function SettingsDocumentos({ modelos, imagens, envio }: {
  modelos: ItemDeModelo[]
  /** URLs temporárias das imagens usadas nos modelos. */
  imagens: Record<string, string>
  /** Mandar o link de assinatura pela conversa do inbox — escolha da rede. */
  envio:   { pelaConversa: boolean; podeMudar: boolean }
}) {
  const router = useRouter()
  const [vista, setVista] = useState<Vista>({ modo: 'lista' })
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  function pronto() {
    setVista({ modo: 'lista' })
    router.refresh()
  }

  async function alternar(m: ItemDeModelo) {
    if (m.ativo && m.procedimentos > 0 &&
        !confirm(`"${m.nome}" está ligado a ${m.procedimentos} procedimento${m.procedimentos > 1 ? 's' : ''}. Desativado, ele deixa de nascer em atendimento novo. Desativar?`)) return
    setErro(null)
    setOcupado(m.id)
    const r = await definirModeloAtivo(m.id, !m.ativo)
    setOcupado(null)
    if (r.error) setErro(r.error)
    else router.refresh()
  }

  if (vista.modo !== 'lista') {
    const existente = vista.modo === 'editar' ? vista.modelo : null
    return (
      <div className="card" style={{ padding: '20px 18px' }}>
        <EditorDeDocumento
          existente={existente}
          tipoInicial={vista.modo === 'novo' ? vista.tipo : existente!.tipo}
          origemInicial="EDITOR"
          imagens={imagens}
          onPronto={pronto}
          onVoltar={() => setVista({ modo: 'lista' })}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', maxWidth: 640 }}>
        Monte aqui os termos e contratos que o cliente assina — escrevendo no sistema, com os dados do
        cliente preenchidos na hora, ou enviando o PDF da clínica. A assinatura é eletrônica e fica
        registrada com data, hora e um código de verificação.
      </p>

      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}

      {GRUPOS.map(g => {
        const doGrupo = modelos.filter(m => m.tipo === g.tipo)
        const Icone = g.icone
        return (
          <section key={g.tipo} aria-label={g.titulo} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>{g.titulo}</h2>
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2, maxWidth: 560 }}>{g.dica}</p>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setVista({ modo: 'novo', tipo: g.tipo })}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={14} /> {g.tipo === 'TERMO' ? 'Novo termo' : g.tipo === 'CONTRATO' ? 'Novo contrato' : 'Novo contrato de plano'}
              </button>
            </div>

            {doGrupo.length === 0 ? (
              <div className="card" style={{ padding: '18px 20px' }}>
                <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                  {g.tipo === 'CONTRATO_PLANO'
                    ? 'Sem contrato de plano, o fechamento do plano pede só os termos dos procedimentos.'
                    : 'Nenhum modelo ainda.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {doGrupo.map(m => (
                  <div key={m.id} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, opacity: m.ativo ? 1 : 0.7 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icone size={17} color="var(--brand)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 'var(--weight-bold)', color: 'var(--text)', fontSize: 'var(--text-base-sz)', overflowWrap: 'anywhere' }}>{m.nome}</p>
                      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                        {[
                          m.origem === 'ARQUIVO' ? 'PDF enviado' : 'Escrito no sistema',
                          `versão ${m.versao}`,
                          m.momento ? MOMENTO[m.momento] : null,
                          m.exigencia === 'BLOQUEIA' ? 'bloqueia sem assinatura' : 'só avisa',
                          g.tipo !== 'CONTRATO_PLANO'
                            ? `${m.procedimentos} procedimento${m.procedimentos === 1 ? '' : 's'}`
                            : null,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button
                      type="button" onClick={() => alternar(m)} disabled={ocupado === m.id}
                      aria-pressed={m.ativo}
                      className={m.ativo ? 'chip chip-success' : 'chip chip-muted'}
                      style={{ cursor: 'pointer', border: 0 }}
                    >
                      {m.ativo ? 'Ativo' : 'Inativo'}
                    </button>
                    <button type="button" title="Editar" aria-label={`Editar ${m.nome}`}
                      onClick={() => setVista({ modo: 'editar', modelo: m })} style={botaoDeIcone}>
                      <Pencil size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}

      <EnvioDoLink {...envio} />
    </div>
  )
}

/**
 * Por onde a equipe manda o link de assinatura. Nasce em "só pelo aparelho"
 * (copiar o link, abrir no WhatsApp de quem clicou); ligado, a ficha ganha
 * "Enviar pela conversa", que sai pelo WhatsApp da clínica, no inbox.
 */
function EnvioDoLink({ pelaConversa, podeMudar }: { pelaConversa: boolean; podeMudar: boolean }) {
  const router = useRouter()
  const [valor, setValor] = useState(pelaConversa)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function escolher(ligado: boolean) {
    if (ligado === valor) return
    setErro(null)
    setSalvando(true)
    setValor(ligado)
    const r = await definirEnvioDoLinkPelaConversa(ligado)
    setSalvando(false)
    if (r.error) { setErro(r.error); setValor(!ligado); return }
    router.refresh()
  }

  return (
    <section aria-label="Envio do link de assinatura" className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>Envio do link de assinatura</h2>
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2, maxWidth: 560 }}>
          Vale para a rede inteira. O link é de uso único, vale 7 dias, e o cliente confirma o CPF (ou a data de nascimento) antes de ver o documento.
        </p>
      </div>
      {podeMudar ? (
        <SegSelect
          options={[{ key: 'aparelho', label: 'Só pelo aparelho' }, { key: 'conversa', label: 'Também pela conversa' }]}
          value={valor ? 'conversa' : 'aparelho'}
          onSelect={k => { if (!salvando) void escolher(k === 'conversa') }}
          ariaLabel="Por onde a equipe manda o link de assinatura"
        />
      ) : (
        <strong style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{valor ? 'Também pela conversa' : 'Só pelo aparelho'}</strong>
      )}
      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', lineHeight: 1.5, maxWidth: 640 }}>
        {valor
          ? 'Na ficha do cliente, "Enviar pela conversa" manda o link pelo WhatsApp da clínica, na conversa em que o cliente falou por último — pelo número que ele conhece, com o nome de quem enviou. Na API oficial, fora da janela de 24h (o cliente não escreveu no último dia) a mensagem não sai: a equipe copia o link ou abre no WhatsApp do aparelho.'
          : 'A equipe copia o link ou abre no WhatsApp do próprio aparelho. Nada sai pelo WhatsApp da clínica.'}
      </p>
      {!podeMudar && <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>Quem muda é quem administra a rede.</p>}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
    </section>
  )
}

const botaoDeIcone: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text-muted)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
}
