# Reasoning / Thinking Mode in Chat Completions

This document explains how reasoning (also called "thinking mode") is
configured across different model providers when using the **OpenAI Chat
Completions API** (`POST /v1/chat/completions`). We only target this
API surface for now.

## Table of Contents

- [Overview](#overview)
- [OpenAI Models](#openai-models)
- [Anthropic Models](#anthropic-models)
- [DeepSeek Models](#deepseek-models)
- [Qwen Models (Alibaba)](#qwen-models-alibaba)
- [Kimi Models (Moonshot)](#kimi-models-moonshot)
- [GLM Models (Z.ai)](#glm-models-zai)
- [MiMo Models (Xiaomi)](#mimo-models-xiaomi)
- [Preserving Reasoning Tokens](#preserving-reasoning-tokens)
- [References](#references)

## Overview

Many modern LLMs support a "thinking" or "reasoning" mode where the
model performs chain-of-thought reasoning before producing its final
answer. The reasoning tokens are returned separately from the main
content and are billed as output tokens.

Key concepts:

- **Reasoning tokens** — internal chain-of-thought tokens generated
    before the final answer.
- **Reasoning effort** — controls how much compute the model spends
    on reasoning (e.g. `low`, `medium`, `high`).
- **Preserved thinking** — passing reasoning tokens from previous
    turns back to the model so it can continue its chain of thought
    across multi-turn conversations and tool calls.

Each provider uses slightly different parameters to control these
features. The sections below document the exact API shape for each.

## OpenAI Models

OpenAI reasoning models (o-series, GPT-5 series) use a native
`reasoning_effort` parameter at the top level of the request body.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `reasoning_effort` | string | Controls reasoning intensity. Values: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`. |

### Defaults

- `gpt-5.1` defaults to `none` (no reasoning). Supports `none`,
    `low`, `medium`, `high`.
- Other GPT-5 models default to `medium`.
- `gpt-5-pro` defaults to and only supports `high`.
- `xhigh` is supported for `gpt-5.1-codex-max` and newer.

### Response

Reasoning tokens are counted in
`usage.completion_tokens_details.reasoning_tokens`. OpenAI o-series
models do **not** return reasoning token content in the response.
GPT-5 series models return reasoning in `reasoning_content`.

### Example

```python
response = client.chat.completions.create(
    model="gpt-5.4",
    messages=[{"role": "user", "content": "Solve this problem..."}],
    reasoning_effort="high",
)
```

### Preserving reasoning

OpenAI does **not** support preserved thinking in the Chat
Completions API. Reasoning tokens are internal and discarded
between turns. The "keeping reasoning items in context"
guidance applies only to the Responses API.

## Anthropic Models

Anthropic models (Claude 3.7+, Sonnet 4.x, Opus 4.x) use the
`reasoning` parameter via OpenRouter, or extended thinking via the
Anthropic API.

### Parameters (via OpenRouter)

| Parameter | Type | Description |
| --- | --- | --- |
| `reasoning.effort` | string | Effort level: `minimal`, `low`, `medium`, `high`, `xhigh`. |
| `reasoning.max_tokens` | integer | Explicit token budget for reasoning (min 1024, max 128000). |

These are passed via `extra_body` when using the OpenAI SDK:

```python
response = client.chat.completions.create(
    model="anthropic/claude-sonnet-4.5",
    messages=[...],
    extra_body={"reasoning": {"effort": "high"}},
)
```

### Defaults

- Reasoning is off by default. Must be explicitly enabled via the
    `reasoning` parameter.
- `max_tokens` must be strictly greater than the reasoning budget.

### Response

Reasoning content appears in
`choices[].message.reasoning_details` (an array of typed objects)
or `choices[].message.reasoning` (plaintext string).

### Preserving reasoning

Pass `reasoning_details` back unmodified on assistant messages.
The entire sequence of consecutive reasoning blocks must match the
original output exactly — do not reorder or edit them.

## DeepSeek Models

DeepSeek models (V4-Pro, V4-Flash, V3.x series) use a `thinking`
object in `extra_body` combined with `reasoning_effort` at the top
level.

### Parameters

| Parameter | Location | Type | Description |
| --- | --- | --- | --- |
| `thinking.type` | `extra_body` | string | `"enabled"` or `"disabled"`. Defaults to `enabled`. |
| `reasoning_effort` | top-level | string | `"high"` or `"max"`. Controls reasoning intensity when thinking is enabled. |

> **Note:** `low` and `medium` are mapped to `high`, and `xhigh`
> is mapped to `max`.

### Example

```python
response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=[...],
    reasoning_effort="high",
    extra_body={"thinking": {"type": "enabled"}},
)
```

### To disable thinking

```python
response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=[...],
    extra_body={"thinking": {"type": "disabled"}},
)
```

### Response

Reasoning content is returned in
`choices[].message.reasoning_content` at the same level as
`content`.

### Preserving reasoning

- **Without tool calls:** `reasoning_content` from previous turns
    does **not** need to be included in context. If passed, it is
    ignored.
- **With tool calls:** `reasoning_content` **must** be fully
    passed back to the API in all subsequent requests. If not
    passed correctly, the API returns a 400 error.

The simplest approach is to append `response.choices[0].message`
directly to the messages list, which includes `content`,
`reasoning_content`, and `tool_calls`.

## Qwen Models (Alibaba)

Qwen models (Qwen3.6, Qwen3.5, Qwen3, Qwen3-VL, Qwen3-Omni)
use `enable_thinking` and `preserve_thinking` booleans. These are
**not** standard OpenAI parameters and must be passed via
`extra_body`.

### Parameters

| Parameter | Location | Type | Description |
| --- | --- | --- | --- |
| `enable_thinking` | `extra_body` | boolean | Enables/disables thinking mode. Default varies by model. |
| `preserve_thinking` | `extra_body` | boolean | When `true`, includes `reasoning_content` from past assistant messages in model input. Defaults to `false`. |
| `thinking_budget` | `extra_body` | integer | Max tokens for the thinking process. Optional. |

### Example — enable thinking

```python
response = client.chat.completions.create(
    model="qwen-3.6-plus",
    messages=[...],
    extra_body={
        "enable_thinking": True,
        "preserve_thinking": True,
    },
)
```

### Example — disable thinking

```python
response = client.chat.completions.create(
    model="qwen-3.6-plus",
    messages=[...],
    extra_body={"enable_thinking": False},
)
```

### Response

Reasoning content is returned in
`choices[].message.reasoning_content`.

### Preserving reasoning

Set `preserve_thinking: true` in `extra_body` and include the
full `reasoning_content` from past assistant messages in the
`messages` array. Currently supported for `qwen3.6-max-preview`,
`qwen3.6-plus`, and `kimi-k2.6` (via Alibaba Cloud Model
Studio).

When enabled, `reasoning_content` is included in input tokens
and billed accordingly.

## Kimi Models (Moonshot)

Kimi models (`kimi-k2-thinking`, `kimi-k2.6`) use a `thinking`
object at the **top level** of the request body (not in
`extra_body`).

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `thinking.type` | string | `"enabled"` or `"disabled"`. For `kimi-k2.6`, thinking is enabled by default. |
| `thinking.keep` | string or null | Controls preserved thinking. `null` (default): historical `reasoning_content` is ignored. `"all"`: historical `reasoning_content` is fully preserved. |

> `thinking.keep` only affects `reasoning_content` from historical
> turns. It does not control whether the model generates thinking
> in the current turn (that is controlled by `thinking.type`).

### Example — enable thinking with preserved reasoning

```python
response = client.chat.completions.create(
    model="kimi-k2.6",
    messages=[...],
    thinking={
        "type": "enabled",
        "keep": "all",
    },
)
```

### Example — disable thinking

```python
response = client.chat.completions.create(
    model="kimi-k2.6",
    messages=[...],
    thinking={"type": "disabled"},
)
```

### Response

Reasoning content is returned in
`choices[].message.reasoning_content`. In streaming mode,
`reasoning_content` always appears before `content`.

Tokens in `reasoning_content` are controlled by `max_tokens`:
the sum of `reasoning_content` and `content` tokens must be
<= `max_tokens`.

### Preserving reasoning

Set `thinking.keep` to `"all"` and include the full
`reasoning_content` from every historical assistant message in
`messages`. The simplest way is to append the assistant message
returned from the previous API call directly back into `messages`.

`reasoning_content` counts toward token consumption and billing.

### Best practices

- Set `max_tokens >= 16000` to avoid truncation.
- Set `temperature = 1.0` for best performance (`kimi-k2.6` uses
    a fixed temperature of 1.0).
- Enable streaming (`stream = true`) to avoid timeouts.

## GLM Models (Z.ai)

GLM models (GLM-5.1, GLM-5, GLM-4.7, GLM-4.6) use a `thinking`
object at the **top level** of the request body (not in
`extra_body`).

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `thinking.type` | string | `"enabled"` or `"disabled"`. Thinking is enabled by default in GLM-5.1, GLM-5, GLM-4.7. |
| `thinking.clear_thinking` | boolean | `false` to enable preserved thinking (retains `reasoning_content` from previous turns). Defaults to `true`. |

### Example — enable thinking with preserved reasoning

```python
response = client.chat.completions.create(
    model="glm-5.1",
    messages=[...],
    thinking={
        "type": "enabled",
        "clear_thinking": False,
    },
)
```

### Example — disable thinking

```python
response = client.chat.completions.create(
    model="glm-5.1",
    messages=[...],
    thinking={"type": "disabled"},
)
```

### Response

Reasoning content is returned in
`choices[].message.reasoning_content`.

### Features

- **Interleaved thinking** — GLM models (since GLM-4.5) think
    between tool calls and after receiving tool results, enabling
    step-by-step reasoning across multi-step tool use.
- **Preserved thinking** — when `clear_thinking` is `false`, the
    model retains reasoning from previous turns, improving
    reasoning continuity, performance, and cache hit rates.
- **Turn-level thinking** — since GLM-4.7, thinking can be
    toggled on a per-turn basis within the same session.

### Preserving reasoning

Set `clear_thinking: false` and return the complete, unmodified
`reasoning_content` back to the API. All consecutive
`reasoning_content` blocks must exactly match the original
sequence — do not reorder or edit them.

## MiMo Models (Xiaomi)

MiMo models (`mimo-v2.5-pro`, `mimo-v2-pro`, `mimo-v2-flash`) use
a `thinking` object at the **top level** of the request body (not
in `extra_body`).

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `thinking.type` | string | `"enabled"` or `"disabled"`. Defaults vary by model: `mimo-v2-flash` defaults to `disabled`; `mimo-v2.5-pro` and `mimo-v2-pro` default to `enabled`. |

### Example

```python
response = client.chat.completions.create(
    model="mimo-v2.5-pro",
    messages=[...],
    thinking={"type": "enabled"},
)
```

### Response

Reasoning content is returned in
`choices[].message.reasoning_content`.

Usage details include
`usage.completion_tokens_details.reasoning_tokens`.

### Preserving reasoning

During multi-turn tool calls in thinking mode, the model returns
`reasoning_content` alongside `tool_calls`. To continue the
conversation, keep all previous `reasoning_content` in the
`messages` array for each subsequent request.

## Preserving Reasoning Tokens

Preserving reasoning (also called "preserved thinking") means
passing the model's reasoning from previous turns back in the
conversation history, so the model can continue its prior chain
of thought.

Different providers return reasoning in different response fields:

- `reasoning_content` (string) — DeepSeek, Qwen, Kimi, GLM, MiMo
- `reasoning` (string) — OpenRouter (plaintext)
- `reasoning_details` (array) — OpenRouter (structured objects
    that may include encrypted or signed blocks)

When preserving reasoning, keep **all** reasoning fields present
on the assistant message. Do not pick one — `reasoning_details`
contains structured metadata (encryption, signatures) that cannot
be reconstructed from the plaintext `reasoning` string.

### When to preserve reasoning

Preserving reasoning is most important during **tool calling**.
When a model invokes tools, it pauses response construction to
await external information. Including the original reasoning
ensures:

- **Reasoning continuity** — the model continues reasoning from
    where it left off.
- **Context maintenance** — the conceptual reasoning flow is
    maintained across multiple API calls.

### Rules

1. The entire sequence of consecutive reasoning blocks must match
    the original output exactly.
2. Do **not** reorder, edit, or truncate reasoning blocks.
3. Reasoning tokens count toward input token consumption and are
    billed accordingly.

### Preserve Reasoning Summary

To preserve reasoning across turns, two things are needed:
(1) include reasoning from previous assistant messages in the
conversation history (the field name varies by provider —
`reasoning_content`, `reasoning`, or `reasoning_details`), and
(2) set a provider-specific parameter if required. Some providers
preserve automatically when reasoning is present; others require
an explicit opt-in parameter.

| Provider | How to enable | Location |
| --- | --- | --- |
| OpenAI | Not supported in Chat Completions API | — |
| Anthropic (via OpenRouter) | Include `reasoning_details` array on assistant messages (automatic) | top-level |
| DeepSeek | Include `reasoning_content` on assistant messages (automatic, required for tool calls, ignored otherwise) | top-level |
| Qwen | Set `preserve_thinking: true` and include `reasoning_content` on assistant messages | `extra_body` |
| Kimi | Set `thinking.keep: "all"` and include `reasoning_content` on assistant messages | top-level |
| GLM | Set `thinking.clear_thinking: false` and include `reasoning_content` on assistant messages | top-level |
| MiMo | Include `reasoning_content` on assistant messages (automatic) | top-level |

## Reasoning Effort Summary

How each provider controls the amount of reasoning effort.

| Provider | Toggle parameter | Effort parameter | Supported levels | Location |
| --- | --- | --- | --- | --- |
| OpenAI | Always on (use `none` to disable) | `reasoning_effort` | `none`, `minimal`, `low`, `medium`, `high`, `xhigh` | top-level |
| Anthropic (via OpenRouter) | `reasoning.enabled` | `reasoning.effort` or `reasoning.max_tokens` | `minimal`, `low`, `medium`, `high`, `xhigh` | `extra_body` |
| DeepSeek | `thinking.type` | `reasoning_effort` | `high`, `max` (`low`/`medium` → `high`, `xhigh` → `max`) | `thinking` in `extra_body`, effort at top-level |
| Qwen | `enable_thinking` | `thinking_budget` (token count) | boolean on/off + optional token budget | `extra_body` |
| Kimi | `thinking.type` | — | on/off only (no effort levels) | top-level |
| GLM | `thinking.type` | — | on/off only (no effort levels) | top-level |
| MiMo | `thinking.type` | — | on/off only (no effort levels) | top-level |

## References

- [OpenAI Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)
- [Alibaba Cloud Model Studio — OpenAI-compatible Chat](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions)
- [Kimi — Using Thinking Models](https://platform.kimi.ai/docs/guide/use-kimi-k2-thinking-model)
- [Z.ai — Thinking Mode](https://docs.z.ai/guides/capabilities/thinking-mode)
- [Xiaomi MiMo — OpenAI API](https://platform.xiaomimimo.com/docs/en-US/api/chat/openai-api)
- [OpenRouter — Reasoning Tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
