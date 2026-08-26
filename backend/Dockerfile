FROM python:3.12-slim

# Dépendances WeasyPrint + libs runtime Chromium (Playwright). On évite `playwright install --with-deps`
# : leurs listes apt ciblent souvent Ubuntu 20.04 et échouent sur Debian Trixie (python:3.12-slim).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libpangoft2-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    libcairo2 \
    libglib2.0-0 \
    fonts-liberation \
    fonts-dejavu-core \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt \
    && playwright install chromium

COPY . .

ARG SENTRY_RELEASE=""
ENV SENTRY_RELEASE=$SENTRY_RELEASE

ENV PYTHONUNBUFFERED=1
ENV ENVIRONMENT=production
# Limite glibc à 2 arenas malloc (par défaut : 8 × CPU). Sans ça, un process Python
# multi-thread (uvicorn + threadpool + monitoring) garde des centaines de Mo de heap
# fragmenté après chaque pic (PDF Chromium/WeasyPrint). Économise typiquement 150-300 Mo
# de RSS au repos. À combiner avec backend.mem_release.release_unused_memory() (malloc_trim).
ENV MALLOC_ARENA_MAX=2

EXPOSE 8000

# UVICORN_WORKERS=1 recommandé sur petit VPS (RAM) ; augmenter seulement si ressources suffisantes
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-1} --proxy-headers --forwarded-allow-ips '*'"]
