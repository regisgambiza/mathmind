# Model Router - Deterministic AI Model Selection

## Purpose
Route AI tasks to appropriate models deterministically based on task type, eliminating random model selection that causes instability.

## Model Configuration

### Available Models (OpenRouter Free Tier)
```json
{
  "openrouter": {
    "openrouter/free": {
      "strengths": ["auto_select", "all_free_models", "dynamic_routing"],
      "speed": "fast",
      "quality": "high",
      "description": "Automatically selects from available free models"
    }
  }
}
```

**Note**: `openrouter/free` automatically routes to available free models including:
- Meta Llama 3 series
- Google Gemma 2 series
- Microsoft Phi 3 series
- Qwen 2 series
- And other free tier models
    }
  }
}
```

## Deterministic Routing Rules

### Task Type → Model Mapping
```javascript
const modelRouter = {
  // All tasks use openrouter/free for automatic model selection
  "code_generation": "openrouter/free",
  "code_review": "openrouter/free",
  "debugging": "openrouter/free",
  "refactoring": "openrouter/free",

  // Math and reasoning
  "math_problem": "openrouter/free",
  "reasoning": "openrouter/free",
  "analysis": "openrouter/free",

  // Text generation
  "text_generation": "openrouter/free",
  "summarization": "openrouter/free",
  "explanation": "openrouter/free",

  // Quick tasks
  "simple_query": "openrouter/free",
  "health_check": "openrouter/free",

  // Fallback
  "default": "openrouter/free"
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
// openrouter/free handles fallback automatically
// No need for manual fallback chain
const fallbackChain = {
  'openrouter/free': [] // OpenRouter handles this internally
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
    "model": "openrouter/free",
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
