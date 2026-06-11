# Trump News Agent IO Schema

## Input

```json
{
  "prompt": "latest Trump legal news",
  "query": "optional alias for prompt",
  "exa_api_key": "optional, prefer EXA_API_KEY",
  "api_keys": {
    "exa": "optional"
  },
  "tone": "neutral",
  "audience": "general",
  "num_results": 10,
  "freshness_days": 7,
  "date_from": "2026-06-01",
  "date_to": "2026-06-11",
  "include_domains": ["apnews.com", "reuters.com"],
  "exclude_domains": [],
  "search_type": "auto",
  "bias": "all",
  "region": "US",
  "max_words": 600
}
```

## Output

```json
{
  "schema_version": "1.0",
  "status": "success",
  "skill": "trump_news_agent",
  "target_entity": "Donald Trump",
  "tone": "neutral",
  "query": "Donald Trump latest news ...",
  "articles": [],
  "source_balance": {},
  "trending_topics": [],
  "headline": "Trump news briefing",
  "summary": "Grounded summary.",
  "analysis": "Tone-specific analysis.",
  "fact_check": {
    "overall_confidence": "medium",
    "claims": []
  },
  "style_payload": {
    "meme_captions": [],
    "soundbites": [],
    "satire_label": null
  },
  "citations": [],
  "safety": {
    "misinformation_risk": "medium",
    "requires_human_review": true,
    "warnings": []
  }
}
```

