'use client'

import { SettingsForms, type AdminFormItem } from '@/components/admin/settings-forms'
import {
  createAttendanceForm, updateAttendanceForm, deleteAttendanceForm, setAttendanceFormActive,
} from '@/actions/attendance-forms'

export type AdminAttendanceForm = AdminFormItem

export function SettingsAttendance({ forms }: { forms: AdminAttendanceForm[] }) {
  return (
    <SettingsForms
      forms={forms}
      actions={{
        create:    createAttendanceForm,
        update:    updateAttendanceForm,
        remove:    deleteAttendanceForm,
        setActive: setAttendanceFormActive,
      }}
      labels={{
        description:   'Monte fichas de atendimento e selecione uma ao criar ou editar um procedimento. A ficha é preenchida pelo profissional durante o atendimento.',
        newButton:     'Nova ficha',
        emptyTitle:    'Nenhuma ficha ainda',
        emptySubtitle: 'Crie a primeira ficha de atendimento.',
        deleteConfirm: name => `Excluir a ficha "${name}"? Procedimentos que a usam ficarão sem ficha.`,
      }}
    />
  )
}
