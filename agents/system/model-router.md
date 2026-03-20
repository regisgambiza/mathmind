# Model Router - Deterministic AI Model Selection

## Purpose
Route AI tasks to appropriate models deterministically based on task type, eliminating random model selection that causes instability.

## Model Configuration

### Available Models (OpenRouter Free Tier)
```json
{
  "openrouter": {
    "meta-llama/llama-3-8b-instruct:free": {
      "strengths": ["code_generation", "reasoning", "math", "general_chat"],
      "speed": "fast",
      "quality": "high"
    },
    "google/gemma-2-9b-it:free": {
      "strengths": ["text_generation", "summarization"],
      "speed": "fast",
      "quality": "high"
    },
    "microsoft/phi-3-mini-128k-instruct:free": {
      "strengths": ["fast_responses", "simple_tasks"],
      "speed": "very_fast",
      "quality": "medium"
    },
    "qwen/qwen-2-7b-instruct:free": {
      "strengths": ["code_review", "math"],
      "speed": "fast",
      "quality": "high"
    }
  }
}
```
    }
  }
}
```

## Deterministic Routing Rules

### Task Type → Model Mapping
```javascript
const modelRouter = {
  // Code analysis and generation
  "code_generation": "meta-llama/llama-3-8b-instruct:free",
  "code_review": "meta-llama/llama-3-8b-instruct:free",
  "debugging": "meta-llama/llama-3-8b-instruct:free",
  "refactoring": "meta-llama/llama-3-8b-instruct:free",

  // Math and reasoning
  "math_problem": "meta-llama/llama-3-8b-instruct:free",
  "reasoning": "meta-llama/llama-3-8b-instruct:free",
  "analysis": "meta-llama/llama-3-8b-instruct:free",

  // Text generation
  "text_generation": "google/gemma-2-9b-it:free",
  "summarization": "google/gemma-2-9b-it:free",
  "explanation": "google/gemma-2-9b-it:free",

  // Quick tasks
  "simple_query": "microsoft/phi-3-mini-128k-instruct:free",
  "health_check": "microsoft/phi-3-mini-128k-instruct:free",

  // Fallback
  "default": "meta-llama/llama-3-8b-instruct:free"
};
```

### Provider Selection Logic
```javascript
function selectProvider(taskType, config) {
  // Use OpenRouter free tier
  if (config.openRouterKey) {
    return {
      provider: 'openrouter',
      model: modelRouter[taskType] || modelRouter.default,
      apiKey: config.openRouterKey
    };
  }

  // Error - no provider available
  throw new Error('No AI provider available. Configure OpenRouter API key.');
}
```

### Fallback Logic
```javascript
const fallbackChain = {
  'meta-llama/llama-3-8b-instruct:free': ['google/gemma-2-9b-it:free', 'microsoft/phi-3-mini-128k-instruct:free', 'qwen/qwen-2-7b-instruct:free'],
  'google/gemma-2-9b-it:free': ['meta-llama/llama-3-8b-instruct:free', 'microsoft/phi-3-mini-128k-instruct:free', 'qwen/qwen-2-7b-instruct:free'],
  'microsoft/phi-3-mini-128k-instruct:free': ['meta-llama/llama-3-8b-instruct:free', 'google/gemma-2-9b-it:free', 'qwen/qwen-2-7b-instruct:free'],
  'qwen/qwen-2-7b-instruct:free': ['meta-llama/llama-3-8b-instruct:free', 'google/gemma-2-9b-it:free', 'microsoft/phi-3-mini-128k-instruct:free']
};

function getFallbackModel(currentModel, error) {
  // If model fails, try next in chain
  const fallbacks = fallbackChain[currentModel] || fallbackChain.default;
  return fallbacks[0]; // Return first fallback
}
```

## Configuration Storage

### localStorage Schema
```json
{
  "mathmind_regis_config": {
    "provider": "openrouter",
    "model": "meta-llama/llama-3-8b-instruct:free",
    "apiKey": "",
    "fallbackEnabled": true,
    "maxRetries": 3
  }
}
```

## Implementation Requirements

1. **Always read provider from settings** - Never override user selection
2. **Use deterministic routing** - Same task type → same free model
3. **Implement retry with fallback** - Try fallback free model on failure
4. **Log model selection** - Debug which model was used and why
5. **Free tier awareness** - Respect rate limits, have fallback models ready

## Best Practices

1. **Use free models first** - All routed models are free tier (`:free` suffix)
2. **Handle rate limits gracefully** - 429 errors mean try another free model
3. **No local setup required** - Everything runs via OpenRouter cloud API
4. **API key required** - Users need free OpenRouter account for API key

## Error Handling

```javascript
class ModelRouterError extends Error {
  constructor(message, taskType, attemptedModel) {
    super(message);
    this.taskType = taskType;
    this.attemptedModel = attemptedModel;
    this.timestamp = new Date().toISOString();
  }
}

function handleModelFailure(error, taskType, model) {
  console.error(`[ModelRouter] Failed: ${model} for ${taskType}`);
  
  // Get fallback model
  const fallback = getFallbackModel(model, error);
  console.log(`[ModelRouter] Falling back to: ${fallback}`);
  
  return fallback;
}
```

## Success Metrics

- **Deterministic Selection**: Same task always routes to same model
- **Fallback Success Rate**: >95% requests succeed with fallback
- **Response Time**: <5s for local models, <10s for cloud
- **Error Rate**: <5% after fallback implementation
