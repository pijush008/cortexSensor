#!/bin/sh
set -e

# Ensure pg_isready is available in the base node image
if ! command -v pg_isready >/dev/null 2>&1; then
  echo "pg_isready not found - attempting to install postgresql-client..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update && apt-get install -y postgresql-client >/dev/null 2>&1 || true
  fi
fi

DB_HOST=${POSTGRES_HOST:-postgres}
DB_PORT=${POSTGRES_PORT:-5432}
DB_USER=${POSTGRES_USER:-shm}

echo "Waiting for Postgres at ${DB_HOST}:${DB_PORT}..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; do
  sleep 1
done

echo "Postgres is ready — running migrations"
npm run prisma:migrate || echo "prisma:migrate failed"

echo "Running prisma seed"
npm run prisma:seed || echo "prisma:seed failed"

echo "Starting dev server"
npm run dev
