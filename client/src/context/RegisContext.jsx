import { createContext, useContext, useCallback } from 'react';

const RegisContext = createContext(null);

// OpenRouter free models - hardcoded
// Using openrouter/free to auto-select from available free models
// https://openrouter.ai/models?max_price=0
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = 'openrouter/free';

export function RegisProvider({ children }) {
    const generateCompletion = useCallback(async (prompt) => {
        console.log('[RegisContext] ========== generateCompletion START (PROXIED) ==========');
        console.log('[RegisContext] Prompt length:', prompt?.length || 0);

        try {
            const apiBase = import.meta.env.VITE_API_URL || '';
            console.log('[RegisContext] 📡 Sending request to backend proxy:', `${apiBase}/api/ai/complete`);

            const res = await fetch(`${apiBase}/api/ai/complete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ prompt }),
            });

            console.log('[RegisContext] 📥 Response received');
            console.log('[RegisContext] Status:', res.status, res.statusText);

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.error('[RegisContext] Error data:', err);
                throw new Error(err.error || `Server error: ${res.status}`);
            }

            const data = await res.json();
            // The backend returns the full OpenRouter response or just the content depending on how we want it
            // Based on routes/ai.py, it returns the full OpenRouter JSON
            const result = data.choices?.[0]?.message?.content || '';

            console.log('[RegisContext] ✅ Response OK');
            return result;
        } catch (error) {
            console.error('[RegisContext] Error:', error.message);
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
