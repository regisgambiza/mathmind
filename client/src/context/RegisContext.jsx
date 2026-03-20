import { createContext, useContext, useCallback } from 'react';

const RegisContext = createContext(null);

// Ollama local model - hardcoded
const OLLAMA_BASE_URL = 'http://localhost:11434';
const OLLAMA_MODEL = 'qwen3.5:27b';

export function RegisProvider({ children }) {
    const generateCompletion = useCallback(async (prompt) => {
        console.log('[RegisContext] ========== generateCompletion START ==========');
        console.log('[RegisContext] Using Ollama local model:', OLLAMA_MODEL);
        console.log('[RegisContext] Base URL:', OLLAMA_BASE_URL);
        console.log('[RegisContext] Prompt length:', prompt?.length || 0);
        console.log('[RegisContext] Prompt preview:', prompt ? prompt.substring(0, 200) + '...' : 'NONE');

        try {
            console.log('[RegisContext] 📡 Sending request to Ollama...');
            console.log('[RegisContext] URL:', `${OLLAMA_BASE_URL}/api/chat`);

            const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: OLLAMA_MODEL,
                    messages: [{ role: 'user', content: prompt }],
                    stream: false,
                }),
            });

            console.log('[RegisContext] 📥 Response received');
            console.log('[RegisContext] Status:', res.status, res.statusText);

            if (!res.ok) {
                console.error('[RegisContext] ❌ Response not OK');
                const err = await res.json().catch(() => ({}));
                console.error('[RegisContext] Error data:', JSON.stringify(err, null, 2));

                if (res.status === 503 || res.status === 500) {
                    throw new Error(`Ollama model "${OLLAMA_MODEL}" not available. Make sure Ollama is running and the model is downloaded. Run: ollama pull qwen3.5:27b`);
                }
                if (res.status === 404) {
                    throw new Error(`Ollama model "${OLLAMA_MODEL}" not found. Run: ollama pull qwen3.5:27b`);
                }
                if (res.status === 0 || err.message?.includes('fetch')) {
                    throw new Error('Cannot connect to Ollama. Make sure Ollama is installed and running at http://localhost:11434');
                }

                throw new Error(err.error?.message || `Ollama error: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();
            const result = data.message?.content || '';

            console.log('[RegisContext] ✅ Response OK');
            console.log('[RegisContext] Result length:', result.length);
            console.log('[RegisContext] Result preview:', result.substring(0, 200) + '...');
            console.log('[RegisContext] ========== generateCompletion END ==========');

            return result;
        } catch (error) {
            console.error('[RegisContext] ========== generateCompletion ERROR ==========');
            console.error('[RegisContext] Error type:', error.constructor.name);
            console.error('[RegisContext] Error message:', error.message);
            console.error('[RegisContext] ========== generateCompletion ERROR END ==========');
            throw error;
        }
    }, []);

    return (
        <RegisContext.Provider value={{ provider: 'ollama', model: OLLAMA_MODEL, generateCompletion }}>
            {children}
        </RegisContext.Provider>
    );
}

export function useRegis() {
    return useContext(RegisContext);
}
