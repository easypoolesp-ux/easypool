FROM edoburu/pgbouncer:latest

COPY pgbouncer.ini /etc/pgbouncer/pgbouncer.ini
COPY userlist.txt /etc/pgbouncer/userlist.txt
COPY entrypoint.sh /etc/pgbouncer/entrypoint.sh

# Ensure the config belongs to pgbouncer user
USER root
RUN addgroup -S pgbouncer && adduser -S pgbouncer -G pgbouncer
RUN chmod +x /etc/pgbouncer/entrypoint.sh && \
    chown -R pgbouncer:pgbouncer /etc/pgbouncer
USER pgbouncer

EXPOSE 6432
ENTRYPOINT ["/etc/pgbouncer/entrypoint.sh"]
