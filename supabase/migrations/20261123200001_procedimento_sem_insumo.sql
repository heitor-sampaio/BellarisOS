-- A7 da 23ª simulação (= A23 da 21ª, 2026-11-17; princípio 1: a rede decide):
-- a faixa "N procedimentos ativos sem insumo ligado" do catálogo contava a
-- Avaliação e a Massagem, que não usam insumo, e não havia como dizer isso.
-- A marca "Este procedimento não usa insumo" mora no procedimento; a faixa e o
-- selo ignoram os marcados. Nasce desmarcada (o aviso continua para todos),
-- e só vale sem insumo ligado (o servidor grava falso quando há insumo).

alter table public.procedures
  add column if not exists sem_insumo boolean not null default false;

comment on column public.procedures.sem_insumo is
  'Este procedimento não usa insumo (a rede marca): fica fora da faixa "sem insumo ligado" do catálogo.';

notify pgrst, 'reload schema';
