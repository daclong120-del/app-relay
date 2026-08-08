#!/bin/bash
# PostgREST role model, matching the roles Supabase Cloud ships with so the same
# SUPABASE_URL / secret-key code path works unchanged against local.
#
# `authenticator` is the only role PostgREST logs in as; it holds no privileges
# of its own and switches to the role named in the JWT `role` claim. Its password
# comes from the environment so it never has to live in a committed .sql file.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	create extension if not exists pgcrypto;

	create role anon nologin noinherit;
	create role authenticated nologin noinherit;
	create role service_role nologin noinherit bypassrls;
	create role authenticator login noinherit password '${AUTHENTICATOR_PASSWORD}';

	grant anon, authenticated, service_role to authenticator;
EOSQL
