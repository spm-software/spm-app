"""Tests for YouTube OAuth endpoints (Configuracion flow)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend env file (for tests run locally)
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

assert BASE_URL, "REACT_APP_BACKEND_URL not configured"


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestYouTubeOAuthEndpoints:
    """Validate YouTube OAuth endpoints structure and behavior."""

    def test_auth_status_no_token(self, api_client):
        # Ensure clean state - delete any existing token
        api_client.delete(f"{BASE_URL}/api/youtube/disconnect")
        r = api_client.get(f"{BASE_URL}/api/youtube/auth-status")
        assert r.status_code == 200
        data = r.json()
        assert data.get("authenticated") is False

    def test_auth_url_endpoint_exists(self, api_client):
        r = api_client.get(
            f"{BASE_URL}/api/youtube/auth-url",
            params={"redirect_uri": "https://example.com/youtube-callback.html"},
        )
        # Either 200 (creds configured) or 400 (creds missing) is acceptable per spec
        assert r.status_code in (200, 400), f"Unexpected status {r.status_code}: {r.text}"
        data = r.json()
        if r.status_code == 200:
            assert "auth_url" in data
            assert isinstance(data["auth_url"], str)
            assert "accounts.google.com" in data["auth_url"]
            # verify prompt=select_account and access_type=offline
            assert "prompt=select_account" in data["auth_url"]
            assert "access_type=offline" in data["auth_url"]
            assert "state" in data
        else:
            # 400 must contain a descriptive detail message
            assert "detail" in data
            assert "credenciales" in data["detail"].lower() or "credentials" in data["detail"].lower()

    def test_auth_url_missing_redirect_uri(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/youtube/auth-url")
        # redirect_uri is required query param → 422
        assert r.status_code == 422

    def test_callback_endpoint_exists_and_validates(self, api_client):
        # missing body → 422
        r = api_client.post(f"{BASE_URL}/api/youtube/callback", json={})
        assert r.status_code == 422

        # empty code/redirect_uri → 400 or 422 (validates input)
        r = api_client.post(
            f"{BASE_URL}/api/youtube/callback",
            json={"code": "fake_code_value", "redirect_uri": "https://example.com/cb"},
        )
        # Will fail with 400 because creds missing or OAuth exchange fails
        assert r.status_code in (400, 422, 500)
        if r.status_code == 400:
            data = r.json()
            assert "detail" in data

    def test_disconnect_returns_success(self, api_client):
        r = api_client.delete(f"{BASE_URL}/api/youtube/disconnect")
        assert r.status_code == 200
        data = r.json()
        assert data.get("success") is True

    def test_disconnect_removes_token_and_status_reflects(self, api_client):
        # Call disconnect then auth-status
        api_client.delete(f"{BASE_URL}/api/youtube/disconnect")
        r = api_client.get(f"{BASE_URL}/api/youtube/auth-status")
        assert r.status_code == 200
        assert r.json().get("authenticated") is False
