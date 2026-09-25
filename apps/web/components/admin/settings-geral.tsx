'use client'

import { useActionState, useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { atualizarDadosDaRede, type DadosDaRede } from '@/actions/rede'

/**
 * Configurações → Geral: os dados da própria rede.
 *
 * A aba existia dizendo "em breve" desde que a tela nasceu, e o dado que ela
 * deveria mostrar já estava no banco — o nome, o documento e o contato da rede
 * só podiam ser mudados por SQL. Pedido do Heitor em 2026-09-25.
 *
 * O que NÃO se edita aqui está na tela, em cinza, e não escondido:
 *
 * - **o endereço do portal** (`slug`), porque ele está em link já mandado, em
 *   QR Code impresso e no que o cliente guardou no navegador. Trocá-lo por um
 *   campo de formulário quebraria tudo isso em silêncio;
 * - **o plano**, que quem define é a assinatura.
 */
export function SettingsGeral({ rede, podeEditar }: { rede: DadosDaRede; podeEditar: boolean }) {
  const [estado, enviar, enviando] = useActionState(atualizarDadosDaRede, undefined)
  const [salvo, setSalvo] = useState(false)

  // O "salvo" é um aviso, não um estado: ele some sozinho, senão fica na tela
  // dizendo que algo acabou de acontecer muito depois de ter acontecido.
  useEffect(() => {
    if (estado && 'success' in estado) {
      setSalvo(true)
      const id = setTimeout(() => setSalvo(false), 4000)
      return () => clearTimeout(id)
    }
  }, [estado])

  const erro = estado && 'error' in estado ? estado.error : null

  return (
    <form action={enviar} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
          Dados da rede
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 3 }}>
          Aparecem nos documentos e nas mensagens que a clínica manda.
        </p>
      </div>

      <div className="grade-de-campos">
        <Campo rotulo="Nome da rede" obrigatorio>
          <input name="name" className="field" defaultValue={rede.name} disabled={!podeEditar} required />
        </Campo>

        <Campo rotulo="CNPJ ou CPF" dica="Só os números — a máscara entra na exibição.">
          <input name="document" className="field" defaultValue={rede.document ?? ''} disabled={!podeEditar}
            inputMode="numeric" placeholder="00000000000000" />
        </Campo>

        <Campo rotulo="E-mail">
          <input name="email" type="email" className="field" defaultValue={rede.email ?? ''} disabled={!podeEditar} />
        </Campo>

        <Campo rotulo="Telefone">
          <input name="phone" className="field" defaultValue={rede.phone ?? ''} disabled={!podeEditar}
            inputMode="tel" placeholder="(00) 00000-0000" />
        </Campo>

        <Campo rotulo="Site">
          <input name="website" className="field" defaultValue={rede.website ?? ''} disabled={!podeEditar}
            placeholder="bellaris.com.br" />
        </Campo>
      </div>

      {/* O que não se edita, à vista. */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 20,
        borderTop: '1px solid var(--hairline)', paddingTop: 14,
      }}>
        <SoLeitura rotulo="Endereço do portal" valor={`/${rede.slug}`}
          porque="Está em links já enviados — mudar é migração, não edição." />
        <SoLeitura rotulo="Plano" valor={rede.planName ?? '—'}
          porque={`Situação: ${rede.planStatus ?? '—'}. Definido pela assinatura.`} />
        <SoLeitura rotulo="Rede criada em"
          valor={new Date(rede.criadaEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} />
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
