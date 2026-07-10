'use client'

import { SettingsForms, type AdminFormItem } from '@/components/admin/settings-forms'
import {
  createAnamnesisForm, updateAnamnesisForm, deleteAnamnesisForm, setAnamnesisFormActive,
} from '@/actions/anamnesis-forms'

// Retrocompatível: tipo antigo mantido para o page.tsx.
export type AdminAnamnesisForm = AdminFormItem

export function SettingsAnamnesis({ forms }: { forms: AdminAnamnesisForm[] }) {
  return (
    <SettingsForms
      forms={forms}
      actions={{
        create:    createAnamnesisForm,
        update:    updateAnamnesisForm,
        remove:    deleteAnamnesisForm,
        setActive: setAnamnesisFormActive,
      }}
      labels={{
        description:   'Monte fichas de anamnese e selecione uma ao criar ou editar um procedimento. A ficha é preenchida pelo profissional durante o atendimento.',
        newButton:     'Nova ficha',
        emptyTitle:    'Nenhuma ficha ainda',
        emptySubtitle: 'Crie a primeira ficha de anamnese.',
        deleteConfirm: name => `Excluir a ficha "${name}"? Procedimentos que a usam ficarão sem ficha.`,
      }}
    />
  )
}
