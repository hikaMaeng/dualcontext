#!/usr/bin/env bash
# Supervises the two processes of the single container: PostgreSQL, then Node.
# If either exits, the other is stopped and the container exits with its code.
set -euo pipefail

DATA_ROOT="${DUALCONTEXT_DATA_DIR:-/data}"
PGDATA="$DATA_ROOT/pgdata"
DB_NAME=dualcontext

mkdir -p "$PGDATA"

if [[ ! -s "$PGDATA/PG_VERSION" ]]; then
  echo "entrypoint: initializing database cluster in $PGDATA" >&2
  initdb -D "$PGDATA" -U postgres --auth=trust --encoding=UTF8 --locale=C.UTF-8 >&2
fi

# Loopback only; the unix socket lives outside the volume.
postgres -D "$PGDATA" \
  -c listen_addresses=127.0.0.1 \
  -c unix_socket_directories=/tmp &
pg_pid=$!

for _ in $(seq 1 60); do
  pg_isready -q -h 127.0.0.1 && break
  kill -0 "$pg_pid" 2>/dev/null || { echo "entrypoint: postgres exited during start" >&2; exit 1; }
  sleep 1
done
pg_isready -q -h 127.0.0.1 || { echo "entrypoint: postgres not ready" >&2; exit 1; }

psql -h 127.0.0.1 -U postgres -d postgres -tAc "select 1 from pg_database where datname='$DB_NAME'" | grep -q 1 \
  || createdb -h 127.0.0.1 -U postgres "$DB_NAME"
for sql in /app/initdb/*.sql; do
  psql -h 127.0.0.1 -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -q -f "$sql" >&2
done

node /app/dist/server/index.js &
node_pid=$!

shutdown() {
  kill -TERM "$node_pid" 2>/dev/null || true
  wait "$node_pid" 2>/dev/null || true
  # SIGINT is PostgreSQL's fast shutdown.
  kill -INT "$pg_pid" 2>/dev/null || true
  wait "$pg_pid" 2>/dev/null || true
}
trap 'shutdown; exit 0' TERM INT

set +e
wait -n "$pg_pid" "$node_pid"
exit_code=$?
echo "entrypoint: a process exited with $exit_code, shutting down" >&2
shutdown
exit "$exit_code"
