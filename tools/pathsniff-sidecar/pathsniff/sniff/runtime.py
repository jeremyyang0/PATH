import sys
from typing import Optional, Sequence

from PySide2.QtCore import QCoreApplication, Qt
from PySide2.QtWidgets import QApplication

from pathsniff.__version__ import __version__


class SniffApplicationRuntime:
    def __init__(
        self,
        argv: Optional[Sequence[str]] = None,
        enable_log_server: bool = True,
    ):
        self._configure_qt()
        existing_app = QApplication.instance()
        self._owns_app = existing_app is None
        self.app = existing_app or QApplication(list(argv or sys.argv))
        self._configure_metadata()

    @staticmethod
    def _configure_qt() -> None:
        if hasattr(Qt, "AA_DisableHighDpiScaling"):
            QCoreApplication.setAttribute(Qt.AA_DisableHighDpiScaling, True)
        QCoreApplication.setAttribute(Qt.AA_UseHighDpiPixmaps, False)

    def _configure_metadata(self) -> None:
        QCoreApplication.setApplicationName("PATH Sniff")
        QCoreApplication.setApplicationVersion(__version__)
        QCoreApplication.setOrganizationName("DanceMonkey")

    def shutdown(self) -> None:
        return None

    def exec_(self) -> int:
        return int(self.app.exec_())
