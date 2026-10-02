import logging
import re
import sys

# The browser WebSocket API cannot send an Authorization header, so the live-update feed
# authenticates with `?token=<JWT>` in the URL. Uvicorn then logs that full URL when the
# socket is accepted (via its *error* logger, so --no-access-log does not help).
# A logged JWT is a replayable credential, so redact it before it reaches any handler.
_TOKEN_PARAM = re.compile(r"(token=)[^\s&\"']+")


class RedactTokenFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        if "token=" in message:
            record.msg = _TOKEN_PARAM.sub(r"\1[REDACTED]", message)
            record.args = None
        return True


def setup_logging(level: int = logging.INFO) -> None:
    """Called once at process startup — by both the API (main.py) and the
    worker (alert_worker.py) — so both processes log in the same format and
    are told apart by logger name (devpulse.api vs devpulse.worker)."""
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        stream=sys.stdout,
    )
    redactor = RedactTokenFilter()
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(name).addFilter(redactor)
