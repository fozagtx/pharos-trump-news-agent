"""Complete Exa-backed Trump News Agent skill."""

from __future__ import annotations

import json
import os
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from urllib.request import Request, urlopen


EXA_SEARCH_URL = "https://api.exa.ai/search"
SKILL_NAME = "trump_news_agent"
TARGET_ENTITY = "Donald Trump"
DEFAULT_NUM_RESULTS = 10
MAX_NUM_RESULTS = 25
DEFAULT_FRESHNESS_DAYS = 7
MAX_FRESHNESS_DAYS = 60

TONE_ALIASES = {
    "serious_reporting": "serious",
    "neutral_analysis": "neutral",
    "media_bias": "bias_aware",
    "bias": "bias_aware",
    "satire": "satirical",
    "memes": "meme",
    "soundbites": "soundbite",
}
SUPPORTED_TONES = {"serious", "satirical", "neutral", "bias_aware", "meme", "soundbite"}

BIAS_HINTS = {
    "apnews.com": "center",
    "reuters.com": "center",
    "bbc.com": "center",
    "c-span.org": "center",
    "thehill.com": "center",
    "politico.com": "center",
    "axios.com": "center",
    "abcnews.go.com": "center",
    "cbsnews.com": "center",
    "npr.org": "left",
    "nytimes.com": "left",
    "washingtonpost.com": "left",
    "cnn.com": "left",
    "msnbc.com": "left",
    "nbcnews.com": "left",
    "foxnews.com": "right",
    "nypost.com": "right",
    "wsj.com": "right",
}

UNSAFE_KEYS = {"headers", "cookies", "proxy", "proxies", "shell", "command", "file_path", "private_key"}
TRACKING_PARAMS = {"fbclid", "gclid", "mc_cid", "mc_eid", "igshid", "ref"}


