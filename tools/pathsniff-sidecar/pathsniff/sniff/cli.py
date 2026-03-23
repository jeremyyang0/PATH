#!/usr/bin/env python3
import argparse
import json
import sys

from PySide2.QtCore import QTimer

from pathsniff.sniff.main_window import MainWindow
from pathsniff.sniff.pick_session import PickSession
from pathsniff.sniff.runtime import SniffApplicationRuntime
from pathsniff.sniff.sidecar_client import SidecarClientError, SniffSidecarClient


def show_server_selection_dialog():
    from PySide2.QtWidgets import (
        QDialog,
        QDialogButtonBox,
        QLabel,
        QLineEdit,
        QVBoxLayout,
    )

    dialog = QDialog()
    dialog.setWindowTitle("输入服务名称对话框")
    dialog.setModal(True)

    layout = QVBoxLayout(dialog)
    label = QLabel("从 SailWind Script 中复制 server_name")
    layout.addWidget(label)

    lineedit = QLineEdit()
    layout.addWidget(lineedit)

    button_box = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
    button_box.accepted.connect(dialog.accept)
    button_box.rejected.connect(dialog.reject)
    layout.addWidget(button_box)

    if dialog.exec_() == QDialog.Accepted:
        return lineedit.text().strip() or None
    return None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="path-sniff-cli")
    subparsers = parser.add_subparsers(dest="command")

    gui_parser = subparsers.add_parser("gui")
    gui_parser.add_argument("--server-name", dest="server_name", default="")

    health_parser = subparsers.add_parser("health")
    health_parser.add_argument("--server-name", dest="server_name", required=True)
    health_parser.add_argument("--json", dest="json_mode", action="store_true")

    pick_parser = subparsers.add_parser("pick")
    pick_parser.add_argument("--server-name", dest="server_name", required=True)
    pick_parser.add_argument("--json", dest="json_mode", action="store_true")

    return parser


def _write_json(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def run_gui(server_name: str = "") -> int:
    runtime = SniffApplicationRuntime(enable_log_server=True)
    try:
        resolved_server_name = server_name.strip() or show_server_selection_dialog()
        if not resolved_server_name:
            return 0

        window = MainWindow(server_name=resolved_server_name)
        window.show()
        return runtime.exec_()
    finally:
        runtime.shutdown()


def run_health(server_name: str) -> int:
    runtime = SniffApplicationRuntime(enable_log_server=False)
    try:
        client = SniffSidecarClient(server_name)
        version = client.get_widget_tree_version()
        _write_json(
            {
                "status": "ok",
                "serverName": server_name,
                "version": version,
            }
        )
        return 0
    except SidecarClientError as exc:
        _write_json(
            {
                "status": "error",
                "errorType": exc.error_type,
                "message": exc.message,
            }
        )
        return 1
    except Exception as exc:
        _write_json(
            {
                "status": "error",
                "errorType": type(exc).__name__,
                "message": str(exc),
            }
        )
        return 1
    finally:
        runtime.shutdown()


def run_pick(server_name: str) -> int:
    runtime = SniffApplicationRuntime(enable_log_server=False)
    result_holder = {}
    session = PickSession(server_name)

    def _on_finished(payload):
        result_holder["payload"] = dict(payload)
        runtime.app.quit()

    session.finished.connect(_on_finished)
    try:
        QTimer.singleShot(0, session.start)
        runtime.exec_()
        payload = result_holder.get("payload") or {
            "status": "error",
            "errorType": "UnknownError",
            "message": "Pick session finished without a payload.",
        }
        _write_json(payload)
        status = payload.get("status")
        if status == "selected":
            return 0
        if status == "cancelled":
            return 2
        return 1
    finally:
        session.dispose()
        runtime.shutdown()


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    command = args.command or "gui"

    if command == "gui":
        return run_gui(getattr(args, "server_name", ""))
    if command == "health":
        return run_health(args.server_name)
    if command == "pick":
        return run_pick(args.server_name)

    parser.print_help()
    return 1


def gui_entry():
    return run_gui()


def cli_entry():
    return main()


if __name__ == '__main__':
    sys.exit(main())
