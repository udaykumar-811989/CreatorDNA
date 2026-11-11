-- Unified Login on graph.facebook.com can omit `account_type` (the field is
-- documented only for the retired graph.instagram.com host), and the connect
-- flow stores the honest fallback 'Professional' for those accounts. Widen
-- the CHECK so the new value is accepted; every existing row stays valid and
-- nothing else changes.

alter table public.instagram_connections
  drop constraint instagram_connections_account_type_check;

alter table public.instagram_connections
  add constraint instagram_connections_account_type_check
    check (account_type in ('Business', 'Media_Creator', 'Professional'));
