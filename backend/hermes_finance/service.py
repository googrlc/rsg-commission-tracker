"""The finance backend, as one service.

The React app in the repo root is the finance UI; this is the API behind it.
Both live here because they are one app — that is what the polyglot split
decided. Two toolchains, two Dockerfiles, one thing to reason about.

This service owns the commission surface: rules, the ledger and its analytics,
human overrides on money rows, and the carrier-statement gate. Statements STAGE
on upload and commit only on an explicit, named approval; nothing here writes to
the AMS.
"""

from __future__ import annotations

import argparse
import logging
import os

from hermes_app.service import ServiceSpec, build_app

log = logging.getLogger(__name__)

SPEC = ServiceSpec(
    name="finance",
    description="Commission rules, ledger, analytics, overrides, and the statement gate",
    router_modules=("hermes_finance.router",),
    path_prefixes=(
        "/api/commissions",
        "/api/commission-rules",
        "/api/commission-statements",
        "/api/commission-capabilities",
        "/api/agency-bill",
    ),
    port=8801,
    # Finance has no queue worker: its sync is a scheduled job, not a drained
    # queue. Listing an object_type here without an executor that honours the
    # backoff would be a retry that silently never happens.
    queue_object_types=(),
)


def create_app():
    return build_app(SPEC)


app = create_app()


def main() -> int:
    from dotenv import load_dotenv
    import uvicorn

    load_dotenv()
    logging.basicConfig(level=os.environ.get("HERMES_API_LOG_LEVEL", "INFO"))
    parser = argparse.ArgumentParser(description="RSG finance service")
    parser.add_argument("--host", default=os.environ.get("HERMES_API_HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int,
                        default=int(os.environ.get("HERMES_API_PORT", SPEC.port)))
    args = parser.parse_args()
    log.info("serving %s on %s:%s", SPEC.name, args.host, args.port)
    uvicorn.run(create_app(), host=args.host, port=args.port)
    return 0
