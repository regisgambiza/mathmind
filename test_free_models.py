"""
Free AI Models Similar to GPT-4o-mini — Live Tester
=====================================================
All models below are FREE via OpenRouter (no billing required).
Get your free API key at: https://openrouter.ai/keys

Usage:
    pip install openai
    export OPENROUTER_API_KEY="sk-or-..."
    python test_free_models.py
"""

import os
import time
import json
from openai import OpenAI

# ── Config ────────────────────────────────────────────────────────────────────
API_KEY = os.getenv("OPENROUTER_API_KEY", "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")
TEST_PROMPT = "What is 17 * 13? Explain briefly."

# ── Free models similar to GPT-4o-mini ────────────────────────────────────────
MODELS = [
    {
        "id": "meta-llama/llama-4-scout:free",
        "label": "Meta Llama 4 Scout",
        "notes": "Meta's latest scout model, multimodal, very capable",
    },
    {
        "id": "meta-llama/llama-3.3-70b-instruct:free",
        "label": "Meta Llama 3.3 70B",
        "notes": "Excellent general-purpose model, GPT-4o-mini tier",
    },
    {
        "id": "google/gemini-2.0-flash-exp:free",
        "label": "Google Gemini 2.0 Flash Exp",
        "notes": "Google's fast Flash model, 1M context window",
    },
    {
        "id": "deepseek/deepseek-chat-v3-0324:free",
        "label": "DeepSeek Chat V3",
        "notes": "Strong at coding & reasoning, GPT-4o-mini competitor",
    },
    {
        "id": "qwen/qwq-32b:free",
        "label": "Qwen QwQ 32B",
        "notes": "Alibaba reasoning model, great for math & logic",
    },
    {
        "id": "google/gemma-3-27b-it:free",
        "label": "Google Gemma 3 27B",
        "notes": "Open-weights model from Google, multimodal",
    },
    {
        "id": "mistralai/mistral-7b-instruct:free",
        "label": "Mistral 7B Instruct",
        "notes": "Lightweight, fast, great for simple tasks",
    },
]

# ── Tester ────────────────────────────────────────────────────────────────────
client = OpenAI(
    api_key=API_KEY,
    base_url="https://openrouter.ai/api/v1",
)

def test_model(model: dict) -> dict:
    result = {
        "id": model["id"],
        "label": model["label"],
        "notes": model["notes"],
        "status": None,
        "response": None,
        "latency_s": None,
        "error": None,
    }
    try:
        start = time.time()
        completion = client.chat.completions.create(
            model=model["id"],
            messages=[{"role": "user", "content": TEST_PROMPT}],
            max_tokens=200,
            timeout=30,
        )
        elapsed = round(time.time() - start, 2)
        text = completion.choices[0].message.content.strip()
        result.update(status="✅ WORKS", response=text, latency_s=elapsed)
    except Exception as e:
        result.update(status="❌ FAILED", error=str(e))
    return result

def main():
    if API_KEY == "YOUR_KEY_HERE":
        print("⚠️  Set OPENROUTER_API_KEY environment variable first.")
        print("    Get a free key at: https://openrouter.ai/keys\n")

    print(f"🧪 Testing {len(MODELS)} free models with prompt:")
    print(f'   "{TEST_PROMPT}"\n')
    print("=" * 70)

    results = []
    for i, model in enumerate(MODELS, 1):
        print(f"[{i}/{len(MODELS)}] {model['id']}...")
        r = test_model(model)
        results.append(r)

        if r["status"] == "✅ WORKS":
            print(f"  {r['status']}  ({r['latency_s']}s)")
            print(f"  Response: {r['response'][:120]}{'...' if len(r['response']) > 120 else ''}")
        else:
            print(f"  {r['status']}  {r['error'][:100]}")
        print()

    # ── Summary ───────────────────────────────────────────────────────────────
    working = [r for r in results if r["status"] == "✅ WORKS"]
    failed  = [r for r in results if r["status"] == "❌ FAILED"]

    print("=" * 70)
    print(f"\n📊 SUMMARY: {len(working)} working / {len(failed)} failed\n")
    print(f"{'Model ID':<50} {'Status':<12} {'Latency':>8}")
    print("-" * 75)
    for r in results:
        latency = f"{r['latency_s']}s" if r["latency_s"] else "—"
        print(f"{r['id']:<50} {r['status']:<12} {latency:>8}")

    # ── Save results ──────────────────────────────────────────────────────────
    out_file = "model_test_results.json"
    with open(out_file, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n💾 Full results saved to {out_file}")

    print("\n🔑 Where to get free API keys:")
    print("  • OpenRouter (all models above): https://openrouter.ai/keys")
    print("  • Groq (ultra-fast Llama):       https://console.groq.com")
    print("  • Google AI Studio (Gemini):     https://aistudio.google.com")

if __name__ == "__main__":
    main()
