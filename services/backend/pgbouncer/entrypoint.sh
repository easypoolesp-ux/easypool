#!/bin/sh
set -e

# Replace the ${DB_PASSWORD} placeholder with the actual environment variable
sed -i "s/\${DB_PASSWORD}/${DB_PASSWORD}/g" /etc/pgbouncer/userlist.txt

# Start PgBouncer
exec pgbouncer /etc/pgbouncer/pgbouncer.ini
