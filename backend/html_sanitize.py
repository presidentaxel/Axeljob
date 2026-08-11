"""Whitelist HTML pour le texte riche du canvas (édition inline / PDF).

Balises autorisées : strong, em, u, s, span, br (b/i normalisés vers strong/em).
Styles span limités : color, font-weight, font-style, text-decoration.
"""

from __future__ import annotations

import re
from html.parser import HTMLParser

_ALLOWED_TAGS = frozenset({"strong", "em", "u", "s", "span", "br"})
_TAG_ALIASES = {"b": "strong", "i": "em", "strike": "s"}
_ALLOWED_STYLE_PROPS = frozenset({"color", "font-weight", "font-style", "text-decoration"})
_COLOR_RE = re.compile(
    r"^(#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|"
    r"rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*[\d.]+\s*\)|"
    r"[a-zA-Z]{3,20})$"
)
_FONT_WEIGHT_RE = re.compile(r"^(normal|bold|[1-9]00)$", re.I)
_FONT_STYLE_RE = re.compile(r"^(normal|italic|oblique)$", re.I)
_TEXT_DECO_RE = re.compile(r"^(none|underline|line-through|underline line-through)$", re.I)


def _sanitize_style(raw: str | None) -> str:
    if not raw or not isinstance(raw, str):
        return ""
    parts: list[str] = []
    for decl in raw.split(";"):
        if ":" not in decl:
            continue
        prop, _, value = decl.partition(":")
        prop = prop.strip().lower()
        value = value.strip()
        if prop not in _ALLOWED_STYLE_PROPS or not value:
            continue
        if prop == "color" and not _COLOR_RE.match(value):
            continue
        if prop == "font-weight" and not _FONT_WEIGHT_RE.match(value):
            continue
        if prop == "font-style" and not _FONT_STYLE_RE.match(value):
            continue
        if prop == "text-decoration" and not _TEXT_DECO_RE.match(value):
            continue
        parts.append(f"{prop}:{value}")
    return ";".join(parts)


class _WhitelistParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._out: list[str] = []
        self._stack: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        name = _TAG_ALIASES.get(tag.lower(), tag.lower())
        if name not in _ALLOWED_TAGS:
            # Ignore nested content of forbidden tags (script, style, …).
            if tag.lower() in {"script", "style", "iframe", "object", "embed", "svg"}:
                self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if name == "br":
            self._out.append("<br>")
            return
        attr_map = {k.lower(): (v or "") for k, v in attrs}
        if name == "span":
            style = _sanitize_style(attr_map.get("style"))
            if style:
                self._out.append(f'<span style="{style}">')
            else:
                self._out.append("<span>")
        else:
            self._out.append(f"<{name}>")
        self._stack.append(name)

    def handle_endtag(self, tag: str) -> None:
        raw = tag.lower()
        if raw in {"script", "style", "iframe", "object", "embed", "svg"} and self._skip_depth:
            self._skip_depth -= 1
            return
        if self._skip_depth:
            return
        name = _TAG_ALIASES.get(raw, raw)
        if name not in _ALLOWED_TAGS or name == "br":
            return
        if name in self._stack:
            while self._stack:
                top = self._stack.pop()
                self._out.append(f"</{top}>")
                if top == name:
                    break

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self._skip_depth:
            return
        name = _TAG_ALIASES.get(tag.lower(), tag.lower())
        if name == "br":
            self._out.append("<br>")

    def handle_data(self, data: str) -> None:
        if self._skip_depth or not data:
            return
        self._out.append(
            data.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )

    def close_open(self) -> None:
        while self._stack:
            self._out.append(f"</{self._stack.pop()}>")

    def result(self) -> str:
        self.close_open()
        return "".join(self._out)


def sanitize_rich_text_html(html: str | None) -> str:
    """Retourne un fragment HTML restreint à la whitelist canvas."""
    if not html or not isinstance(html, str):
        return ""
    raw = html.strip()
    if not raw or raw == "<br>":
        return ""
    parser = _WhitelistParser()
    try:
        parser.feed(raw)
        parser.close()
    except Exception:
        return ""
    out = parser.result().strip()
    if out in ("", "<br>", "<span></span>"):
        return ""
    return out


def looks_like_rich_html(value: str | None) -> bool:
    if not value or not isinstance(value, str):
        return False
    return bool(re.search(r"</?(?:strong|em|u|s|span|b|i|br)\b", value, re.I))
