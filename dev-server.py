"""本機預覽用的小網頁伺服器：每次都拿最新的檔案（不讓瀏覽器用舊的暫存），並且手機也能連。
用法：python dev-server.py  （預設 8080 埠）"""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


with Server(('0.0.0.0', PORT), NoCache) as httpd:
    print(f'預覽中：http://localhost:{PORT}/')
    httpd.serve_forever()
