"""
Simple OpenRouter Model Tester - Tests models using direct HTTP like the app does
"""
import urllib.request
import json

API_KEY = "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"
TEST_PROMPT = "Say hello briefly."

# Models from your current fallback chain
MODELS = [
    'google/gemma-2-9b-it:free',
    'meta-llama/llama-3-8b-instruct:free',
    'microsoft/phi-3-mini-128k-instruct:free',
    'qwen/qwen-2.5-7b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
    'openai/gpt-oss-120b:free',
    'qwen/qwen3-4b:free',
    'google/gemma-3-27b-it:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'openrouter/free',
]

print("=" * 70)
print("Testing OpenRouter Models")
print("=" * 70)

results = []

for i, model in enumerate(MODELS, 1):
    print(f"\n[{i}/{len(MODELS)}] Testing: {model}")
    
    try:
        data = json.dumps({
            "model": model,
            "messages": [{"role": "user", "content": TEST_PROMPT}],
            "max_tokens": 50
        }).encode('utf-8')
        
        req = urllib.request.Request(
            'https://openrouter.ai/api/v1/chat/completions',
            data=data,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {API_KEY}',
                'HTTP-Referer': 'http://localhost:5173',
                'X-Title': 'MathMind Test'
            }
        )
        
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode('utf-8'))
            content = result.get('choices', [{}])[0].get('message', {}).get('content', 'No response')
            print(f"  ✅ WORKS - Response: {content[:80]}...")
            results.append({"model": model, "status": "✅ WORKS", "response": content[:50]})
            
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8') if e.fp else ""
        try:
            error_json = json.loads(error_body)
            error_msg = error_json.get('error', {}).get('message', str(e))
        except:
            error_msg = str(e)
        print(f"  ❌ FAILED ({e.code}): {error_msg}")
        results.append({"model": model, "status": f"❌ {e.code}", "error": error_msg[:50]})
        
    except Exception as e:
        print(f"  ❌ ERROR: {str(e)}")
        results.append({"model": model, "status": "❌ ERROR", "error": str(e)[:50]})

# Summary
print("\n" + "=" * 70)
print("SUMMARY")
print("=" * 70)

working = [r for r in results if "WORKS" in r["status"]]
failed = [r for r in results if "WORKS" not in r["status"]]

print(f"\n✅ Working: {len(working)}/{len(results)}")
print(f"❌ Failed: {len(failed)}/{len(results)}\n")

print("Model Status:")
for r in results:
    status_icon = "✅" if "WORKS" in r["status"] else "❌"
    print(f"  {status_icon} {r['model']}")
    if "response" in r:
        print(f"      → {r['response']}")
    elif "error" in r:
        print(f"      → {r['error']}")

# Save results
with open("model_test_results.json", "w") as f:
    json.dump(results, f, indent=2)
print(f"\n💾 Results saved to model_test_results.json")
