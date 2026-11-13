'use client'

import { useState } from 'react'

export type FornecedorDaLista = { id: string; nome: string }

const NOVO = '__novo'
const chave = (v: string) => v.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')

/**
 * O fornecedor escolhido da LISTA da rede (C76, D4 do levantamento das regras,
 * 2026-11-11: "funciona igual a categoria, mas fica disponível para escolha
 * também na adição do estoque"), com "+ Novo fornecedor" ali mesmo — a nota na
 * mão não espera a rede (princípio 7). O novo vai como texto (`nomeTexto`) e o
 * banco o põe na lista (`private.fornecedor_da_lista`); o escolhido, como id
 * (`nomeId`). A Entrada, o estoque inicial e o cadastro do produto usam este.
 */
export function CampoFornecedor({
  id, rotulo = 'Fornecedor', fornecedores, inicial, nomeId = 'fornecedor_id', nomeTexto = 'fornecedor', dica,
}: {
  id:           string
  rotulo?:      string
  fornecedores: FornecedorDaLista[]
  /** O que vem preenchido: o id da lista ou um nome (o da nota anterior). */
  inicial?:     { id?: string | null; nome?: string | null }
  nomeId?:      string
  nomeTexto?:   string
  /**
   * A14 da 14ª (princípio 7): o cadastro do produto tem DOIS fornecedores — o
   * de costume e o desta entrada — e nada dizia a diferença. A dica, embaixo.
   */
  dica?:        { tipo: 'costume' | 'entrada'; texto: string }
}) {
  const [escolha, setEscolha] = useState<string>(() => {
    if (inicial?.id && fornecedores.some(f => f.id === inicial.id)) return inicial.id
    const pelo = inicial?.nome ? fornecedores.find(f => chave(f.nome) === chave(inicial.nome!)) : null
    if (pelo) return pelo.id
    return inicial?.nome?.trim() ? NOVO : ''
  })
  const [novo, setNovo] = useState(() => (escolha === NOVO ? inicial?.nome?.trim() ?? '' : ''))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label htmlFor={id} className="field-label">{rotulo}</label>
      <select id={id} className="field" value={escolha} onChange={e => setEscolha(e.target.value)} data-campo-fornecedor>
        <option value="">Sem fornecedor</option>
        {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
        <option value={NOVO}>+ Novo fornecedor</option>
      </select>
      {escolha && escolha !== NOVO && <input type="hidden" name={nomeId} value={escolha} />}
      {escolha === NOVO && (
        <input name={nomeTexto} type="text" maxLength={120} className="field" required autoFocus={!inicial?.nome}
          aria-label="Nome do novo fornecedor" placeholder="Nome do novo fornecedor"
          value={novo} onChange={e => setNovo(e.target.value)} />
      )}
      {dica && (
        <p data-dica-fornecedor={dica.tipo} style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>{dica.texto}</p>
      )}
    </div>
  )
}
