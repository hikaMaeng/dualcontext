# Crawler service: the official Crawl4AI image (Apache-2.0), pinned, plus the
# two things this repository requires of every container: a non-root USER and a
# HEALTHCHECK that does not depend on the base image's own probe.
# No project code and no build step live here; see apps/crawler/docs.
FROM unclecode/crawl4ai:0.9.5

# The base image already runs as this unprivileged account; saying so keeps the
# contract explicit and survives a base image that stops declaring it.
USER appuser

EXPOSE 11235

# /health needs no token. start-period covers Chromium and Redis start-up.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:11235/health >/dev/null || exit 1
