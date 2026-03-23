FROM edoburu/pgbouncer:latest

COPY pgbouncer.ini /etc/pgbouncer/pgbouncer.ini
COPY userlist.txt /etc/pgbouncer/userlist.txt

# Ensure the config belongs to pgbouncer user
USER root
RUN chown -R pgbouncer:pgbouncer /etc/pgbouncer
USER pgbouncer

EXPOSE 6432
