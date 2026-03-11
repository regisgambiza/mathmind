import { createContext, useContext, useState, useCallback } from 'react';

const RegisContext = createContext(null);

const STORAGE_KEY = 'mathmind_regis_config';

// Hardcoded OpenRouter model fallback chain - tries each in order until one works
const MODEL_FALLBACK_CHAIN = [
    'google/gemma-2-9b-it:free',
    'meta-llama/llama-3-8b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
    'qwen/qwen-2.5-7b-instruct:free',
    'deepseek/deepseek-chat:free',
    'openrouter/free', // Auto-routes to any available free model
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
    const envKey = import.meta.env.VITE_OPENROUTER_API_KEY || '';

    // If we have an env key and it doesn't match the saved key, update the saved key
    if (envKey && saved.apiKey !== envKey) {
        saved.apiKey = envKey;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, apiKey: envKey }));
        } catch (e) { }
    }

    // Hardcoded to OpenRouter - no provider toggle
    const [apiKey, setApiKeyState] = useState(envKey || saved.apiKey || '');

    const save = (updates) => {
        const current = loadConfig();
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...updates }));
    };

    const setApiKey = (v) => { setApiKeyState(v); save({ apiKey: v }); };

    const generateCompletion = useCallback(async (prompt, modelIndex = 0) => {
        console.log('[RegisContext] ========== generateCompletion START ==========');
        console.log('[RegisContext] modelIndex:', modelIndex);
        console.log('[RegisContext] Available models:', MODEL_FALLBACK_CHAIN);
        console.log('[RegisContext] Current model:', MODEL_FALLBACK_CHAIN[modelIndex]);
        console.log('[RegisContext] API Key present:', !!apiKey);
        console.log('[RegisContext] API Key prefix:', apiKey ? apiKey.substring(0, 15) + '...' : 'NONE');
        console.log('[RegisContext] Prompt length:', prompt?.length || 0);
        console.log('[RegisContext] Prompt preview:', prompt ? prompt.substring(0, 200) + '...' : 'NONE');

        try {
            if (!apiKey) {
                console.error('[RegisContext] ❌ OpenRouter API Key missing');
                throw new Error('OpenRouter API Key is missing. Please check your Regis settings ⚙️');
            }

            const currentModel = MODEL_FALLBACK_CHAIN[modelIndex];
            console.log('[RegisContext] 📡 Sending request to OpenRouter...');
            console.log('[RegisContext] URL: https://openrouter.ai/api/v1/chat/completions');
            console.log('[RegisContext] Model:', currentModel);

            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: currentModel,
                    messages: [{ role: 'user', content: prompt }],
                    stream: true,
                }),
            });

            console.log('[RegisContext] 📥 Response received');
            console.log('[RegisContext] Status:', res.status, res.statusText);
            console.log('[RegisContext] Headers:', Object.fromEntries(res.headers.entries()));

            if (!res.ok) {
                console.error('[RegisContext] ❌ Response not OK');
                const err = await res.json().catch(() => ({}));
                console.error('[RegisContext] Error data:', JSON.stringify(err, null, 2));

                // Check for rate limit (429)
                if (res.status === 429) {
                    console.error('[RegisContext] ⚠️ Rate limit exceeded (429)');
                    throw new Error('API rate limit exceeded. Please wait a moment and try again, or add credits to your OpenRouter account.');
                }

                // Check for auth error (401)
                if (res.status === 401) {
                    console.error('[RegisContext] ⚠️ Authentication failed (401)');
                    throw new Error('OpenRouter API key is invalid. Please check your API key in settings.');
                }

                // Check for model not found (404)
                if (res.status === 404) {
                    console.error('[RegisContext] ⚠️ Model not found (404)');
                    // If this model failed, try the next one in the fallback chain
                    if (modelIndex < MODEL_FALLBACK_CHAIN.length - 1) {
                        console.log('[RegisContext] 🔄 Trying next model in fallback chain...');
                        return generateCompletion(prompt, modelIndex + 1);
                    }
                    throw new Error(`Model "${currentModel}" not found. All fallback models exhausted.`);
                }

                // If this model failed, try the next one in the fallback chain
                if (modelIndex < MODEL_FALLBACK_CHAIN.length - 1) {
                    console.log('[RegisContext] 🔄 Model failed, trying next in chain...');
                    return generateCompletion(prompt, modelIndex + 1);
                }

                throw new Error(err.error?.message || `OpenRouter error: ${res.status} ${res.statusText}`);
            }

            console.log('[RegisContext] ✅ Response OK, starting stream read...');
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let result = '';
            let buffer = '';
            let chunkCount = 0;

            console.log('[RegisContext] Starting OpenRouter stream read...');
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    console.log('[RegisContext] Stream done. Total chunks:', chunkCount);
                    break;
                }
                chunkCount++;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('data: ')) {
                        const data = trimmed.slice(6);
                        if (data === '[DONE]') {
                            console.log('[RegisContext] Received [DONE] signal');
                            continue;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.choices?.[0]?.delta?.content || '';
                            if (delta) {
                                result += delta;
                                console.log('[RegisContext] Chunk', chunkCount, ':', delta.substring(0, 50));
                            }
                        } catch (e) {
                            console.warn('[RegisContext] Failed to parse chunk:', e, line);
                        }
                    }
                }
            }

            console.log('[RegisContext] Stream complete. Final result length:', result.length);
            console.log('[RegisContext] Result preview:', result.substring(0, 200) + '...');
            console.log('[RegisContext] ========== generateCompletion END ==========');

            return result;
        } catch (error) {
            console.error('[RegisContext] ========== generateCompletion ERROR ==========');
            console.error('[RegisContext] Error type:', error.constructor.name);
            console.error('[RegisContext] Error message:', error.message);
            console.error('[RegisContext] Error stack:', error.stack);
            console.error('[RegisContext] ========== generateCompletion ERROR END ==========');
            throw error;
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