class SkillError(Exception):
    """Skill boundary error with stable code."""

    def __init__(self, code: str, message: str, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable


def run(*args: Any, **kwargs: Any) -> Dict[str, Any]:
    """Run one complete Trump news workflow."""

    generated_at = _now_iso()
    try:
        metadata = _coerce_metadata(args, kwargs)
        _reject_unsafe(metadata)
        exa_api_key = _api_key(metadata, "exa", "EXA_API_KEY")
        if not exa_api_key:
            raise SkillError("MISSING_API_KEY", "Provide EXA_API_KEY, exa_api_key, or api_keys.exa.")

        prompt = str(metadata.get("prompt") or metadata.get("query") or "").strip()
        if not prompt:
            raise SkillError("INVALID_METADATA", "A non-empty prompt or query is required.")

        tone = _tone(metadata.get("tone") or metadata.get("mode") or "neutral")
        audience = str(metadata.get("audience") or "general").strip()
        max_words = _clamp_int(metadata.get("max_words", 600), 80, 1500)
        query = _trump_query(prompt)
        exa_payload = _exa_payload(query, metadata)
        exa_response = _post_json(EXA_SEARCH_URL, exa_payload, exa_api_key, timeout=_clamp_int(metadata.get("timeout", 25), 5, 60))
        articles, removed_count = _normalize_articles(exa_response.get("results", []), metadata)

        if not articles:
            raise SkillError("NO_RESULTS", "Exa returned no usable Trump-related results.")

        bullets = _bullets(articles)
        source_balance = _source_balance(articles)
        fact_check = _fact_check(articles)
        safety = _safety(articles, source_balance, fact_check, tone)
        style_payload = _style_payload(tone, bullets, articles)

        return {
            "schema_version": "1.0",
            "status": "partial" if safety["requires_human_review"] else "success",
            "skill": SKILL_NAME,
            "target_entity": TARGET_ENTITY,
            "tone": tone,
            "audience": audience,
            "generated_at": generated_at,
            "request_id": exa_response.get("requestId"),
            "query": query,
            "result_count": len(articles),
            "articles": articles,
            "source_balance": source_balance,
            "trending_topics": _trending_topics(articles),
            "deduplication": {"enabled": True, "removed_count": removed_count},
            "headline": _headline(tone, articles),
            "summary": _limit_words(_summary(bullets), max_words),
            "analysis": _analysis(tone, audience, bullets, source_balance, fact_check, max_words),
            "fact_check": fact_check,
            "style_payload": style_payload,
            "citations": _citations(bullets, articles),
            "safety": safety,
            "warnings": safety["warnings"],
        }
    except SkillError as exc:
        return _error(exc.code, exc.message, exc.retryable, generated_at)
    except Exception as exc:  # pragma: no cover
        return _error("UNEXPECTED_ERROR", str(exc), False, generated_at)


def _coerce_metadata(args: Tuple[Any, ...], kwargs: Mapping[str, Any]) -> Dict[str, Any]:
    metadata: Dict[str, Any] = {}
    if args:
        if len(args) == 1 and isinstance(args[0], Mapping):
            metadata.update(dict(args[0]))
        elif len(args) == 1 and isinstance(args[0], str):
            metadata["prompt"] = args[0]
        else:
            raise SkillError("INVALID_METADATA", "run accepts a metadata dict or prompt string.")
    nested = kwargs.get("metadata")
    if isinstance(nested, Mapping):
        metadata.update(dict(nested))
    for key, value in kwargs.items():
        if key != "metadata":
            metadata[key] = value
    return metadata


def _reject_unsafe(metadata: Mapping[str, Any]) -> None:
    found = sorted(key for key in metadata if key in UNSAFE_KEYS)
    if found:
        raise SkillError("UNSAFE_INPUT", f"Unsupported metadata keys: {', '.join(found)}")


def _api_key(metadata: Mapping[str, Any], name: str, env_name: str) -> str:
    api_keys = metadata.get("api_keys")
    nested = ""
    if isinstance(api_keys, Mapping):
        nested = str(api_keys.get(name) or api_keys.get(f"{name}_api_key") or "").strip()
    return str(metadata.get(f"{name}_api_key") or nested or os.getenv(env_name) or "").strip()


def _tone(raw: Any) -> str:
    tone = TONE_ALIASES.get(str(raw or "neutral").strip().lower(), str(raw or "neutral").strip().lower())
    if tone not in SUPPORTED_TONES:
        raise SkillError("INVALID_METADATA", f"Unsupported tone: {raw}")
    return tone


def _trump_query(prompt: str) -> str:
    lowered = prompt.lower()
    if "trump" in lowered or "donald" in lowered:
        return prompt
    return f"Donald Trump latest news {prompt}"


def _exa_payload(query: str, metadata: Mapping[str, Any]) -> Dict[str, Any]:
    freshness_days = _clamp_int(metadata.get("freshness_days", DEFAULT_FRESHNESS_DAYS), 1, MAX_FRESHNESS_DAYS)
    start_date = metadata.get("date_from") or metadata.get("start_published_date")
    end_date = metadata.get("date_to") or metadata.get("end_published_date")
    payload: Dict[str, Any] = {
        "query": query,
        "type": str(metadata.get("search_type") or "auto"),
        "category": "news",
        "numResults": _clamp_int(metadata.get("num_results", DEFAULT_NUM_RESULTS), 1, MAX_NUM_RESULTS),
        "userLocation": str(metadata.get("region") or "US")[:2].upper(),
        "moderation": True,
        "contents": {"highlights": True, "summary": True},
        "systemPrompt": (
            "Return factual Trump-related news, official statements, court records, wire reporting, "
            "and clearly labeled analysis. Avoid duplicate syndications and campaign persuasion."
        ),
    }
    if start_date:
        payload["startPublishedDate"] = _date_iso(str(start_date), True)
    else:
        payload["startPublishedDate"] = (datetime.now(timezone.utc) - timedelta(days=freshness_days)).isoformat()
    if end_date:
        payload["endPublishedDate"] = _date_iso(str(end_date), False)
    include_domains = _domains(metadata.get("include_domains") or [])
    exclude_domains = _domains(metadata.get("exclude_domains") or [])
    if include_domains:
        payload["includeDomains"] = include_domains
    if exclude_domains:
        payload["excludeDomains"] = exclude_domains
    return payload


def _post_json(url: str, payload: Mapping[str, Any], api_key: str, timeout: int) -> Dict[str, Any]:
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-api-key": api_key, "User-Agent": f"{SKILL_NAME}/0.1.0"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        if exc.code in {401, 403}:
            raise SkillError("EXA_AUTH_FAILED", "Exa rejected the API key.")
        if exc.code == 429:
            raise SkillError("EXA_RATE_LIMITED", "Exa rate limit reached.", True)
        raise SkillError("EXA_PROVIDER_ERROR", f"Exa HTTP {exc.code}: {detail}", 500 <= exc.code < 600)
    except URLError as exc:
        raise SkillError("EXA_TIMEOUT", f"Exa request failed or timed out: {exc.reason}", True)
    except json.JSONDecodeError as exc:
        raise SkillError("EXA_PROVIDER_ERROR", "Exa returned invalid JSON.", True) from exc


def _normalize_articles(raw_results: Iterable[Mapping[str, Any]], metadata: Mapping[str, Any]) -> Tuple[List[Dict[str, Any]], int]:
    wanted_bias = str(metadata.get("bias") or "all").lower()
    seen = set()
    articles: List[Dict[str, Any]] = []
    removed = 0
    for item in raw_results:
        url = _strip_tracking(str(item.get("url") or ""))
        if not url:
            continue
        if url in seen:
            removed += 1
            continue
        seen.add(url)
        domain = _domain(url)
        bias = BIAS_HINTS.get(domain, "unknown")
        if wanted_bias != "all" and bias != wanted_bias:
            removed += 1
            continue
        title = str(item.get("title") or url).strip()
        highlights = _string_list(item.get("highlights"))
        summary = _first_text(item.get("summary"), item.get("text"), highlights)
        if "trump" not in f"{title} {summary}".lower() and "donald" not in f"{title} {summary}".lower():
            removed += 1
            continue
        articles.append(
            {
                "article_id": f"article_{len(articles) + 1}",
                "title": title,
                "url": url,
                "domain": domain,
                "source": domain,
                "author": item.get("author"),
                "published_date": _date_only(item.get("publishedDate")),
                "retrieved_at": _now_iso(),
                "summary": _truncate(summary, 900),
                "key_points": [_truncate(point, 260) for point in (highlights or [summary]) if point][:5],
                "source_type": _content_type(title, url),
                "political_lean": bias,
                "source_bias_hint": bias,
                "credibility_notes": _credibility_note(domain, title, url),
            }
        )
    return articles, removed


def _bullets(articles: List[Dict[str, Any]]) -> List[str]:
    bullets = []
    for article in articles[:5]:
        point = (article.get("key_points") or [article.get("summary") or article.get("title")])[0]
        bullets.append(_neutralize(str(point)))
    return [_truncate(item, 260) for item in bullets if item]


def _summary(bullets: List[str]) -> str:
    return " ".join(bullets) if bullets else "No summary could be generated from the returned articles."


def _analysis(tone: str, audience: str, bullets: List[str], source_balance: Mapping[str, int], fact_check: Mapping[str, Any], max_words: int) -> str:
    base = _summary(bullets)
    if tone == "serious":
        text = f"For a {audience} audience, the civic significance is the legal, electoral, and institutional context around these developments: {base}"
    elif tone == "bias_aware":
        text = f"Source framing: {dict(source_balance)}. Main evidence: {base}"
    elif tone == "satirical":
        text = f"Satire label: political satire based on cited reporting. Factual spine: {base}"
    elif tone == "meme":
        text = f"Meme-ready factual spine: {base}"
    elif tone == "soundbite":
        text = f"Soundbite-ready factual spine: {base}"
    else:
        text = base
    if fact_check.get("overall_confidence") != "high":
        text += " Verify single-source claims before publication."
    return _limit_words(text, max_words)


def _fact_check(articles: List[Dict[str, Any]]) -> Dict[str, Any]:
    domains = {article["domain"] for article in articles if article.get("domain")}
    claims = []
    for article in articles[:6]:
        claim = _first_claim(article)
        claims.append(
            {
                "claim": _truncate(_neutralize(claim), 240),
                "verdict": "supported" if len(domains) > 1 else "unverified",
                "evidence_article_ids": [article["article_id"]],
                "note": "Corroborate with primary sources before publishing." if len(domains) < 2 else "Cross-source context available.",
            }
        )
    return {
        "overall_confidence": "high" if len(domains) >= 3 else "medium" if len(domains) == 2 else "low",
        "claims": claims,
        "missing_context": [] if len(domains) >= 2 else ["Only one source domain represented."],
    }


def _style_payload(tone: str, bullets: List[str], articles: List[Dict[str, Any]]) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"meme_captions": [], "soundbites": [], "satire_label": None}
    if tone == "meme":
        payload["meme_captions"] = [
            {
                "top_text": "Trump news cycle",
                "bottom_text": _truncate(bullet, 110),
                "citation_urls": _urls_for_index(articles, idx),
            }
            for idx, bullet in enumerate(bullets[:3])
        ]
    if tone in {"soundbite", "satirical"}:
        payload["soundbites"] = [_truncate(f"Based on cited reporting: {bullet}", 180) for bullet in bullets[:4]]
    if tone == "satirical":
        payload["satire_label"] = "Political satire based on cited reporting; no invented facts or fake quotes."
    return payload


