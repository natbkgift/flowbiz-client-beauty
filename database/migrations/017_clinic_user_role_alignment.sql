alter table clinic_users drop constraint if exists clinic_users_role_check;

alter table clinic_users
  add constraint clinic_users_role_check
  check (role in ('owner', 'manager', 'sales', 'marketing', 'staff', 'admin', 'operator', 'viewer'));