-- Geotag/clima automático por entrada (item 17 do roadmap de mercado) —
-- captado uma vez, por ação explícita da pessoa (botão "Adicionar clima"),
-- nunca em segundo plano sem interação. Coordenadas guardadas só pra poder
-- re-consultar o clima depois se necessário; não há reverse geocoding
-- (nome de cidade) neste primeiro corte.
alter table public.journal_entries
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists weather_temp_c numeric,
  add column if not exists weather_code integer;
