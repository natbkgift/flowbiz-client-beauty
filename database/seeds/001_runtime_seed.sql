insert into app_runtime (environment_name, is_bootstrap_ready)
values ('local', true)
on conflict (environment_name)
do update set
  is_bootstrap_ready = excluded.is_bootstrap_ready,
  updated_at = now();
