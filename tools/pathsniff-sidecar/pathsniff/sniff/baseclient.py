import json

from PySide2.QtCore import QObject
from PySide2.QtCore import Signal
from PySide2.QtNetwork import QLocalSocket
from pathsniff.logger import logger


class RouterHttpClient(QObject):
    response_ready = Signal(str)

    def __init__(self, server_name):
        super().__init__()
        self.server_name = server_name

    def post(self, path, data=None):
        socket = QLocalSocket()
        socket.response_ready = self.response_ready
        path = "/" + self.server_name + "/" + path
        # socket.readyRead.connect(lambda: self._on_ready_read(socket))
        socket.errorOccurred.connect(lambda err: self._on_error(err, socket))
        socket.disconnected.connect(socket.deleteLater)

        payload = "\n" + json.dumps(data) if data else ""
        req = f"POST {path}{payload}"

        socket.connectToServer(self.server_name)
        if socket.waitForConnected(1000):
            socket.write(req.encode("utf-8"))
            socket.flush()
        else:
            raise ConnectionError('连接失败')

        if socket.waitForReadyRead(5000):
            data = bytes(socket.readAll()).decode("utf-8")
            logger.debug(data)
            return json.loads(data)
        else:
            raise TimeoutError('响应超时')

    def _on_error(self, err, socket):
        socket.close()
        return {"error": err}
