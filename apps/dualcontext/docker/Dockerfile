# One container, two processes: PostgreSQL (pgvector + Korean full-text search)
# and the Node server. The project is built on the host; this copies the result.
# Never add a project build step here - see the docker-compose-module-design skill.
# The only compilation below is image-owned OS tooling (mecab-ko, textsearch_ko).
FROM pgvector/pgvector:pg17

# 1. Korean morphological analysis: mecab-ko engine, dictionary, and the
#    textsearch_ko extension. Build tools are purged in the same layer, except
#    git: the codebase researcher shallow-clones repositories at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libatomic1 ca-certificates curl make g++ patch git automake autoconf libtool \
      postgresql-server-dev-17 \
    && curl -fLO https://bitbucket.org/eunjeon/mecab-ko/downloads/mecab-0.996-ko-0.9.2.tar.gz \
    && tar zxf mecab-0.996-ko-0.9.2.tar.gz \
    && (cd mecab-0.996-ko-0.9.2 && ./configure && make && make install) \
    && ldconfig \
    && curl -fLO https://bitbucket.org/eunjeon/mecab-ko-dic/downloads/mecab-ko-dic-2.1.1-20180720.tar.gz \
    && tar zxf mecab-ko-dic-2.1.1-20180720.tar.gz \
    && (cd mecab-ko-dic-2.1.1-20180720 && ./autogen.sh && ./configure && make && make install) \
    && echo "dicdir = /usr/local/lib/mecab/dic/mecab-ko-dic" > /usr/local/etc/mecabrc \
    && git clone --depth 1 https://github.com/i0seph/textsearch_ko.git \
    && (cd textsearch_ko && make USE_PGXS=1 && make USE_PGXS=1 install) \
    && cd / && rm -rf /mecab-* /textsearch_ko \
    && apt-get purge -y --auto-remove curl make g++ patch automake autoconf libtool postgresql-server-dev-17 \
    && rm -rf /var/lib/apt/lists/*

# 2. Node runtime only. dist is a self-contained bundle, so no npm and no
#    node_modules are needed. The major matches esbuild --target and @types/node.
#    The binary links libatomic1, installed (and kept) in the layer above.
COPY --from=node:26-bookworm-slim /usr/local/bin/node /usr/local/bin/node

WORKDIR /app

# The single data volume mounts at /var/lib/postgresql/data, the path the base
# image already declares as a VOLUME. Mounting there is what stops Docker from
# creating a second, anonymous volume. Every persisted concern is a subfolder
# of it (pgdata/ today). The path exists and is owned by postgres in the base
# image, so a new named volume inherits that owner.

COPY --chown=postgres:postgres apps/dualcontext/dist ./dist
COPY --chown=postgres:postgres apps/dualcontext/docker/initdb ./initdb
COPY --chown=postgres:postgres --chmod=755 apps/dualcontext/docker/entrypoint.sh ./entrypoint.sh

ENV NODE_ENV=production
ENV PORT=18081
ENV PATH="/usr/lib/postgresql/17/bin:${PATH}"
ENV DUALCONTEXT_DATA_DIR=/var/lib/postgresql/data
# PostgreSQL listens on loopback only and is never published; trust auth is
# safe only because of that. See docs/constraints.md before changing it.
ENV DUALCONTEXT_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/dualcontext

# The base image ships an unprivileged `postgres` user. Both processes run as it.
USER postgres

EXPOSE 18081

# Reports the HTTP health, which includes a database round trip.
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/entrypoint.sh"]
CMD []
