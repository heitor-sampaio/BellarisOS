-- A59 da 5ª simulação ("Reforça", item 11): a cliente que agendou pelo app em
-- "Sem preferência" remarcava presa à profissional que o sistema escolheu. O
-- agendamento passa a guardar que foi "Sem preferência"; o remarcar do app
-- começa por ela e pode escolher de novo entre quem realiza.
alter table public.appointments
  add column if not exists sem_preferencia boolean not null default false;

comment on column public.appointments.sem_preferencia is
  'A cliente agendou pelo app em "Sem preferência" (D-16): o sistema escolheu a profissional. O remarcar do app começa por "Sem preferência" (A59).';

notify pgrst, 'reload schema';
