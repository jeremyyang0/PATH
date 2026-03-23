import logging
import os


def _resolve_level() -> int:
    raw_level = os.environ.get("PATH_SNIFF_LOG_LEVEL", "INFO").upper()
    return getattr(logging, raw_level, logging.INFO)


logging.basicConfig(
    level=_resolve_level(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger("pathsniff")
