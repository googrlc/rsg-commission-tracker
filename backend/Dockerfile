# The Python API behind the tracker UI. The Node/Vite image at the repo root
# builds the front end; this builds the back end. Two toolchains, one app.
FROM python:3.11-slim

WORKDIR /app

# git: the shared core is a pinned git dependency, so pip needs it to fetch.
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY hermes_finance ./hermes_finance
RUN pip install --no-cache-dir .

EXPOSE 8801
ENV HERMES_SERVICE=finance
CMD ["rsg-finance-api", "--host", "0.0.0.0", "--port", "8801"]
