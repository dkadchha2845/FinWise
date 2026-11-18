"""Provider-agnostic LLM client (Groq and Gemini via their OpenAI-compatible endpoints)."""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
from dataclasses import dataclass, field
from typing import AsyncIterator

import httpx
from dotenv import load_dotenv

from . import db

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

PROVIDERS = {
    "groq": ("https://api.groq.com/openai/v1/chat/completions", "GROQ_API_KEY", "GROQ_MODEL", "openai/gpt-oss-120b"),
    "gemini": ("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", "GEMINI_API_KEY",
               "GEMINI_MODEL", "gemini-3.8-flash"),
}


@dataclass
class Stats:
    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    latency_s: float = 0.0
    cache_hits: int = 0
    errors: list[str] = field(default_factory=list)

    def reset(self):
        self.__init__()


STATS = Stats()
_LOCK = asyncio.Lock()
_LAST = [0.0]


async def _throttle():
    """Client-side rate limiting for free tiers (LLM_MIN_INTERVAL seconds between calls)."""
    gap = float(os.getenv("LLM_MIN_INTERVAL", "0") or 0)
    if gap <= 0:
        return
    async with _LOCK:
        wait = _LAST[0] + gap - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)
        _LAST[0] = time.monotonic()


class LLMError(RuntimeError):
    pass


class LLM:
    def __init__(self):
        self.reload()

    def reload(self):
        load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"), override=True)
        want = (os.getenv("FINWISE_FORCE_PROVIDER") or os.getenv("LLM_PROVIDER", "auto")).lower()
        self.provider = "mock"
        order = ["groq", "gemini"] if want == "auto" else [want]
        for p in order:
            if p in PROVIDERS and os.getenv(PROVIDERS[p][1]):
                self.provider = p
                break
        if self.provider != "mock":
            url, key_env, model_env, default_model = PROVIDERS[self.provider]
            self.url, self.key = url, os.getenv(key_env)
            self.model = os.getenv(model_env) or default_model
        else:
            self.url = self.key = None
            self.model = "rule-based (no API key)"

    @property
    def available(self) -> bool:
        return self.provider != "mock"

    def info(self) -> dict:
        return {"provider": self.provider, "model": self.model, "available": self.available}

    def _body(self, messages, json_mode, temperature, max_tokens, stream=False):
        body = {"model": self.model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens,
                "stream": stream}
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        if self.provider == "gemini" and "flash" in self.model:
            body["reasoning_effort"] = "none"  # disable hidden thinking tokens: faster + cheaper
        if "gpt-oss" in self.model:
            body["reasoning_effort"] = "low"
            body["include_reasoning"] = False
        return body

    async def complete(self, messages: list[dict], json_mode: bool = False, temperature: float = 0.2,
                       max_tokens: int = 1200, use_cache: bool = True) -> str:
        if not self.available:
            raise LLMError("No LLM provider configured")
        key = hashlib.sha256(json.dumps([self.provider, self.model, messages, json_mode, temperature]).encode()).hexdigest()
        if use_cache and (hit := db.cache_get(key)) is not None:
            STATS.cache_hits += 1
            return hit
        body = self._body(messages, json_mode, temperature, max_tokens)
        headers = {"Authorization": f"Bearer {self.key}"}
        delay = 2.0
        async with httpx.AsyncClient(timeout=60) as client:
            for attempt in range(6):
                await _throttle()
                t0 = time.perf_counter()
                try:
                    r = await client.post(self.url, json=body, headers=headers)
                except httpx.HTTPError as e:
                    STATS.errors.append(str(e))
                    await asyncio.sleep(delay)
                    delay *= 2
                    continue
                if r.status_code in (429, 500, 502, 503):
                    try:
                        wait = float(r.headers.get("retry-after", delay))
                    except ValueError:
                        wait = delay
                    await asyncio.sleep(min(max(wait, delay), 60))
                    delay *= 2
                    continue
                if r.status_code >= 400:
                    STATS.errors.append(r.text[:300])
                    raise LLMError(f"{self.provider} error {r.status_code}: {r.text[:300]}")
                data = r.json()
                STATS.calls += 1
                STATS.latency_s += time.perf_counter() - t0
                u = data.get("usage") or {}
                STATS.prompt_tokens += u.get("prompt_tokens", 0)
                STATS.completion_tokens += u.get("completion_tokens", 0)
                text = data["choices"][0]["message"].get("content") or ""
                if use_cache:
                    db.cache_put(key, text)
                return text
        raise LLMError(f"{self.provider}: rate limited / unavailable after retries")

    async def complete_json(self, messages: list[dict], **kw) -> dict:
        text = await self.complete(messages, json_mode=True, **kw)
        return parse_json(text)

    async def stream(self, messages: list[dict], temperature: float = 0.3, max_tokens: int = 900) -> AsyncIterator[str]:
        if not self.available:
            raise LLMError("No LLM provider configured")
        body = self._body(messages, False, temperature, max_tokens, stream=True)
        headers = {"Authorization": f"Bearer {self.key}"}
        t0 = time.perf_counter()
        async with httpx.AsyncClient(timeout=90) as client:
            for attempt in range(4):
                async with client.stream("POST", self.url, json=body, headers=headers) as r:
                    if r.status_code == 429:
                        await asyncio.sleep(3 * (attempt + 1))
                        continue
                    if r.status_code >= 400:
                        raise LLMError(f"{self.provider} error {r.status_code}: {(await r.aread())[:300]!r}")
                    async for line in r.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        payload = line[5:].strip()
                        if payload == "[DONE]":
                            break
                        try:
                            delta = json.loads(payload)["choices"][0]["delta"].get("content")
                        except (KeyError, IndexError, json.JSONDecodeError):
                            continue
                        if delta:
                            yield delta
                    STATS.calls += 1
                    STATS.latency_s += time.perf_counter() - t0
                    return
        raise LLMError("rate limited")


def parse_json(text: str) -> dict:
    t = text.strip()
    if t.startswith("```"):
        t = t.strip("`")
        t = t[t.find("{"):]
    s, e = t.find("{"), t.rfind("}")
    if s == -1 or e == -1:
        raise LLMError(f"No JSON in response: {text[:200]}")
    return json.loads(t[s:e + 1])


llm = LLM()
