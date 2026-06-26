export { RegisterSchema, LoginSchema, ClientLoginSchema, ClientMagicLinkSchema, ResetPasswordSchema } from './auth'
export type { RegisterInput, LoginInput, ClientLoginInput } from './auth'

export { CreateClientSchema, UpdateClientSchema } from './client'
export type { CreateClientInput, UpdateClientInput } from './client'

export {
  CreateAppointmentSchema,
  UpdateAppointmentSchema,
  CancelAppointmentSchema,
  CompleteAppointmentSchema,
} from './appointment'
export type { CreateAppointmentInput, CancelAppointmentInput, CompleteAppointmentInput } from './appointment'

export { CreateProcedureSchema, UpdateProcedureSchema, ProcedureProductSchema } from './procedure'
export type { CreateProcedureInput, UpdateProcedureInput } from './procedure'
