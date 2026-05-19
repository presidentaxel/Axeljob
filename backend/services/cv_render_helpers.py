"""Helper functions extracted from backend.main for CV render and ATS highlighting."""

from __future__ import annotations

import html
import re
from difflib import SequenceMatcher

ATS_STOPWORDS = frozenset(
    {
        "de",
        "la",
        "le",
        "les",
        "des",
        "du",
        "et",
        "en",
        "un",
        "une",
        "aux",
        "au",
        "à",
        "a",
        "pour",
        "avec",
        "sans",
        "sur",
        "par",
        "dans",
        "est",
        "son",
        "sa",
        "ses",
        "ce",
        "cette",
        "ces",
        "qui",
        "que",
        "dont",
        "où",
        "plus",
        "pas",
        "ne",
        "nous",
        "vous",
        "ils",
        "elles",
        "elle",
        "the",
        "and",
        "for",
        "with",
        "from",
        "to",
        "of",
        "in",
        "on",
        "at",
        "or",
        "as",
        "by",
    }
)


def keywords_from_mots_cles_cache(cache: str) -> list[str]:
    """Tokens + bigrammes (+ trigrammes utiles), triés par longueur décroissante."""
    s = (cache or "").strip()
    if not s:
        return []
    tokens = [t.strip() for t in re.split(r"\s+", s) if t.strip()]
    seen: set[str] = set()
    phrases: list[str] = []

    def add_phrase(p: str) -> None:
        pl = p.lower().strip(".,;:")
        if len(pl) < 2 or pl in seen:
            return
        seen.add(pl)
        phrases.append(p)

    for t in tokens:
        tl = t.lower().strip(".,;:")
        if len(tl) < 2 or tl in ATS_STOPWORDS:
            continue
        add_phrase(t)

    for i in range(len(tokens) - 1):
        pair = f"{tokens[i]} {tokens[i + 1]}"
        pl = pair.lower().strip(".,;:")
        if len(pl.replace(" ", "")) >= 4:
            add_phrase(pair)

    for i in range(len(tokens) - 2):
        b = tokens[i + 1].lower().strip(".,;:")
        if b in ATS_STOPWORDS:
            continue
        tri = f"{tokens[i]} {tokens[i + 1]} {tokens[i + 2]}"
        tl = tri.lower().strip(".,;:")
        if len(tl.replace(" ", "")) >= 5:
            add_phrase(tri)

    phrases.sort(key=len, reverse=True)
    return phrases


def mots_cles_cache_for_pdf_export(raw: str, max_chars: int = 900) -> str:
    s = (raw or "").strip()
    if len(s) <= max_chars:
        return s
    return s[: max_chars - 1].rstrip() + "…"


def _ats_kw_boundary_ok(plain: str, start: int, end: int) -> bool:
    left = plain[start - 1] if start > 0 else ""
    right = plain[end] if end < len(plain) else ""

    def is_word_char(c: str) -> bool:
        return bool(c) and (c.isalnum() or c == "_")

    return not is_word_char(left) and not is_word_char(right)


def _ats_next_match(plain: str, i: int, kws: list[str]) -> tuple[int, int] | None:
    best_len = 0
    best: tuple[int, int] | None = None
    n = len(plain)
    for kw in kws:
        L = len(kw)
        if L == 0 or i + L > n:
            continue
        if plain[i : i + L].lower() != kw.lower():
            continue
        if not _ats_kw_boundary_ok(plain, i, i + L):
            continue
        if best_len < L:
            best_len = L
            best = (i, i + L)
    return best


def _ats_wrap_plain_text_segment(segment: str, kws: list[str]) -> str:
    if not segment or not kws:
        return segment
    plain = html.unescape(segment)
    out_parts: list[str] = []
    pos = 0
    while pos < len(plain):
        m = _ats_next_match(plain, pos, kws)
        if m is None:
            out_parts.append(html.escape(plain[pos]))
            pos += 1
            continue
        s, e = m
        out_parts.append(html.escape(plain[pos:s]))
        out_parts.append(f'<span class="cv-ats-kw">{html.escape(plain[s:e])}</span>')
        pos = e
    return "".join(out_parts)


def ats_highlight_preview_body(content_html: str, kws: list[str]) -> str:
    if not kws:
        return content_html
    low = content_html.lower()
    i = low.find("<body")
    if i < 0:
        return content_html
    m = re.search(r"<body[^>]*>", content_html[i : i + 300], re.I)
    if not m:
        return content_html
    start = i + m.end()
    j = low.rfind("</body>")
    if j < 0 or j <= start:
        return content_html
    before, body, after = content_html[:start], content_html[start:j], content_html[j:]

    protected: list[str] = []

    def stash(match: re.Match) -> str:
        protected.append(match.group(0))
        return f"__AXEL_ATS_PROT_{len(protected) - 1}__"

    body = re.sub(r"<style[^>]*>[\s\S]*?</style>", stash, body, flags=re.I)
    body = re.sub(r"<script[^>]*>[\s\S]*?</script>", stash, body, flags=re.I)

    pieces = re.split(r"(<[^>]+>)", body)
    out = [_ats_wrap_plain_text_segment(p, kws) if not p.startswith("<") else p for p in pieces]
    result = "".join(out)
    for idx, block in enumerate(protected):
        result = result.replace(f"__AXEL_ATS_PROT_{idx}__", block)
    return before + result + after


def diff_highlight_html(base: str, current: str) -> str:
    base = (base or "").strip()
    current = (current or "").strip()
    if base == current:
        return html.escape(current)
    out_lines = []
    base_lines = base.split("\n")
    current_lines = current.split("\n")
    for i, curr_line in enumerate(current_lines):
        base_line = base_lines[i] if i < len(base_lines) else ""
        if base_line == curr_line:
            out_lines.append(html.escape(curr_line))
            continue
        base_words = base_line.split()
        current_words = curr_line.split()
        if not current_words:
            out_lines.append("")
            continue
        matcher = SequenceMatcher(None, base_words, current_words)
        out = []
        for tag, _i1, _i2, j1, j2 in matcher.get_opcodes():
            segment = current_words[j1:j2]
            if not segment:
                continue
            escaped = html.escape(" ".join(segment))
            out.append(escaped if tag == "equal" else f'<span class="cv-changed">{escaped}</span>')
        out_lines.append(" ".join(out))
    return "\n".join(out_lines)
