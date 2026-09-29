import logging
import sys


def setup_logging(level: int = logging.INFO) -> None:
    """Called once at process startup — by both the API (main.py) and the
    worker (alert_worker.py) — so both processes log in the same format and
    are told apart by logger name (devpulse.api vs devpulse.worker)."""
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        stream=sys.stdout,
    )