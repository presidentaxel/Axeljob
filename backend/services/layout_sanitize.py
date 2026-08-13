"""Validation / sanitisation du layout v3 avant persistance API."""

from __future__ import annotations

import base64
import binascii
import logging
import re
import uuid
from collections.abc import Callable
from typing import Any

from backend.html_sanitize import sanitize_rich_text_html

logger = logging.getLogger("cv-bot")

_LAYOUT_VERSION = 3
_MAX_PAGES = 20
_MAX_BLOCKS_PER_PAGE = 400
_ALLOWED_BLOCK_TYPES = frozenset(
    {
        "text",
        "title",
        "identity",
        "photo",
        "contact",
        "resume",
        "experiences",
        "formations",
        "certifications",
        "projets",
        "skills",
        "languages",
        "shape:line",
        "shape:rect",
        "shape:circle",
        "shape:ellipse",
        "shape:triangle",
        "shape:diamond",
        "shape:star",
        "shape:hexagon",
        "shape:frame",
        "shape:arrow-right",
        "shape:arrow-left",
        "shape:arrow-up",
        "shape:arrow-down",
        "shape:cross",
        "shape:heart",
        "image",
        "icon",
        "qrcode",
    }
)
_DATA_URL_RE = re.compile(
    r"^data:(image/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$",
    re.I,
)
_SAFE_HTTP_RE = re.compile(r"^https?://", re.I)
_SAFE_ASSET_RE = re.compile(r"^assets/[A-Za-z0-9._/-]+$")


class LayoutValidationError(ValueError):
    """Layout invalide (à mapper en HTTP 400)."""


def _num(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _sanitize_image_src(
    src: str,
    *,
    materialize: Callable[[bytes, str], str] | None,
) -> str:
    s = (src or "").strip()
    if not s:
        return ""
    if _SAFE_HTTP_RE.match(s) or _SAFE_ASSET_RE.match(s):
        return s
    m = _DATA_URL_RE.match(s)
    if not m:
        # data: ou schéma inconnu → drop
        return ""
    if materialize is None:
        return ""
    mime = m.group(1).lower().replace("image/jpg", "image/jpeg")
    try:
        raw = base64.b64decode(re.sub(r"\s+", "", m.group(2)), validate=False)
    except (binascii.Error, ValueError):
        return ""
    if not raw or len(raw) > 5 * 1024 * 1024:
        return ""
    try:
        return (materialize(raw, mime) or "").strip()
    except Exception as exc:  # noqa: BLE001 — ne pas faire échouer tout le PUT
        logger.warning("layout image materialize failed: %s", exc)
        return ""


def _sanitize_block(
    block: Any,
    *,
    materialize: Callable[[bytes, str], str] | None,
) -> dict[str, Any] | None:
    if not isinstance(block, dict):
        return None
    btype = block.get("type")
    if not isinstance(btype, str) or btype not in _ALLOWED_BLOCK_TYPES:
        return None
    bid = block.get("id")
    if not isinstance(bid, str) or not bid.strip() or len(bid) > 120:
        bid = f"blk_{uuid.uuid4().hex[:12]}"
    out: dict[str, Any] = {
        "id": bid.strip(),
        "type": btype,
        "x": max(0.0, _num(block.get("x"))),
        "y": max(0.0, _num(block.get("y"))),
        "w": max(1.0, _num(block.get("w"), 10)),
        "h": max(1.0, _num(block.get("h"), 10)),
        "z": max(0, int(_num(block.get("z"), 1))),
    }
    style = block.get("style")
    if isinstance(style, dict):
        out["style"] = style
    if btype in ("text", "title"):
        content = block.get("content")
        if isinstance(content, str):
            out["content"] = sanitize_rich_text_html(content)
        else:
            out["content"] = ""
    elif isinstance(block.get("content"), str):
        # Autres types : texte brut échappé côté renderer ; on coupe HTML.
        out["content"] = sanitize_rich_text_html(block["content"]) or block["content"][:2000]
    if btype == "image":
        src = block.get("image_src") if isinstance(block.get("image_src"), str) else ""
        out["image_src"] = _sanitize_image_src(src, materialize=materialize)
    if btype == "icon" and isinstance(block.get("icon_name"), str):
        out["icon_name"] = block["icon_name"][:64]
    if btype == "qrcode" and isinstance(block.get("target_url"), str):
        url = block["target_url"].strip()
        out["target_url"] = url if _SAFE_HTTP_RE.match(url) else ""
    if isinstance(block.get("bind"), str | list):
        out["bind"] = block["bind"]
    if block.get("locked") is True:
        out["locked"] = True
    if isinstance(block.get("limit"), int | float) and block["limit"] > 0:
        out["limit"] = int(block["limit"])
    return out


def sanitize_layout_v3(
    layout: Any,
    *,
    materialize_image: Callable[[bytes, str], str] | None = None,
) -> dict[str, Any]:
    """Valide et nettoie un layout v3. Lève ``LayoutValidationError`` si invalide."""
    if layout is None:
        raise LayoutValidationError("layout manquant")
    if not isinstance(layout, dict):
        raise LayoutValidationError("layout doit être un objet JSON")
    version = layout.get("version", _LAYOUT_VERSION)
    try:
        version_i = int(version)
    except (TypeError, ValueError) as exc:
        raise LayoutValidationError("version de layout invalide") from exc
    if version_i != _LAYOUT_VERSION:
        raise LayoutValidationError(f"version de layout non supportée ({version_i})")
    pages_in = layout.get("pages")
    if not isinstance(pages_in, list) or not pages_in:
        raise LayoutValidationError("layout.pages requis")
    if len(pages_in) > _MAX_PAGES:
        raise LayoutValidationError("trop de pages dans le layout")
    pages_out: list[dict[str, Any]] = []
    for page in pages_in:
        if not isinstance(page, dict):
            raise LayoutValidationError("page de layout invalide")
        blocks_in = page.get("blocks")
        if blocks_in is None:
            blocks_in = []
        if not isinstance(blocks_in, list):
            raise LayoutValidationError("page.blocks doit être une liste")
        if len(blocks_in) > _MAX_BLOCKS_PER_PAGE:
            raise LayoutValidationError("trop de blocs sur une page")
        blocks_out: list[dict[str, Any]] = []
        for raw in blocks_in:
            cleaned = _sanitize_block(raw, materialize=materialize_image)
            if cleaned is not None:
                blocks_out.append(cleaned)
        page_out: dict[str, Any] = {"blocks": blocks_out}
        pid = page.get("id")
        if isinstance(pid, str) and pid.strip():
            page_out["id"] = pid.strip()[:120]
        pages_out.append(page_out)
    out: dict[str, Any] = {"version": _LAYOUT_VERSION, "pages": pages_out}
    for key in ("format", "grid", "unit", "theme", "fonts", "meta"):
        val = layout.get(key)
        if val is not None:
            out[key] = val
    if layout.get("freeform") is True:
        out["freeform"] = True
    return out
