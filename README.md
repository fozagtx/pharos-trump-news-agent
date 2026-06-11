<p align="center">
  <img src="assets/logo.svg" alt="Pharos Trump News Agent logo" width="180">
</p>

# Pharos Trump News Agent

An Exa-backed AI news skill for tracking, analyzing, and reporting Donald Trump-related news. It gathers live source material, normalizes article evidence, summarizes key developments, reviews source balance, creates fact-check notes, and can generate serious reports, neutral analysis, satire-labeled output, meme captions, or soundbites.

This is built as a Pharos-compatible skill package for the Skill-to-Agent Dual Cascade Hackathon.

## Features

- Real-time Trump-related news search through Exa
- Source normalization, deduplication, and relevance filtering
- Source-balance and rough media-leaning hints
- Concise summaries and tone-specific analysis
- Fact-check scaffolding with citations
- Meme caption and soundbite generation
- Safety flags for weak sourcing and creative output

## Requirements

- Python 3.10+
- `EXA_API_KEY`

No third-party Python package is required; the skill uses Python standard-library HTTP utilities.

## Install as a Skill

```bash
npx skills add https://github.com/fozagtx/pharos-trump-news-agent
```

After installing, set your Exa key:

```bash
export EXA_API_KEY="your_exa_key"
```

## Quick Start

```bash
export EXA_API_KEY="your_exa_key"
python3 scripts/run_trump_news_agent.py --metadata examples/trump-news-input.json --pretty
```

Or pipe JSON through stdin:

```bash
printf '%s\n' '{"prompt":"latest Trump legal news","tone":"neutral","num_results":5}' \
  | python3 scripts/run_trump_news_agent.py --pretty
```

## Input

```json
{
  "prompt": "latest Trump legal news",
  "tone": "neutral",
  "audience": "general",
  "num_results": 5,
  "freshness_days": 7,
  "bias": "all"
}
```

Supported tones:

- `serious`
- `satirical`
- `neutral`
- `bias_aware`
- `meme`
- `soundbite`

## Output

The skill returns JSON containing:

- normalized `articles`
- `source_balance`
- `trending_topics`
- `headline`
- `summary`
- `analysis`
- `fact_check`
- `style_payload`
- `citations`
- `safety`

## Skill Files

- `SKILL.md` - Pharos skill manifest and agent instructions
- `scripts/trump_news_agent.py` - reusable `run(metadata)` skill implementation
- `scripts/run_trump_news_agent.py` - CLI wrapper
- `references/io-schema.md` - detailed input/output schema
- `examples/trump-news-input.json` - sample request

## Safety Notes

This skill does not generate campaign persuasion, fundraising, endorsement, or voter-targeted messaging. It does not invent facts, fake quotes, court outcomes, poll numbers, or election results. Creative outputs are citation-grounded and flagged for human review.
