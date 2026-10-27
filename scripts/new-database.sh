#!/bin/sh
# Create an empty PostgreSQL database, apply the migrations and point the
# development stack at it. The previous database is left in place, so it can be
# restored by setting MAILQUAY_DB_NAME in .env back to its name.
#
# Usage: scripts/new-database.sh [database_name]
set -eu

cd "$(dirname "$0")/.."
compose="docker compose -f docker-compose-dev.yml"
env_file=.env
database="${1:-mailquay_$(date -u +%Y%m%d_%H%M%S)}"
case "$database" in
	''|*[!a-z0-9_]*)
		echo "database name must use lowercase letters, digits and underscores" >&2
		exit 2
		;;
esac

if [ ! -f "$env_file" ]; then
	echo "missing $env_file; copy .env.example and fill in MAILQUAY_SECRET_KEY" >&2
	exit 2
fi
user=$(sed -n 's/^POSTGRES_USER=//p' "$env_file" 2>/dev/null | tail -n 1)
user="${user:-mailquay}"

if ! $compose exec -T postgres psql -U "$user" -d postgres -tAc \
	"SELECT 1 FROM pg_database WHERE datname = '$database'" | grep -q 1; then
	$compose exec -T postgres psql -U "$user" -d postgres -c "CREATE DATABASE \"$database\""
fi

temporary=$(mktemp)
if [ -f "$env_file" ]; then
	grep -v '^MAILQUAY_DB_NAME=' "$env_file" > "$temporary" || true
fi
printf 'MAILQUAY_DB_NAME=%s\n' "$database" >> "$temporary"
mv "$temporary" "$env_file"

$compose run --rm --no-deps --entrypoint /usr/local/bin/mailquay mailquay migrate up

$compose up -d --force-recreate mailquay
echo "MailQuay now uses database $database"
