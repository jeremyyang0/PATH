from typing import Any, Dict

from pathsniff.sniff.baseclient import RouterHttpClient


class SidecarClientError(RuntimeError):
    def __init__(self, error_type: str, message: str):
        super().__init__(message)
        self.error_type = error_type
        self.message = message


class SniffSidecarClient:
    def __init__(self, server_name: str):
        self.server_name = server_name
        self._client = RouterHttpClient(server_name)

    @staticmethod
    def _raise_if_error(response: Any) -> Any:
        if isinstance(response, dict) and response.get("error"):
            raise SidecarClientError(
                str(response.get("error_type") or "ServerError"),
                str(response.get("error") or "Unknown error"),
            )
        return response

    def activate_application_window(self) -> Dict[str, Any]:
        response = self._client.post("activate_application_window")
        return self._raise_if_error(response)

    def refresh_widget_tree(self) -> Dict[str, Any]:
        response = self._client.post("refresh_widget_tree")
        return self._raise_if_error(response)

    def get_widget_tree(self) -> Dict[str, Any]:
        response = self._client.post("get_widget_tree")
        return self._raise_if_error(response)

    def get_widget_tree_version(self) -> int:
        response = self._client.post("get_widget_tree_version")
        payload = self._raise_if_error(response)
        return int(payload.get("version", 0))

    def find_widget_by_point(self, x: int, y: int, refresh: bool = False) -> Dict[str, Any]:
        response = self._client.post(
            "find_widget_by_point",
            {
                "x": int(x),
                "y": int(y),
                "refresh": bool(refresh),
            },
        )
        return self._raise_if_error(response)
