import { createContext, useContext, useCallback } from 'react';

const RegisContext = createContext(null);

// OpenRouter model (can be overridden at build time)
const OPENROUTER_MODEL_RAW = import.meta.env.VITE_OPENROUTER_MODEL || 'openai/gpt-oss-120b,google/gemini-2.0-flash-001,qwen/qwen3-235b-a22b-thinking-2507';
// Parse the model list and use the first one as default
const OPENROUTER_MODELS = OPENROUTER_MODEL_RAW.split(',').map(m => m.trim()).filter(m => m);
const OPENROUTER_MODEL = OPENROUTER_MODELS[0] || 'google/gemini-2.0-flash-001';

export function RegisProvider({ children }) {
    const generateCompletion = useCallback(async (prompt) => {
        console.log('[RegisContext] ========== generateCompletion START ==========');
        console.log('[RegisContext] Prompt length:', prompt?.length || 0);

        try {
            // Use absolute URL for production (Render), fallback to env for local dev
            let apiBase = import.meta.env.VITE_API_URL;
            
            // Ensure absolute URL - fix common mistakes (missing protocol)
            if (apiBase) {
                apiBase = apiBase.trim();
                if (!apiBase.startsWith('http://') && !apiBase.startsWith('https://')) {
                    console.warn('[RegisContext] ⚠️ VITE_API_URL missing protocol, adding https://');
                    apiBase = `https://${apiBase}`;
                }
                // Remove trailing slash
                apiBase = apiBase.replace(/\/$/, '');
            } else {
                // Default to Render production URL
                apiBase = 'https://mathmind-backend.onrender.com';
            }
            
            const url = `${apiBase}/api/ai/complete`;
            console.log('[RegisContext] 📡 Sending request to:', url);
            console.log('[RegisContext] Request body:', JSON.stringify({ prompt }).slice(0, 200));

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ prompt }),
                // Prevent automatic redirect handling - we want to see if we're being redirected
                redirect: 'manual',
            });

            console.log('[RegisContext] 📥 Response received');
            console.log('[RegisContext] Status:', res.status, res.statusText);
            console.log('[RegisContext] Headers:', Object.fromEntries(res.headers.entries()));
            console.log('[RegisContext] Content-Type:', res.headers.get('content-type'));
            console.log('[RegisContext] Content-Length:', res.headers.get('content-length'));

            // Check for redirect responses (301, 302, 307, 308)
            if ([301, 302, 307, 308].includes(res.status)) {
                const location = res.headers.get('location');
                console.error('[RegisContext] 🚫 Redirect detected:', res.status, 'Location:', location);
                throw new Error(`Redirect detected (${res.status}). Location: ${location || 'unknown'}. Check CORS configuration.`);
            }

            // Read raw text first to see what we actually got
            const rawText = await res.text();
            console.log('[RegisContext] Raw response text:', rawText);
            console.log('[RegisContext] Raw text length:', rawText.length);

            // Check for empty response body (common CORS preflight issue)
            if (!rawText || rawText.trim() === '') {
                console.error('[RegisContext] 🚫 Empty response body! This usually means:');
                console.error('[RegisContext]   1. CORS preflight failed');
                console.error('[RegisContext]   2. Server returned 200 OK with no body');
                console.error('[RegisContext]   3. Request never reached the backend');
                throw new Error('Empty response body from /api/ai/complete. Check CORS configuration and backend logs.');
            }

            if (!res.ok) {
                console.error('[RegisContext] Non-OK status');
                try {
                    const err = JSON.parse(rawText);
                    throw new Error(err.error || `Server error: ${res.status}`);
                } catch (e) {
                    throw new Error(`Server error: ${res.status} - ${rawText.slice(0, 100)}`);
                }
            }

            // Parse the JSON
            let data;
            try {
                data = JSON.parse(rawText);
            } catch (e) {
                console.error('[RegisContext] JSON parse failed. Raw text was:', rawText);
                throw new Error(`Invalid JSON response: ${e.message}. Raw: ${rawText.slice(0, 200)}`);
            }

            console.log('[RegisContext] Parsed JSON:', data);

            const result = data.choices?.[0]?.message?.content || data.completion || '';
            console.log('[RegisContext] Extracted completion:', result?.slice(0, 100));
            console.log('[RegisContext] ✅ Success');
            return result;
        } catch (error) {
            console.error('[RegisContext] ❌ Error:', error.message);
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
