import { createContext, useContext, useState, useCallback } from 'react';

const RegisContext = createContext(null);

const STORAGE_KEY = 'mathmind_regis_config';

// Hardcoded OpenRouter model fallback chain - tries each in order until one works
const MODEL_FALLBACK_CHAIN = [
    'google/gemma-2-9b-it:free',
    'meta-llama/llama-3-8b-instruct:free',
    'microsoft/phi-3-mini-128k-instruct:free',
    'qwen/qwen-2.5-7b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
    'openai/gpt-oss-120b:free',
    'qwen/qwen3-4b:free',
    'google/gemma-3-27b-it:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'openrouter/free', // Ultimate fallback - any free model
];

function loadConfig() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch { }
    return {};
}

export function RegisProvider({ children }) {
    const saved = loadConfig();

    // Hardcoded to OpenRouter - no provider toggle
    const [apiKey, setApiKeyState] = useState(saved.apiKey || '');

    const save = (updates) => {
        const current = loadConfig();
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...updates }));
    };

    const setApiKey = (v) => { setApiKeyState(v); save({ apiKey: v }); };

    const generateCompletion = useCallback(async (prompt, modelIndex = 0) => {
        console.log('[RegisContext] generateCompletion called');
        console.log('[RegisContext] Attempting model:', MODEL_FALLBACK_CHAIN[modelIndex]);

        try {
            if (!apiKey) {
                console.error('[RegisContext] OpenRouter API Key missing');
                throw new Error('OpenRouter API Key is missing. Please check your Regis settings ⚙️');
            }

            const currentModel = MODEL_FALLBACK_CHAIN[modelIndex];
            console.log('[RegisContext] Sending request to OpenRouter with model:', currentModel);

            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'MathMind',
                },
                body: JSON.stringify({
                    model: currentModel,
                    messages: [{ role: 'user', content: prompt }],
                    stream: true,
                }),
            });

            console.log('[RegisContext] OpenRouter response status:', res.status, res.statusText);

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.error('[RegisContext] OpenRouter Error Data:', err);

                // If this model failed, try the next one in the fallback chain
                if (modelIndex < MODEL_FALLBACK_CHAIN.length - 1) {
                    console.log('[RegisContext] Model failed, trying next in chain...');
                    return generateCompletion(prompt, modelIndex + 1);
                }

                throw new Error(err.error?.message || `OpenRouter error: ${res.status} ${res.statusText}`);
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let result = '';
            let buffer = '';
            let chunkCount = 0;

            console.log('[RegisContext] Starting OpenRouter stream read...');
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    console.log('[RegisContext] OpenRouter stream done. Total chunks:', chunkCount);
                    break;
                }
                chunkCount++;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.choices?.[0]?.delta?.content) {
                                result += data.choices[0].delta.content;
                            }
                        } catch (e) {
                            // Ignore incomplete JSON
                        }
                    }
                }
            }
            console.log('[RegisContext] OpenRouter final result length:', result.length);
            console.log('[RegisContext] Success with model:', currentModel);
            return result;

        } catch (err) {
            console.error('[RegisContext] generateCompletion error:', err);

            // If this model failed with exception, try the next one
            if (modelIndex < MODEL_FALLBACK_CHAIN.length - 1) {
                console.log('[RegisContext] Model failed with error, trying next in chain...');
                return generateCompletion(prompt, modelIndex + 1);
            }

            throw err;
        }
    }, [apiKey]);

    return (
        <RegisContext.Provider value={{ provider: 'openrouter', apiKey, setApiKey, model: MODEL_FALLBACK_CHAIN[0], MODEL_FALLBACK_CHAIN, generateCompletion }}>
            {children}
        </RegisContext.Provider>
    );
}

export function useRegis() {
    return useContext(RegisContext);
}
