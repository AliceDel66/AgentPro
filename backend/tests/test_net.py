import socket

import pytest

from app.core.net import UnsafeOutboundURL, assert_safe_outbound_url


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/v1",
        "http://10.0.0.5/v1",
        "https://169.254.169.254/latest/meta-data",  # cloud metadata
        "http://[::1]/v1",
        "http://192.168.1.1/v1",
        "http://172.16.0.9/v1",
    ],
)
def test_blocks_internal_literal_addresses(url: str) -> None:
    with pytest.raises(UnsafeOutboundURL):
        assert_safe_outbound_url(url)


@pytest.mark.parametrize(
    "url",
    ["ftp://example.com", "file:///etc/passwd", "gopher://x", "/relative"],
)
def test_blocks_non_http_schemes(url: str) -> None:
    with pytest.raises(UnsafeOutboundURL):
        assert_safe_outbound_url(url)


def test_allows_public_host(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_getaddrinfo(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port or 443))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)
    assert_safe_outbound_url("https://api.example.com/v1/models")  # should not raise


def test_blocks_host_resolving_to_private(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_getaddrinfo(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.1.2.3", port or 443))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)
    with pytest.raises(UnsafeOutboundURL):
        assert_safe_outbound_url("https://internal.corp/v1")
