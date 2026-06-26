"""System-tray launcher for the Kokoro TTS server (Windows background mode).

Runs the FastAPI server in a background thread and shows a tray icon, so the
server can run with no visible console window. Launched hidden via
start-tray.vbs (also used for auto-start on login). Needs the optional 'tray'
dependency group:  uv sync --group tray
"""

import socket
import threading
import webbrowser

import pystray
import uvicorn
from PIL import Image, ImageDraw

from server import app

HOST = "127.0.0.1"
PORT = 18001


def make_icon_image():
    """A small speaker glyph, drawn so we don't have to ship a binary asset."""
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((6, 6, 58, 58), fill=(59, 130, 246, 255))
    d.polygon(
        [(22, 27), (30, 27), (40, 18), (40, 46), (30, 37), (22, 37)], fill="white"
    )
    d.line((44, 24, 48, 40), fill="white", width=3)
    return img


def port_in_use(host, port):
    """True if something is already listening — avoids a second server instance."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex((host, port)) == 0


class ServerThread:
    """Runs uvicorn in a background daemon thread.

    uvicorn skips installing signal handlers when not on the main thread, so
    this is safe; we stop it cooperatively via ``should_exit``.
    """

    def __init__(self):
        config = uvicorn.Config(app, host=HOST, port=PORT, log_level="info")
        self.server = uvicorn.Server(config)
        self.thread = threading.Thread(target=self.server.run, daemon=True)

    def start(self):
        self.thread.start()

    def stop(self):
        self.server.should_exit = True


def main():
    # If a server is already up (manual run, or a second launch), just show the
    # tray without starting another one.
    server = None if port_in_use(HOST, PORT) else ServerThread()
    if server:
        server.start()

    def on_open(icon, item):
        webbrowser.open(f"http://{HOST}:{PORT}/voices")

    def on_quit(icon, item):
        if server:
            server.stop()
        icon.stop()

    menu = pystray.Menu(
        pystray.MenuItem(
            f"Kokoro TTS server — http://{HOST}:{PORT}", None, enabled=False
        ),
        pystray.MenuItem("Open test page", on_open),
        pystray.MenuItem("Quit", on_quit),
    )
    pystray.Icon("kokoro-tts", make_icon_image(), "Kokoro TTS server", menu).run()


if __name__ == "__main__":
    main()
