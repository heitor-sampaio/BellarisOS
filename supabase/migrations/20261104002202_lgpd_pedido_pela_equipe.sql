-- A21 da 6ª simulação (2026-11-04): a equipe também exporta os dados da
-- cliente (LGPD) pela FICHA — até aqui só o portal pedia. O pedido feito pela
-- equipe fica registrado: quem pediu (users.id, sem chave estrangeira — o
-- registro sobrevive ao membro, como em prontuario_acessos) e o nome do ctx
-- (com a marca "via suporte"). requested_via = 'equipe'.

alter table public.lgpd_requests
  add column if not exists requested_by uuid,
  add column if not exists requested_by_name text;

comment on column public.lgpd_requests.requested_by is
  'Quem da equipe pediu (requested_via = ''equipe''): users.id, sem chave estrangeira — o registro fica mesmo sem o membro.';
comment on column public.lgpd_requests.requested_by_name is
  'O nome de quem pediu, do contexto (com a marca "via suporte").';

notify pgrst, 'reload schema';
