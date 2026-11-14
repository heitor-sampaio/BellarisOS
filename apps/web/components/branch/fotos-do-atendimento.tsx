'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Plus, FileImage, Send, Smartphone, EyeOff, Loader2, X, Trash2 } from 'lucide-react'
import { UploadForm } from '@/components/branch/client-documents-tab'
import { JanelaModal } from '@/components/shared/janela-modal'
import { enviarDocumentoACliente, deleteClientDocument } from '@/actions/client-documents'
import { useFuso } from '@/components/shared/fuso'

export interface FotoDoAtendimento {
  id:        string
  name:      string
  fileName:  string
  mimeType:  string | null
  createdAt: string
  /** URL assinada (bucket privado). */
  url:       string
  /** Quando foi ao app da cliente ("Enviar à cliente"); nulo = só a equipe vê. */
  enviadoEm?: string | null
  /** Antes, durante ou depois (PR1a: o momento se grava). */
  momento?:  string | null
}

const ROTULO_DO_MOMENTO: Record<string, string> = { ANTES: 'Antes', DURANTE: 'Durante', DEPOIS: 'Depois' }

/**
 * As fotos clínicas DESTE atendimento (A30 da simulação de 2026-10-27): a
 * foto entrava só por Clientes → Documentos, fora do fluxo e sem saber de
 * qual atendimento era. É o mesmo upload dos Documentos (bucket privado,
 * categoria "Foto clínica", a recusa do anexo clínico), ligado ao
 * agendamento. Quem hospeda só monta este cartão para quem vê o prontuário.
 */
