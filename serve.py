"""Tiny dev server for the game.

Serves this folder at http://127.0.0.1:8000 with caching turned off, so a browser
refresh always picks up your latest code.

Usage:  python serve.py [port] [--no-open]
"""

import functools
import http.server
import os
import sys
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
PORT = int(args[0]) if args else 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    # Some Windows setups map .js to text/plain, which makes browsers refuse ES modules.
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".css": "text/css",
        ".html": "text/html",
        ".json": "application/json",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(Handler, directory=ROOT)
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as server:
        url = f"http://127.0.0.1:{PORT}"
        print(f"Serving the game at {url}  (Ctrl+C to stop)")
        if "--no-open" not in sys.argv:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
