FROM timescale/timescaledb:latest-pg15

# Install pgvector
RUN apk add --no-cache build-base clang15 llvm15 git \
    && cd /tmp \
    && git clone --branch v0.5.1 https://github.com/pgvector/pgvector.git \
    && cd pgvector \
    && make \
    && make install \
    && rm -rf /tmp/pgvector \
    && apk del build-base clang15 llvm15 git
