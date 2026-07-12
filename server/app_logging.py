"""Central logging setup so the server leaves a diagnosable trail in every mode.

The tray app runs under pythonw.exe with no console attached: without this,
uvicorn output, tracebacks, and a failed model load all vanish and the only
symptom is "it doesn't work". We route everything to a log file (and, when a
console exists, to it as well) and capture uncaught exceptions from the main
thread and the uvicorn worker thread.
"""

import logging
import os
import sys
import threading
from pathlib import Path

_configured = False
_log_file = None


def log_dir() -> Path:
    """Per-user, writable location for the log, outside the (possibly
    read-only or redirected) install directory."""
    if os.name == "nt":
        # Same folder the installer uses ({localappdata}\KokoroTTSServer), so the
        # log sits right next to the app — one obvious place to look.
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        return Path(base) / "KokoroTTSServer"
    base = os.environ.get("XDG_STATE_HOME") or os.path.join(
        os.path.expanduser("~"), ".local", "state"
    )
    return Path(base) / "kokoro-tts"


def log_file_path() -> Path:
    return log_dir() / "server.log"


def setup_logging(level=logging.INFO) -> Path:
    """Attach a file handler (and a console handler when we have a console) to
    the root logger. Idempotent — safe to call from every entry point."""
    global _configured, _log_file
    if _configured:
        return _log_file

    directory = log_dir()
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "server.log"

    # Bound growth without a rotating handler: start fresh if the previous log
    # got large. Keeps the last session in full for diagnosis.
    mode = "a"
    try:
        if path.exists() and path.stat().st_size > 2_000_000:
            mode = "w"
    except OSError:
        pass

    fmt = logging.Formatter(
        "%(asctime)s %(levelname)s %(name)s: %(message)s", "%Y-%m-%d %H:%M:%S"
    )
    file_handler = logging.FileHandler(path, mode=mode, encoding="utf-8")
    file_handler.setFormatter(fmt)

    root = logging.getLogger()
    root.setLevel(level)
    root.addHandler(file_handler)

    if sys.stdout is not None and hasattr(sys.stdout, "write"):
        # Visible-console mode (start-server.bat): mirror to the console too.
        console = logging.StreamHandler(sys.stdout)
        console.setFormatter(fmt)
        root.addHandler(console)
    else:
        # pythonw (tray): no console. Point stray prints and low-level
        # tracebacks at the same handle the log file uses, so nothing is lost.
        sys.stdout = file_handler.stream
        sys.stderr = file_handler.stream

    _install_excepthooks()
    _configured = True
    _log_file = path
    logging.getLogger(__name__).info("Logging to %s", path)
    return path


def _install_excepthooks():
    log = logging.getLogger("kokoro")

    def handle(exc_type, exc, tb):
        log.error("Uncaught exception", exc_info=(exc_type, exc, tb))

    sys.excepthook = handle

    def thread_handle(args):
        # Without this a crash in the uvicorn worker thread dies silently and
        # the tray still looks healthy.
        log.error(
            "Uncaught exception in thread %s" % args.thread.name,
            exc_info=(args.exc_type, args.exc_value, args.exc_traceback),
        )

    try:
        threading.excepthook = thread_handle
    except Exception:
        pass
