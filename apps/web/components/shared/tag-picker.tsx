'use client'

import { Tag as TagIcon } from 'lucide-react'
import { PickerCompacto } from '@/components/shared/picker-compacto'

/**
 * Escolha de tags a partir do que a rede já usa.
 *
 * Não cria tag: quem atende escolhe entre as existentes, senão a mesma ideia
 * vira "botox", "Botox" e "botox " em três atendimentos e o filtro por tag
 * deixa de servir. Criar e renomear é na tela de Oportunidades.
 */
export function TagPicker({
  selecionadas, disponiveis, disabled = false, onChange,
}: {
  selecionadas: string[]
  disponiveis:  string[]
  disabled?:    boolean
  onChange:     (tags: string[]) => void
}) {
  return (
    <PickerCompacto
      icone={<TagIcon size={12} />}
      rotuloBotao={selecionadas.length > 0 ? 'Editar tags' : 'Adicionar tag'}
      opcoes={disponiveis.map(t => ({ valor: t, rotulo: t }))}
      selecionadas={selecionadas}
      multiplo
      disabled={disabled}
      textoListaVazia="A rede ainda não tem tags. Elas são criadas na tela de Oportunidades."
      onEscolher={t => onChange(
        selecionadas.includes(t)
          ? selecionadas.filter(x => x !== t)
          : [...selecionadas, t],
      )}
    />
  )
}
