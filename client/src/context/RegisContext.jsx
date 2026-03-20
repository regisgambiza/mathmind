import { createContext, useContext, useCallback } from 'react';

const RegisContext = createContext(null);

// OpenRouter free models - hardcoded
// Using openrouter/free to auto-select from available free models
// https://openrouter.ai/models?max_price=0
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = 'openrouter/free';

export function RegisProvider({ children }) {
    const generateCompletion = useCallback(async (prompt) => {
        console.log('[RegisContext] ========== generateCompletion START ==========');
        console.log('[RegisContext] Using OpenRouter free model:', OPENROUTER_MODEL);
        console.log('[RegisContext] Base URL:', OPENROUTER_BASE_URL);
        console.log('[RegisContext] Prompt length:', prompt?.length || 0);
        console.log('[RegisContext] Prompt preview:', prompt ? prompt.substring(0, 200) + '...' : 'NONE');

        try {
            console.log('[RegisContext] 📡 Sending request to OpenRouter...');
            console.log('[RegisContext] URL:', `${OPENROUTER_BASE_URL}/chat/completions`);

            const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY || ''}`,
                    'HTTP-Referer': 'http://localhost:5173',
                    'X-Title': 'MathMind AI Tutor',
                },
                body: JSON.stringify({
                    model: OPENROUTER_MODEL,
                    messages: [{ role: 'user', content: prompt }],
                }),
            });

            console.log('[RegisContext] 📥 Response received');
            console.log('[RegisContext] Status:', res.status, res.statusText);

            if (!res.ok) {
                console.error('[RegisContext] ❌ Response not OK');
                const err = await res.json().catch(() => ({}));
                console.error('[RegisContext] Error data:', JSON.stringify(err, null, 2));

                if (res.status === 401) {
                    throw new Error('OpenRouter API key invalid or missing. Set VITE_OPENROUTER_API_KEY in .env file.');
                }
                if (res.status === 429) {
                    throw new Error('OpenRouter rate limit exceeded. Try again in a few seconds.');
                }
                if (res.status === 503 || res.status === 500) {
                    throw new Error(`OpenRouter model "${OPENROUTER_MODEL}" temporarily unavailable. Try again later.`);
                }
                if (res.status === 0 || err.message?.includes('fetch')) {
                    throw new Error('Cannot connect to OpenRouter. Check your internet connection.');
                }

                throw new Error(err.error?.message || `OpenRouter error: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();
            const result = data.choices?.[0]?.message?.content || '';

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
        <RegisContext.Provider value={{ provider: 'openrouter', model: OPENROUTER_MODEL, generateCompletion }}>
            {children}
        </RegisContext.Provider>
    );
}

export function useRegis() {
    return useContext(RegisContext);
}
