#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, HTTPServer
import os

class Handler(SimpleHTTPRequestHandler):
    def send_error(self, code, message=None, explain=None):
        if code == 404:
            try:
                with open('404.html', 'rb') as f:
                    data = f.read()
                self.send_response(404)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            except Exception:
                pass
        super().send_error(code, message, explain)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', '5500'))
    print(f"Serving on http://localhost:{port}")
    HTTPServer(('0.0.0.0', port), Handler).serve_forever()
