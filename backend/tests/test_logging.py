import logging

from app.core.logging import RedactTokenFilter

SECRET = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl"


def _record(msg: str, *args) -> logging.LogRecord:
    return logging.LogRecord("uvicorn.error", logging.INFO, __file__, 1, msg, args or None, None)


def test_filter_redacts_token_in_uvicorns_websocket_accepted_line():
    # The exact format string and argument shape uvicorn uses in websockets_impl.py
    rec = _record(
        '%s - "WebSocket %s" [accepted]', "127.0.0.1:5000", f"/api/v1/ws/updates?token={SECRET}"
    )
    assert RedactTokenFilter().filter(rec) is True  # never drops the line, only rewrites it
    assert SECRET not in rec.getMessage()
    assert '"WebSocket /api/v1/ws/updates?token=[REDACTED]" [accepted]' in rec.getMessage()


def test_filter_keeps_other_query_parameters():
    rec = _record(f"GET /x?a=1&token={SECRET}&b=2")
    RedactTokenFilter().filter(rec)
    assert rec.getMessage() == "GET /x?a=1&token=[REDACTED]&b=2"


def test_filter_leaves_unrelated_messages_untouched():
    rec = _record("Started server process [%d]", 42)
    RedactTokenFilter().filter(rec)
    assert rec.getMessage() == "Started server process [42]"


def test_setup_installs_the_filter_on_uvicorn_loggers(caplog):
    # app.main (imported by the test suite) has already called setup_logging().
    with caplog.at_level(logging.INFO, logger="uvicorn.error"):
        logging.getLogger("uvicorn.error").info(
            '%s - "WebSocket %s" [accepted]', "1.2.3.4:5", f"/api/v1/ws/updates?token={SECRET}"
        )
    assert SECRET not in caplog.text
    assert "token=[REDACTED]" in caplog.text
