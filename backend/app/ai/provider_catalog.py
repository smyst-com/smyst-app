from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    base_url: str
    api_key_attr: str
    default_model: str


PROVIDER_CONFIGS: dict[str, ProviderConfig] = {
    # Kein eigener Anbieter, sondern der smyst-Server selbst: die Pipeline in
    # GitHub Actions leiht sich dessen Provider-Kette, statt eigene Keys zu
    # brauchen (siehe api/v1/routes/ci_gateway.py). base_url kommt aus den
    # Settings; api_key_attr zeigt bewusst auf dieselbe Einstellung, damit die
    # Kette den Eintrag ueberspringt, solange kein Gateway konfiguriert ist.
    "smyst_gateway": ProviderConfig(
        name="smyst_gateway",
        base_url="",
        api_key_attr="smyst_gateway_base_url",
        default_model="smyst-gateway",
    ),
    "smyst_llm": ProviderConfig(
        name="smyst_llm",
        # Basis-URL kommt zur Laufzeit aus den Settings (SMYST_LLM_BASE_URL);
        # api_key_attr zeigt auf dieselbe Einstellung wie beim Gateway: ohne
        # konfigurierten Key/URL wird der Eintrag uebersprungen.
        base_url="",
        api_key_attr="smyst_llm_api_key",
        default_model="smyst-1.0",
    ),
    "openrouter": ProviderConfig(
        name="openrouter",
        base_url="https://openrouter.ai/api/v1",
        api_key_attr="openrouter_api_key",
        default_model="openai/gpt-4o",
    ),
    "openai": ProviderConfig(
        name="openai",
        base_url="https://api.openai.com/v1",
        api_key_attr="openai_api_key",
        default_model="gpt-4o",
    ),
    "anthropic": ProviderConfig(
        name="anthropic",
        base_url="https://api.anthropic.com/v1",
        api_key_attr="anthropic_api_key",
        default_model="claude-haiku-4-5",
    ),
    "gemini": ProviderConfig(
        name="gemini",
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        api_key_attr="gemini_api_key",
        default_model="gemini-3.5-flash",
    ),
    "xai": ProviderConfig(
        name="xai",
        base_url="https://api.x.ai/v1",
        api_key_attr="xai_api_key",
        default_model="grok-4.3",
    ),
    "deepseek": ProviderConfig(
        name="deepseek",
        base_url="https://api.deepseek.com",
        api_key_attr="deepseek_api_key",
        default_model="deepseek-v4-flash",
    ),
    "moonshot": ProviderConfig(
        name="moonshot",
        base_url="https://api.moonshot.ai/v1",
        api_key_attr="moonshot_api_key",
        default_model="kimi-k2-0711-preview",
    ),
    "manus": ProviderConfig(
        name="manus",
        base_url="https://api.manus.ai/v2",
        api_key_attr="manus_api_key",
        default_model="manus-1.6-lite",
    ),
    "zhipu": ProviderConfig(
        name="zhipu",
        base_url="https://api.z.ai/api/paas/v4",
        api_key_attr="zhipu_api_key",
        default_model="glm-4.6",
    ),
    "dashscope": ProviderConfig(
        name="dashscope",
        base_url="https://dashscope-intl.aliyun.com/compatible-mode/v1",
        api_key_attr="dashscope_api_key",
        default_model="qwen-plus",
    ),
    "mistral": ProviderConfig(
        name="mistral",
        base_url="https://api.mistral.ai/v1",
        api_key_attr="mistral_api_key",
        default_model="mistral-large-latest",
    ),
    "groq": ProviderConfig(
        name="groq",
        base_url="https://api.groq.com/openai/v1",
        api_key_attr="groq_api_key",
        default_model="openai/gpt-oss-120b",
    ),
    "together": ProviderConfig(
        name="together",
        base_url="https://api.together.xyz/v1",
        api_key_attr="together_api_key",
        default_model="meta-llama/Llama-3.3-70B-Instruct-Turbo",
    ),
    "cohere": ProviderConfig(
        name="cohere",
        base_url="https://api.cohere.ai/compatibility/v1",
        api_key_attr="cohere_api_key",
        default_model="command-a-03-2025",
    ),
    "perplexity": ProviderConfig(
        name="perplexity",
        base_url="https://api.perplexity.ai",
        api_key_attr="perplexity_api_key",
        default_model="sonar-pro",
    ),
}

PROVIDER_ALIASES = {
    "claude": "anthropic",
    "grok": "xai",
    "kimi": "moonshot",
    "moonshotai": "moonshot",
    "manusai": "manus",
    "glm": "zhipu",
    "zai": "zhipu",
    "qwen": "dashscope",
    "alibaba": "dashscope",
}

DEFAULT_PROVIDER_ORDER = [
    "smyst_gateway",
    "smyst_llm",
    "openrouter",
    "openai",
    "anthropic",
    "gemini",
    "xai",
    "deepseek",
    "moonshot",
    "manus",
    "zhipu",
    "dashscope",
    "mistral",
    "groq",
    "together",
    "cohere",
    "perplexity",
]

STALE_MODEL_ALIASES: dict[tuple[str, str], str] = {
    ("anthropic", "claude-3-7-sonnet-latest"): "claude-haiku-4-5",
    ("gemini", "gemini-2.5-flash"): "gemini-3.5-flash",
    ("xai", "grok-3"): "grok-4.3",
    # deepseek-chat wird am 2026-07-24 abgeschaltet; Nachfolger (non-thinking):
    ("deepseek", "deepseek-chat"): "deepseek-v4-flash",
    ("deepseek", "deepseek-reasoner"): "deepseek-v4-pro",
    # Groq hat llama-3.3-70b-versatile und llama-3.1-8b-instant am
    # 2026-08-16 abgeschaltet; offizielle Nachfolger laut Deprecation-Hinweis:
    ("groq", "llama-3.3-70b-versatile"): "openai/gpt-oss-120b",
    ("groq", "llama-3.1-8b-instant"): "openai/gpt-oss-20b",
}