export function FotosDoAtendimento({ fotos, clientId, branchId, slug, appointmentId, podeAnexar, podeMexer = podeAnexar, portalNoPlano, embutido = false }: {
  fotos:         FotoDoAtendimento[]
  clientId:      string
  branchId:      string
  slug:          string
  appointmentId: string
  /** Anexar foto nova (a tela do atendimento). */
  podeAnexar:    boolean
  /** Enviar à cliente, tirar do app e excluir (o Prontuário em Gerenciar). */
  podeMexer?:    boolean
  /** O portal do cliente no plano da rede: sem ele, nada de "Enviar à cliente" (F73; a action recusa). */
  portalNoPlano: boolean
  /**
   * Dentro do registro do atendimento, na aba Prontuário (PR1a): sem o cartão
   * próprio, e só aparece quando há foto.
   */
  embutido?:     boolean
}) {
  const fuso = useFuso()
  const router = useRouter()
  const [anexando, setAnexando] = useState(false)
  const fechar = useCallback(() => { setAnexando(false); router.refresh() }, [router])
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: fuso })
  // A foto aberta grande (A37: clicar na miniatura não fazia nada).
  const [vendo, setVendo] = useState<FotoDoAtendimento | null>(null)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [erro, setErro] = useState<{ id: string; msg: string } | null>(null)
  const [excluidas, setExcluidas] = useState<Set<string>>(() => new Set())
  const visiveis = fotos.filter(f => !excluidas.has(f.id))

  // Excluir só MARCA (prontuário não se apaga, §14): sai das telas e o
  // histórico do atendimento diz quem excluiu.
  async function excluir(f: FotoDoAtendimento) {
    if (!confirm('Excluir esta foto do prontuário? Ela sai das telas, e o registro de quem excluiu fica.')) return
    setEnviando(f.id); setErro(null)
    const r = await deleteClientDocument(f.id, slug, clientId)
    setEnviando(null)
    if (r.error) { setErro({ id: f.id, msg: r.error }); return }
    setExcluidas(prev => new Set(prev).add(f.id))
    router.refresh()
  }

  // "Enviar à cliente" (A37): o mesmo envio da aba Documentos da ficha — o
  // app só mostra o que a clínica ENVIA, com o aviso genérico.
  async function alternarEnvio(f: FotoDoAtendimento) {
    setEnviando(f.id); setErro(null)
    const r = await enviarDocumentoACliente(f.id, !f.enviadoEm)
    setEnviando(null)
    if (r.error) { setErro({ id: f.id, msg: r.error }); return }
    router.refresh()
  }

  if (embutido && visiveis.length === 0) return null

  return (
    <div data-fotos-do-atendimento className={embutido ? undefined : 'card'} style={{ padding: 0, overflow: 'hidden' }}>
      <div style={embutido
        ? { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }
        : { padding: '14px 20px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', gap: 10 }}>
        {embutido
          ? <p style={{ flex: 1, fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fotos do atendimento</p>
          : <>
              <Camera size={15} style={{ color: 'var(--brand)' }} />
              <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)', flex: 1 }}>Fotos do atendimento</h3>
            </>}
        {podeAnexar && !anexando && (
          <button type="button" onClick={() => setAnexando(true)} className="btn-secondary" style={{ gap: 6, fontSize: 'var(--text-sm-sz)' }}>
            <Plus size={13} /> Anexar foto
          </button>
        )}
      </div>

      <div style={{ padding: embutido ? 0 : '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {anexando && (
          <UploadForm
            clientId={clientId} branchId={branchId} slug={slug}
            podeAnexarClinico podeAnexarComum={false}
            onClose={fechar}
            categoriaFixa="foto_clinica"
            appointmentId={appointmentId}
            nomePadrao={`Foto clínica — ${hoje}`}
            // A13 da 10ª: antes, durante ou depois — a primeira foto nasce "antes", a seguinte "depois".
            momentos={{
              inicial: visiveis.length ? 'DEPOIS' : 'ANTES',
              opcoes: [['ANTES', 'Antes'], ['DURANTE', 'Durante'], ['DEPOIS', 'Depois']].map(([key, label]) => ({
                key: key!, label: label!, nome: `Foto clínica (${label!.toLowerCase()}) — ${hoje}`,
              })),
            }}
            titulo="Nova foto clínica"
            rotuloDoEnvio="Anexar foto"
            aceita=".jpg,.jpeg,.png,.webp"
          />
        )}

        {visiveis.length === 0 && !anexando && (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>
            {/* PR1a (a revisão de 2026-11-13): a foto mora no PRONTUÁRIO, no
                registro deste atendimento — não mais em Documentos. */}
            Nenhuma foto neste atendimento. Ela fica no prontuário da cliente, no registro deste atendimento.
          </p>
        )}

        {visiveis.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
            {visiveis.map(f => (
              <div key={f.id} data-foto-do-atendimento={f.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                <button type="button" onClick={() => setVendo(f)} aria-label={`Ver ${f.name || f.fileName}`}
                  style={{ aspectRatio: '1 / 1', padding: 0, cursor: 'zoom-in', borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {f.url && (f.mimeType ?? '').startsWith('image/')
                    // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária: o otimizador do Next não serve aqui
                    ? <img src={f.url} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <FileImage size={22} style={{ color: 'var(--text-faint)' }} />}
                </button>
                {/* O título que a profissional deu (J-41): o nome do arquivo
                    ("IMG_0001.png") não diz nada — fica na dica. */}
                {f.momento && ROTULO_DO_MOMENTO[f.momento] && (
                  <span data-momento-da-foto style={{ alignSelf: 'flex-start', fontSize: 'var(--text-overline)', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'var(--brand-soft)', color: 'var(--brand)' }}>
                    {ROTULO_DO_MOMENTO[f.momento]}
                  </span>
                )}
                <span data-titulo-da-foto title={f.fileName} style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name || f.fileName}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-2xs)', fontWeight: 600, color: f.enviadoEm ? 'var(--success)' : 'var(--text-faint)' }}>
                  {f.enviadoEm ? <><Smartphone size={11} aria-hidden="true" /> No app da cliente</> : <><EyeOff size={11} aria-hidden="true" /> Só a equipe vê</>}
                </span>
                {podeMexer && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    {(portalNoPlano || f.enviadoEm) && (
                      <button type="button" onClick={() => alternarEnvio(f)} disabled={enviando === f.id} className="btn-ghost"
                        style={{ padding: '2px 6px', gap: 4, fontSize: 'var(--text-2xs)', fontWeight: 700, color: f.enviadoEm ? 'var(--text-muted)' : 'var(--brand)' }}>
                        {enviando === f.id ? <Loader2 size={11} className="animate-spin" /> : !f.enviadoEm && <Send size={11} aria-hidden="true" />}
                        {f.enviadoEm ? 'Tirar do app' : 'Enviar à cliente'}
                      </button>
                    )}
                    <button type="button" onClick={() => excluir(f)} disabled={enviando === f.id} className="btn-ghost" title="Excluir" aria-label={`Excluir ${f.name || f.fileName}`}
                      style={{ padding: '2px 6px', color: 'var(--warning)' }}>
                      <Trash2 size={11} aria-hidden="true" />
                    </button>
                  </span>
                )}
                {erro?.id === f.id && <span role="alert" style={{ fontSize: 'var(--text-2xs)', color: 'var(--danger)' }}>{erro.msg}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {vendo && (
        <JanelaModal onFechar={() => setVendo(null)} rotulo={vendo.name || vendo.fileName} largura={760}>
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ flex: 1, fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {vendo.name || vendo.fileName}
              </h3>
              <button type="button" onClick={() => setVendo(null)} className="btn-ghost" aria-label="Fechar" style={{ padding: '4px 6px' }}>
                <X size={15} />
              </button>
            </div>
            {vendo.url && (vendo.mimeType ?? '').startsWith('image/')
              // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária
              ? <img src={vendo.url} alt={vendo.name || vendo.fileName} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 'var(--radius-field-token)', background: 'var(--bg-app)' }} />
              : <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>Não foi possível mostrar o arquivo. Ele fica no prontuário da cliente, no registro deste atendimento.</p>}
          </div>
        </JanelaModal>
      )}
    </div>
  )
}
