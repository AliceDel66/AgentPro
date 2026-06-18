import ipaddress
import socket
from urllib.parse import urlparse


class UnsafeOutboundURL(ValueError):
    """Raised when a user-supplied URL would target a non-public address (SSRF)."""


def assert_safe_outbound_url(url: str) -> None:
    """Guard against SSRF before requesting a user-controlled URL.

    Rejects non-http(s) schemes and any host that resolves to a private, loopback,
    link-local (incl. cloud metadata 169.254.169.254), reserved, multicast or
    unspecified address. Note: a TOCTOU/DNS-rebinding gap remains between this
    check and the actual connection; pin the resolved IP for stronger guarantees.
    """
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise UnsafeOutboundURL(f"unsupported URL scheme: {parsed.scheme or '(none)'}")

    host = parsed.hostname
    if not host:
        raise UnsafeOutboundURL("URL has no host")

    try:
        infos = socket.getaddrinfo(host, parsed.port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise UnsafeOutboundURL(f"cannot resolve host: {host}") from exc

    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise UnsafeOutboundURL(f"blocked non-public address for host {host}: {ip}")