def _safety(articles: List[Dict[str, Any]], balance: Mapping[str, int], fact_check: Mapping[str, Any], tone: str) -> Dict[str, Any]:
    warnings: List[str] = []
    if len({article.get("domain") for article in articles}) < 2:
        warnings.append("Only one source domain represented.")
    if fact_check.get("overall_confidence") == "low":
        warnings.append("Low confidence due to weak corroboration.")
    if tone in {"satirical", "meme", "soundbite"}:
        warnings.append("Creative output must keep citations and avoid fake quotes.")
    if balance.get("left", 0) > balance.get("center", 0) + balance.get("right", 0):
        warnings.append("Source mix skews left.")
    if balance.get("right", 0) > balance.get("center", 0) + balance.get("left", 0):
        warnings.append("Source mix skews right.")
    risk = "high" if len(warnings) >= 3 else "medium" if warnings else "low"
    return {"misinformation_risk": risk, "requires_human_review": risk != "low", "warnings": warnings}


def _source_balance(articles: Iterable[Mapping[str, Any]]) -> Dict[str, int]:
    counts = Counter(str(article.get("source_bias_hint") or "unknown") for article in articles)
    return {key: counts.get(key, 0) for key in ("center", "left", "right", "unknown")}


def _trending_topics(articles: Iterable[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    stop = {"donald", "trump", "latest", "news", "said", "with", "from", "that", "this", "will", "have"}
    counts: Counter[str] = Counter()
    for article in articles:
        text = f"{article.get('title', '')} {article.get('summary', '')}"
        counts.update(token for token in _tokens(text) if token not in stop and len(token) > 4)
    return [{"term": term, "count": count} for term, count in counts.most_common(10)]


def _citations(bullets: List[str], articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    citations = []
    for idx, bullet in enumerate(bullets):
        article = articles[min(idx, len(articles) - 1)]
        citations.append({"claim": bullet, "article_ids": [article["article_id"]], "urls": [article["url"]], "titles": [article["title"]]})
    return citations


def _headline(tone: str, articles: List[Dict[str, Any]]) -> str:
    if tone == "bias_aware":
        return "Trump media framing brief"
    if tone == "meme":
        return "Trump meme brief"
    if tone == "soundbite":
        return "Trump soundbite brief"
    return _truncate(str(articles[0].get("title") or "Trump news briefing"), 120)


def _first_claim(article: Mapping[str, Any]) -> str:
    points = article.get("key_points")
    if isinstance(points, list) and points:
        return str(points[0])
    return str(article.get("summary") or article.get("title") or "")


def _content_type(title: str, url: str) -> str:
    lowered = f"{title} {url}".lower()
    if "fact check" in lowered or "fact-check" in lowered:
        return "fact_check"
    if any(word in lowered for word in ("opinion", "editorial", "column")):
        return "opinion"
    if "analysis" in lowered:
        return "analysis"
    return "news"


def _credibility_note(domain: str, title: str, url: str) -> str:
    if _content_type(title, url) == "opinion":
        return "Opinion framing detected; separate it from factual reporting."
    if domain in {"apnews.com", "reuters.com"}:
        return "Wire service reporting."
    if domain.endswith(".gov"):
        return "Official source."
    return "Publisher source; verify important claims across multiple outlets."


def _first_text(*values: Any) -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, list):
            joined = " ".join(str(item).strip() for item in value if str(item).strip())
            if joined:
                return joined
    return ""


def _string_list(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _domains(values: Iterable[Any]) -> List[str]:
    if isinstance(values, str):
        values = [values]
    domains = []
    for value in values:
        domain = _domain(str(value))
        if domain:
            domains.append(domain)
    return domains


def _domain(url_or_domain: str) -> str:
    value = str(url_or_domain).strip().lower()
    parsed = urlparse(value if "://" in value else f"https://{value}")
    host = (parsed.netloc or parsed.path).split("@")[-1].split(":")[0]
    return host[4:] if host.startswith("www.") else host


def _strip_tracking(url: str) -> str:
    parsed = urlparse(url)
    query = [(key, value) for key, value in parse_qsl(parsed.query, keep_blank_values=True) if key not in TRACKING_PARAMS and not key.startswith("utm_")]
    return urlunparse(parsed._replace(query=urlencode(query), fragment=""))


def _date_iso(value: str, start: bool) -> str:
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return f"{value}T{'00:00:00' if start else '23:59:59'}+00:00"
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()


def _date_only(value: Any) -> Optional[str]:
    if not value:
        return None
    match = re.match(r"(\d{4}-\d{2}-\d{2})", str(value))
    return match.group(1) if match else str(value)


def _neutralize(text: str) -> str:
    replacements = {"bombshell": "major", "shocking": "notable", "destroys": "criticizes", "humiliates": "criticizes"}
    clean = str(text)
    for loaded, neutral in replacements.items():
        clean = re.sub(rf"\b{loaded}\b", neutral, clean, flags=re.IGNORECASE)
    return clean


def _tokens(text: str) -> List[str]:
    return re.findall(r"[a-z0-9][a-z0-9-]{2,}", text.lower())


def _urls_for_index(articles: List[Dict[str, Any]], index: int) -> List[str]:
    if not articles:
        return []
    return [articles[min(index, len(articles) - 1)]["url"]]


def _clamp_int(value: Any, low: int, high: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = low
    return max(low, min(number, high))


def _limit_words(text: str, max_words: int) -> str:
    words = str(text).split()
    return " ".join(words[:max_words]) + ("..." if len(words) > max_words else "")


def _truncate(text: str, limit: int) -> str:
    clean = " ".join(str(text or "").split())
    return clean if len(clean) <= limit else clean[: max(0, limit - 1)].rstrip() + "..."


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _error(code: str, message: str, retryable: bool, generated_at: str) -> Dict[str, Any]:
    return {
        "schema_version": "1.0",
        "status": "error",
        "skill": SKILL_NAME,
        "generated_at": generated_at,
        "error_code": code,
        "message": message,
        "retryable": retryable,
        "articles": [],
        "citations": [],
    }

