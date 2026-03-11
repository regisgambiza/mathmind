import { useState } from 'react';
import { useRegis } from '../context/RegisContext';

export default function RegisSettingsModal({ onClose }) {
    const { apiKey, setApiKey, MODEL_FALLBACK_CHAIN } = useRegis();
    const [testStatus, setTestStatus] = useState(null);
    const [localKey, setLocalKey] = useState(apiKey);
    const [errorMsg, setErrorMsg] = useState('');
    const [testLog, setTestLog] = useState(null);

    const handleSave = () => {
        setApiKey(localKey);
        onClose();
    };

    const handleTest = async () => {
        setTestStatus('testing');
        setErrorMsg('');
        const prompt = 'Say "Connection Successful".';
        setTestLog({ sent: prompt, received: '' });

        try {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localKey}`,
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'MathMind Test',
                },
                body: JSON.stringify({
                    model: MODEL_FALLBACK_CHAIN[0],
                    messages: [{ role: 'user', content: prompt }],
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error?.message || `HTTP ${res.status}: ${res.statusText}`);
            }
            const data = await res.json();
            const reply = data.choices?.[0]?.message?.content || 'No content returned';
            setTestLog({ sent: prompt, received: reply });
            setTestStatus('ok');
        } catch (err) {
            setTestStatus('fail');
            setErrorMsg(err.message);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/40 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-full max-w-[480px] bg-card border-t-2 border-border p-6 pb-8 animate-fadeUp rounded-t-3xl shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="font-syne font-800 text-xl text-ink">⚙️ AI Settings</h2>
                    <button onClick={onClose} className="text-muted hover:text-ink transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Info Box */}
                <div className="mb-5 p-4 rounded-xl bg-accent/10 border border-accent/20">
                    <p className="font-dm text-xs text-ink leading-relaxed">
                        <span className="font-syne font-700">☁️ OpenRouter AI</span> — Uses a smart fallback system. 
                        Tries models in order: GPT-4o → Gemini 2.0 → Llama 3.3 → DeepSeek R1 → Nemotron → Mimo.
                        Automatically switches to the next available model if one fails.
                    </p>
                </div>

                {/* API Key Input */}
                <label className="block font-syne font-600 text-[10px] text-muted uppercase tracking-widest mb-2">
                    OpenRouter API Key
                </label>
                <input
                    type="password"
                    value={localKey}
                    onChange={e => setLocalKey(e.target.value)}
                    placeholder="sk-or-..."
                    className="w-full p-3 rounded-xl border-2 border-border bg-paper font-dm text-sm outline-none focus:border-accent mb-4"
                />

                {/* Model Chain Display */}
                <label className="block font-syne font-600 text-[10px] text-muted uppercase tracking-widest mb-2">
                    AI Model
                </label>
                <div className="mb-5 p-4 rounded-xl bg-accent/10 border border-accent/20">
                    <div className="flex items-start gap-3">
                        <span className="text-2xl">🤖</span>
                        <div>
                            <p className="font-syne font-700 text-sm text-ink mb-1">
                                OpenRouter Free (Auto-Select)
                            </p>
                            <p className="font-dm text-xs text-muted leading-relaxed">
                                Automatically routes to the best available free model at request time. 
                                No need to select specific models — OpenRouter handles it.
                            </p>
                        </div>
                    </div>
                </div>

                {testStatus === 'fail' && errorMsg && (
                    <div className="mb-4 p-3 rounded-lg bg-wrong/10 border border-wrong/20">
                        <p className="text-[10px] text-wrong font-dm leading-tight">
                            <span className="font-syne font-800 uppercase mr-1">Error:</span>
                            {errorMsg}
                        </p>
                    </div>
                )}

                {testLog && (
                    <div className="mb-4 p-4 bg-ink rounded-xl border border-white/10 font-mono text-[10px] space-y-3 shadow-inner">
                        <div className="flex items-center gap-2 border-b border-white/5 pb-2 mb-2">
                            <div className="flex gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-wrong/50" />
                                <span className="w-1.5 h-1.5 rounded-full bg-accent2/50" />
                                <span className="w-1.5 h-1.5 rounded-full bg-accent/50" />
                            </div>
                            <span className="text-white/40 uppercase tracking-widest font-syne font-700 text-[8px]">Test Result</span>
                        </div>
                        <div>
                            <p className="text-accent2/80 mb-1">▶ SENT</p>
                            <p className="text-paper/90 leading-relaxed indent-4">{testLog.sent}</p>
                        </div>
                        <div>
                            <p className="text-accent/80 mb-1">◀ RECEIVED</p>
                            <p className="text-paper/90 leading-relaxed indent-4">
                                {testStatus === 'testing' ? (
                                    <span className="animate-pulse">Testing model...</span>
                                ) : (
                                    testLog.received || '(Empty Response)'
                                )}
                            </p>
                        </div>
                    </div>
                )}

                <div className="flex gap-3">
                    <button
                        onClick={handleTest}
                        disabled={testStatus === 'testing'}
                        className="flex-1 py-3 rounded-xl border-2 border-border bg-paper font-syne font-600 text-sm text-ink hover:border-accent transition-colors disabled:opacity-50"
                    >
                        {testStatus === 'testing' ? 'Testing...' : testStatus === 'ok' ? '✓ Working' : testStatus === 'fail' ? '✗ Failed' : 'Test Connection'}
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 py-3 rounded-xl bg-accent text-white font-syne font-700 text-sm hover:bg-accent/90 active:scale-[0.98] transition-all shadow-lg shadow-accent/20"
                    >
                        Save Settings
                    </button>
                </div>

                <p className="mt-4 text-[10px] text-muted font-dm text-center">
                    Get your free API key at{' '}
                    <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-accent underline">
                        openrouter.ai/keys
                    </a>
                </p>
            </div>
        </div>
    );
}
