---
name: pharos-trump-news-agent
description: >
  Complete Trump News Agent skill for Pharos and general AI agents. Use when an
  agent needs to track, aggregate, analyze, summarize, fact-check, or generate
  tone-customized outputs from Donald Trump-related news using Exa web search.
  Supports serious reporting, neutral analysis, bias-aware media framing,
  political satire, meme captions, and soundbites in one reusable skill.
version: 0.1.0
requires:
  env:
    - EXA_API_KEY
---

# Pharos Trump News Agent

Track, analyze, and report Donald Trump-related news in one skill. This is a single reusable module, not a split search/report pair.

## Run

```bash
python3 scripts/run_trump_news_agent.py --metadata examples/trump-news-input.json --pretty
```

Or through stdin:

```bash
printf '%s\n' '{"prompt":"latest Trump legal news","tone":"neutral","num_results":5}' \
  | python3 scripts/run_trump_news_agent.py --pretty
```

## Input

```json
{
  "prompt": "latest Trump legal news",
  "exa_api_key": "optional, prefer EXA_API_KEY",
  "tone": "neutral",
  "audience": "general",
  "num_results": 10,
  "freshness_days": 7,
  "bias": "all"
}
```

Supported `tone` values:

- `serious`
- `satirical`
- `neutral`
- `bias_aware`
- `meme`
- `soundbite`

## Output

Returns JSON with normalized articles, source balance, trending topics, summary, analysis, fact-check notes, meme captions, soundbites, citations, and safety warnings.

## Guardrails

- Do not invent facts, quotes, poll numbers, court rulings, endorsements, or election results.
- Separate news, opinion, satire, campaign statements, official statements, and allegations.
- Do not generate campaign persuasion, fundraising, endorsement, or voter-targeting copy.
- Mark single-source claims as `unverified`.
- Satire and meme output must preserve the factual spine and remain clearly labeled.

