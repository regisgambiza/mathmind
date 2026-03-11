# Model Router - Deterministic AI Model Selection

## Purpose
Route AI tasks to appropriate models deterministically based on task type, eliminating random model selection that causes instability.

## Model Configuration

### Available Models (Ollama Local)
```json
{
  "local": {
    "qwen3.5": {
      "strengths": ["code_generation", "reasoning", "math"],
      "speed": "fast",
      "quality": "high"
    },
    "gpt-oss": {
      "strengths": ["general_chat", "code_review"],
      "speed": "medium",
      "quality": "high"
    },
    "llama3.1:8b": {
      "strengths": ["text_generation", "summarization"],
      "speed": "fast",
      "quality": "medium"
    },
    "glm-4.7-flash": {
      "strengths": ["fast_responses", "simple_tasks"],
      "speed": "very_fast",
      "quality": "medium"
    }
  }
}
```

### Available Models (OpenRouter Cloud)
```json
{
  "cloud": {
    "qwen/qwen-2.5-7b-instruct": {
      "strengths": ["math", "code_generation", "reasoning"],
      "cost": "free",
      "quality": "high"
    },
    "google/gemma-2-9b-it": {
      "strengths": ["general_tasks", "fast_response"],
      "cost": "free",
      "quality": "medium"
    },
    "meta-llama/llama-3-8b-instruct": {
      "strengths": ["text_generation", "reasoning"],
      "cost": "free",
      "quality": "high"
    }
  }
}
```

## Deterministic Routing Rules

### Task Type → Model Mapping
```javascript
const modelRouter = {
  // Code analysis and generation
  "code_generation": "qwen3.5",
  "code_review": "qwen3.5",
  "debugging": "qwen3.5",
  "refactoring": "qwen3.5",
  
  // Math and reasoning
  "math_problem": "qwen3.5",
  "reasoning": "qwen3.5",
  "analysis": "qwen3.5",
  
  // Text generation
  "text_generation": "llama3.1:8b",
  "summarization": "llama3.1:8b",
  "explanation": "llama3.1:8b",
  
  // Quick tasks
  "simple_query": "glm-4.7-flash",
  "health_check": "glm-4.7-flash",
  
  // Fallback
  "default": "qwen3.5"
};
```

### Provider Selection Logic
```javascript
function selectProvider(taskType, config) {
  // 1. Check if Ollama is available (preferred - free, local)
  if (config.ollamaAvailable) {
    return {
      provider: 'ollama',
      model: modelRouter[taskType] || modelRouter.default,
      baseUrl: config.ollamaUrl || 'http://localhost:11434'
    };
  }
  
  // 2. Fallback to OpenRouter if API key available
  if (config.openRouterKey) {
    return {
      provider: 'openrouter',
      model: 'qwen/qwen-2.5-7b-instruct',
      apiKey: config.openRouterKey
    };
  }
  
  // 3. Error - no provider available
  throw new Error('No AI provider available. Configure Ollama or OpenRouter.');
}
```

### Fallback Logic
```javascript
const fallbackChain = {
  'qwen3.5': ['gpt-oss', 'llama3.1:8b', 'glm-4.7-flash'],
  'gpt-oss': ['qwen3.5', 'llama3.1:8b', 'glm-4.7-flash'],
  'llama3.1:8b': ['qwen3.5', 'gpt-oss', 'glm-4.7-flash'],
  'glm-4.7-flash': ['qwen3.5', 'gpt-oss', 'llama3.1:8b']
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
    "provider": "ollama",
    "model": "qwen3.5",
    "baseUrl": "http://localhost:11434",
    "apiKey": "",
    "fallbackEnabled": true,
    "maxRetries": 3
  }
}
```

## Implementation Requirements

1. **Always read provider from settings** - Never override user selection
2. **Use deterministic routing** - Same task type → same model
3. **Implement retry with fallback** - Try fallback model on failure
4. **Log model selection** - Debug which model was used and why
5. **Health check on startup** - Verify selected model is available

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
