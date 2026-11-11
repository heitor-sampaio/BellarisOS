'use client'

import { useActionState, useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { maskCPFouCNPJDigitando, maskTelefoneDigitando } from '@estetica-os/utils'
import { atualizarDadosDaRede, type DadosDaRede } from '@/actions/rede'
import { rotuloDaSituacao } from '@/lib/redes/situacao'
import { nomeDoPlanoNaTela } from '@/lib/redes/texto-do-plano'
import { useFala } from '@/components/shared/uma-unidade'
import { O_QUE_A_CLIENTE_AVALIA, ROTULO_DO_QUE_AVALIA } from '@/lib/avaliacao/notas'
import { useFuso } from '@/components/shared/fuso'

/**
 * Configurações → Geral: os dados da própria rede.
 *
 * A aba existia dizendo "em breve" desde que a tela nasceu, e o dado que ela
 * deveria mostrar já estava no banco — o nome, o documento e o contato da rede
 * só podiam ser mudados por SQL. Pedido do Heitor em 2026-09-25.
 *
 * O que NÃO se edita aqui está na tela, em cinza, e não escondido:
 *
 * - **o endereço do app da cliente** — o da UNIDADE (`/<unidade>/cliente`),
 *   inteiro (A4 da 6ª simulação: aqui aparecia o identificador da rede,
 *   `tenants.slug`, que não abre tela nenhuma, e a dona não sabia qual dar à
 *   cliente);
 * - **o plano**, que quem define é a assinatura.
 */
export function SettingsGeral({ rede, podeEditar, naRede = true, appDaCliente = [] }: {
  rede: DadosDaRede; podeEditar: boolean; /** A aba Assinatura só existe no portal da rede. */ naRede?: boolean
  /** O endereço do app da cliente, por unidade ativa (A4) — inteiro, para mandar. */
  appDaCliente?: { unidade: string; url: string }[]
}) {
  const fuso = useFuso()
  const [estado, enviar, enviando] = useActionState(atualizarDadosDaRede, undefined)
  const [salvo, setSalvo] = useState(false)

  // O "salvo" é um aviso, não um estado: ele some sozinho, senão fica na tela
  // dizendo que algo acabou de acontecer muito depois de ter acontecido.
  // Acender o aviso é no render, quando chega um resultado novo; o efeito só
  // cuida de apagá-lo (e recomeça a contagem a cada salvamento).
  const [estadoVisto, setEstadoVisto] = useState(estado)
  if (estadoVisto !== estado) {
    setEstadoVisto(estado)
    if (estado && 'success' in estado) setSalvo(true)
  }
  useEffect(() => {
    if (!salvo) return
    const id = setTimeout(() => setSalvo(false), 4000)
    return () => clearTimeout(id)
  }, [salvo, estado])

  const erro = estado && 'error' in estado ? estado.error : null

  // O documento e o telefone com a máscara ENQUANTO se digita (J-2): eram
  // crus ("11222333000181", "5548999990000"). O servidor grava o documento só
  // com os dígitos e o telefone no formato que aparece aqui — salvar não o muda.
  const [documento, setDocumento] = useState(maskCPFouCNPJDigitando(rede.document ?? ''))
  const [telefone, setTelefone] = useState(maskTelefoneDigitando(rede.phone ?? ''))
  // A clínica de uma unidade não fala "rede" (F8).
  const fala = useFala()

  return (
    <form action={enviar} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
          {fala('Dados da rede')}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 3 }}>
          Aparecem nos documentos e nas mensagens que a clínica manda.
        </p>
      </div>

      <div className="grade-de-campos">
        <Campo rotulo={fala('Nome da rede')} obrigatorio>
          <input name="name" className="field" defaultValue={rede.name} disabled={!podeEditar} required />
        </Campo>

        <Campo rotulo="CNPJ ou CPF">
          <input name="document" className="field" value={documento} disabled={!podeEditar}
            onChange={e => setDocumento(maskCPFouCNPJDigitando(e.target.value))}
            inputMode="numeric" placeholder="00.000.000/0000-00" />
        </Campo>

        <Campo rotulo="E-mail">
          <input name="email" type="email" className="field" defaultValue={rede.email ?? ''} disabled={!podeEditar} />
        </Campo>

        <Campo rotulo="Telefone">
          <input name="phone" className="field" value={telefone} disabled={!podeEditar}
            onChange={e => setTelefone(maskTelefoneDigitando(e.target.value))}
            inputMode="tel" placeholder="(00) 00000-0000" />
        </Campo>

        <Campo rotulo="Site">
          <input name="website" className="field" defaultValue={rede.website ?? ''} disabled={!podeEditar}
            placeholder="bellaris.com.br" />
        </Campo>

        <Campo rotulo="Prazo do portal (horas)" dica="Até quantas horas antes a cliente cancela ou remarca pelo app. Depois, só falando com a clínica.">
          <input name="portal_prazo_alteracao_horas" type="number" min={0} max={720} step={1} className="field"
            defaultValue={rede.prazoPortalHoras} disabled={!podeEditar} inputMode="numeric" />
        </Campo>

        <Campo rotulo="O que a cliente avalia" dica="Ao confirmar o atendimento pelo app. A nota do atendimento vale para a profissional; a de cada procedimento, para o ranking de procedimentos.">
          <select name="avaliacao_o_que" className="field" defaultValue={rede.oQueAClienteAvalia} disabled={!podeEditar}>
            {O_QUE_A_CLIENTE_AVALIA.map(o => <option key={o} value={o}>{ROTULO_DO_QUE_AVALIA[o]}</option>)}
          </select>
        </Campo>

        <Campo rotulo="Validade do plano proposto (dias)" dica="O app da cliente mostra o plano proposto com “Válido até”, contando desde quando foi proposto.">
          <input name="plano_validade_dias" type="number" min={1} max={365} step={1} className="field"
            defaultValue={rede.validadeDoPlanoDias} disabled={!podeEditar} inputMode="numeric" />
        </Campo>
      </div>

      {/* O que não se edita, à vista. */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 20,
        borderTop: '1px solid var(--hairline)', paddingTop: 14,
      }}>
        {/* A4 da 6ª simulação: era o identificador da rede ("/{rede.slug}"), que
            não abre tela nenhuma, e a dona não sabia qual endereço dar à cliente. */}
        <div data-app-da-cliente style={{ minWidth: 150, maxWidth: '100%' }}>
          <p className="overline" style={{ marginBottom: 2 }}>App da cliente</p>
          {appDaCliente.map(a => (
            <p key={a.url} style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)', overflowWrap: 'anywhere' }}>
              {appDaCliente.length > 1 && <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{a.unidade}: </span>}
              {a.url}
            </p>
          ))}
          <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 2, maxWidth: 320 }}>
            É o endereço que se dá à cliente: ela entra com o e-mail (a senha inicial é o CPF ou, sem ele, o passaporte ou o RNE), e o acesso se cria na ficha dela.
            {appDaCliente.length > 1 ? ' Qualquer unidade abre a mesma ficha.' : ''}
          </p>
        </div>
        <SoLeitura rotulo="Plano" valor={nomeDoPlanoNaTela(rede.planName, rede.planStatus)}
          porque={`${rotuloDaSituacao(rede.planStatus)}. ${naRede ? 'Veja faturas e pagamento na aba Assinatura.' : fala('A assinatura fica com quem administra a rede.')}`} />
        <SoLeitura rotulo={fala('Rede criada em')}
          valor={new Date(rede.criadaEm).toLocaleDateString('pt-BR', { timeZone: fuso })} />
      </div>

      {erro && (
        <p style={{
          fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--danger)',
          background: 'var(--danger-soft)', border: '1px solid var(--danger-border)',
          borderRadius: 8, padding: '8px 12px',
        }}>
          {erro}
        </p>
      )}

      {podeEditar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? <><Loader2 size={14} className="animate-spin" /> Salvando…</> : 'Salvar'}
          </button>
          {salvo && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--success)',
            }}>
              <Check size={14} /> Salvo
            </span>
          )}
        </div>
      )}
    </form>
  )
}

function Campo({ rotulo, dica, obrigatorio, children }: {
  rotulo: string
  dica?: string
  obrigatorio?: boolean
  children: React.ReactNode
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{
        fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)',
        color: 'var(--text-muted)', letterSpacing: '0.04em',
      }}>
        {rotulo}{obrigatorio && <span style={{ color: 'var(--brand)' }}> *</span>}
      </span>
      {children}
      {dica && (
        <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{dica}</span>
      )}
    </label>
  )
}

function SoLeitura({ rotulo, valor, porque }: { rotulo: string; valor: string; porque?: string }) {
  return (
    <div style={{ minWidth: 150 }}>
      <p className="overline" style={{ marginBottom: 2 }}>{rotulo}</p>
      <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>{valor}</p>
      {porque && (
        <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 2, maxWidth: 260 }}>
          {porque}
        </p>
      )}
    </div>
  )
}
