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

    const [provider, setProviderState] = useState(saved.provider || 'ollama');
    const [apiKey, setApiKeyState] = useState(saved.apiKey || '');

    const defaultOllamaUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:11434'
        : `http://${window.location.hostname}:11434`;

    const [model, setModelState] = useState(saved.model || 'gpt-oss:latest');
    const [baseUrl, setBaseUrlState] = useState(saved.baseUrl || defaultOllamaUrl);

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
            if (provider === 'openrouter') {
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
                        model: model || 'openai/gpt-4o-mini',
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
                    buffer = lines.pop() || ''; // keep incomplete line in buffer

                    for (const line of lines) {
                        if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                if (data.choices?.[0]?.delta?.content) {
                                    result += data.choices[0].delta.content;
                                }
                            } catch (e) {
                                // Ignore incomplete JSON parsings
                            }
                        }
                    }
                }
                console.log('[RegisContext] OpenRouter final result length:', result.length);
                return result;

            } else {
                // Ollama
                console.log('[RegisContext] Sending request to Ollama URL:', baseUrl);
                const res = await fetch(`${baseUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: model || 'gpt-oss:latest',
                        messages: [{ role: 'user', content: prompt }],
                        stream: true,
                    }),
                });

                console.log('[RegisContext] Ollama response status:', res.status, res.statusText);

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    console.error('[RegisContext] Ollama Error Data:', err);
                    throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
                }

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let result = '';
                let buffer = '';
                let chunkCount = 0;

                console.log('[RegisContext] Starting Ollama stream read...');
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        console.log('[RegisContext] Ollama stream done. Total chunks:', chunkCount);
                        break;
                    }
                    chunkCount++;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.trim()) {
                            try {
                                const data = JSON.parse(line);
                                if (data.message?.content) {
                                    result += data.message.content;
                                }
                            } catch (e) {
                                // Ignore incomplete line
                            }
                        }
                    }
                }
                console.log('[RegisContext] Ollama final result length:', result.length);
                return result;
            }
        } catch (err) {
            console.error('[RegisContext] generateCompletion Catch Error:', err);
            throw err;
        }
    }, [provider, apiKey, model, baseUrl]);

    return (
        <RegisContext.Provider value={{ provider, setProvider, apiKey, setApiKey, model, setModel, baseUrl, setBaseUrl, generateCompletion }}>
            {children}
        </RegisContext.Provider>
    );
}

export function useRegis() {
    return useContext(RegisContext);
}
