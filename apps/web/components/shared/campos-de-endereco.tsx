'use client'

import { useId, useState, type CSSProperties } from 'react'
import { Loader2 } from 'lucide-react'
import { fetchCep } from '@/lib/cep'

/**
 * O endereço da ficha: CEP (que preenche logradouro, bairro, cidade e UF),
 * logradouro, número, complemento, bairro, cidade e UF. UM componente para o
 * Novo cliente e a aba Dados (A29 da 22ª = A39 da 23ª simulação, 2026-11-17:
 * o Novo cliente não tinha endereço, e o contrato do pacote precisa dele).
 *
 * Controlado: quem usa guarda o valor. Com `comNomes`, os campos levam os
 * `name` que o `addClient` lê (`enderecoDoFormulario`).
 */
export interface EnderecoNaTela {
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

export const ENDERECO_VAZIO: EnderecoNaTela = { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' }

export function mascaraDoCep(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8)
  return d.replace(/(\d{5})(\d)/, '$1-$2')
}

export function CamposDeEndereco({ valor, onChange, comNomes, estiloDoCampo, classeDoCampo, estiloDoRotulo }: {
  valor: EnderecoNaTela
  onChange: (novo: EnderecoNaTela) => void
  comNomes?: boolean
  estiloDoCampo?: CSSProperties
  classeDoCampo?: string
  estiloDoRotulo?: CSSProperties
}) {
  const id = useId()
  const [buscando, setBuscando] = useState(false)
  const rotulo: CSSProperties = estiloDoRotulo ?? {
    fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 5, display: 'block', letterSpacing: '0.04em',
  }
  const campo = (nome: keyof EnderecoNaTela, extra?: CSSProperties) => ({
    id: `${id}-${nome}`,
    className: classeDoCampo,
    style: { ...estiloDoCampo, ...extra },
    value: valor[nome],
  })
  const mudar = (parte: Partial<EnderecoNaTela>) => onChange({ ...valor, ...parte })

  async function mudarCep(v: string) {
    const cep = mascaraDoCep(v)
    mudar({ cep })
    if (cep.replace(/\D/g, '').length !== 8) return
    setBuscando(true)
    const achado = await fetchCep(cep)
    setBuscando(false)
    if (achado) {
      onChange({ ...valor, cep, logradouro: achado.street, bairro: achado.neighborhood, cidade: achado.city ?? '', uf: achado.uf ?? '' })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="form-2col">
        <div>
          <label htmlFor={`${id}-cep`} style={rotulo}>CEP</label>
          <div style={{ position: 'relative' }}>
            <input {...campo('cep', { paddingRight: buscando ? 32 : undefined })} name={comNomes ? 'zip_code' : undefined}
              type="text" inputMode="numeric" placeholder="00000-000" onChange={e => void mudarCep(e.target.value)} />
            {buscando && <Loader2 size={13} aria-hidden style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', animation: 'spin 1s linear infinite' }} />}
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-bairro`} style={rotulo}>Bairro</label>
          <input {...campo('bairro')} name={comNomes ? 'neighborhood' : undefined} type="text" placeholder="Bairro"
            onChange={e => mudar({ bairro: e.target.value })} />
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-logradouro`} style={rotulo}>Logradouro</label>
        <input {...campo('logradouro')} name={comNomes ? 'address' : undefined} type="text" placeholder="Rua, Avenida…"
          onChange={e => mudar({ logradouro: e.target.value })} />
      </div>

      <div className="form-2col">
        <div>
          <label htmlFor={`${id}-numero`} style={rotulo}>Número</label>
          <input {...campo('numero')} name={comNomes ? 'address_number' : undefined} type="text" placeholder="Nº"
            onChange={e => mudar({ numero: e.target.value })} />
        </div>
        <div>
          <label htmlFor={`${id}-complemento`} style={rotulo}>Complemento</label>
          <input {...campo('complemento')} name={comNomes ? 'address_complement' : undefined} type="text" placeholder="Apto, Sala…"
            onChange={e => mudar({ complemento: e.target.value })} />
        </div>
      </div>

      <div className="form-2col">
        <div>
          <label htmlFor={`${id}-cidade`} style={rotulo}>Cidade</label>
          <input {...campo('cidade')} name={comNomes ? 'city' : undefined} type="text" placeholder="Cidade"
            onChange={e => mudar({ cidade: e.target.value })} />
        </div>
        <div>
          <label htmlFor={`${id}-uf`} style={rotulo}>UF</label>
          <input {...campo('uf', { textTransform: 'uppercase' })} name={comNomes ? 'state' : undefined} type="text" placeholder="UF" maxLength={2}
            onChange={e => mudar({ uf: e.target.value.toUpperCase() })} />
        </div>
      </div>
    </div>
  )
}
