import { createContext, useContext, useState, useCallback } from 'react';

const RegisContext = createContext(null);

const STORAGE_KEY = 'mathmind_regis_config';

function loadConfig() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch { }
    return {};
}

export function RegisProvider({ children }) {
    const saved = loadConfig();

    // Default to Ollama for local free usage
    const [provider, setProviderState] = useState(saved.provider || 'ollama');
    const [apiKey, setApiKeyState] = useState(saved.apiKey || '');

    // Default model for Ollama - qwen3.5 is installed
    const [model, setModelState] = useState(saved.model || 'qwen3.5');
    const [baseUrl, setBaseUrlState] = useState(saved.baseUrl || '');

    const save = (updates) => {
        const current = loadConfig();
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...updates }));
    };

    const setProvider = (v) => { setProviderState(v); save({ provider: v }); };
    const setApiKey = (v) => { setApiKeyState(v); save({ apiKey: v }); };
    const setModel = (v) => { setModelState(v); save({ model: v }); };
    const setBaseUrl = (v) => { setBaseUrlState(v); save({ baseUrl: v }); };

    const generateCompletion = useCallback(async (prompt) => {
        console.log('[RegisContext] generateCompletion called');
        console.log('[RegisContext] Provider:', provider);
        console.log('[RegisContext] Model:', model);

        try {
            if (provider === 'ollama') {
                // Ollama local model
                const ollamaUrl = baseUrl || 'http://localhost:11434';
                console.log('[RegisContext] Sending request to Ollama:', ollamaUrl);
                
                const res = await fetch(`${ollamaUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: model || 'qwen3.5',
                        messages: [{ role: 'user', content: prompt }],
                        stream: false,
                    }),
                });

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error?.message || `Ollama error: ${res.status} ${res.statusText}`);
                }

                const data = await res.json();
                const content = data.message?.content || '';
                console.log('[RegisContext] Ollama response received, length:', content.length);
                return content;

            } else {
                // OpenRouter cloud model
                if (!apiKey) {
                    console.error('[RegisContext] OpenRouter API Key missing');
                    throw new Error('OpenRouter API Key is missing. Please check your Regis settings ⚙️');
                }

                console.log('[RegisContext] Sending request to OpenRouter...');
                const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                        'HTTP-Referer': window.location.origin,
                        'X-Title': 'MathMind',
                    },
                    body: JSON.stringify({
                        model: model || 'qwen/qwen-2.5-7b-instruct',
                        messages: [{ role: 'user', content: prompt }],
                        stream: true,
                    }),
                });

                console.log('[RegisContext] OpenRouter response status:', res.status, res.statusText);

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    console.error('[RegisContext] OpenRouter Error Data:', err);
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
                return result;
            }

        } catch (err) {
            console.error('[RegisContext] generateCompletion error:', err);
            throw err;
        }
    }, [provider, model, apiKey, baseUrl]);

    return (
        <RegisContext.Provider value={{ provider, setProvider, apiKey, setApiKey, model, setModel, baseUrl, setBaseUrl, generateCompletion }}>
            {children}
        </RegisContext.Provider>
    );
}

export function useRegis() {
    return useContext(RegisContext);
}
