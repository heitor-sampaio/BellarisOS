-- O horário de funcionamento: da unidade e, dentro dele, do profissional
-- (2026-10-21, decisão do Heitor). A conta é de lib/agenda/horario.ts.
--
-- Forma: { "dias": { "0".."6": [{ "de": "HH:MM", "ate": "HH:MM" }, …] } } —
-- 0 = domingo, lista vazia = fechado, a pausa é o intervalo entre períodos.
-- Nulo na unidade = o padrão (segunda a sábado, 08–20); nulo no profissional
-- = segue a unidade. Gravado só pelo servidor (as actions conferem a forma).

alter table public.branches add column if not exists horario jsonb;
alter table public.users    add column if not exists horario jsonb;

comment on column public.branches.horario is
  'Horário de funcionamento por dia da semana ({dias:{"0".."6":[{de,ate}]}}); nulo = segunda a sábado, 08–20.';
comment on column public.users.horario is
  'Horário de atendimento do profissional, dentro do da unidade; nulo (ou dia ausente) = segue a unidade.';

notify pgrst, 'reload schema';
