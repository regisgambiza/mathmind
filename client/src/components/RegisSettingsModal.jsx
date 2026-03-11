import { useState } from 'react';
import { useRegis } from '../context/RegisContext';

export default function RegisSettingsModal({ onClose }) {
    const { provider, setProvider, apiKey, setApiKey, model, setModel, baseUrl, setBaseUrl } = useRegis();
    const [testStatus, setTestStatus] = useState(null); // null | 'testing' | 'ok' | 'fail'
    const [localKey, setLocalKey] = useState(apiKey);
    const [localModel, setLocalModel] = useState(model);
    const [localUrl, setLocalUrl] = useState(baseUrl);
    const [errorMsg, setErrorMsg] = useState('');
    const [testLog, setTestLog] = useState(null); // { sent: string, received: string }

    const handleSave = () => {
        setApiKey(localKey);
        setModel(localModel);
        setBaseUrl(localUrl);
        onClose();
    };

    const handleTest = async () => {
        setTestStatus('testing');
        setErrorMsg('');
        const prompt = 'Say "Connection Successful".';
        setTestLog({ sent: prompt, received: '' });

        try {
            if (provider === 'openrouter') {
                const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localKey}`,
                        'HTTP-Referer': window.location.origin,
                        'X-Title': 'MathMind Test',
                    },
                    body: JSON.stringify({
                        model: localModel || 'qwen/qwen-2.5-7b-instruct',
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
            } else {
                const res = await fetch(`${localUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: localModel || 'gpt-oss:latest',
                        messages: [{ role: 'user', content: prompt }],
                        stream: false,
                    }),
                });
                if (!res.ok) throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
                const data = await res.json();
                const reply = data.message?.content || 'No content returned';
                setTestLog({ sent: prompt, received: reply });
                setTestStatus('ok');
            }
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
                    <h2 className="font-syne font-800 text-xl text-ink">Regis Settings</h2>
                    <button onClick={onClose} className="text-muted hover:text-ink transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Provider toggle */}
                <div className="flex gap-2 mb-5 bg-border/40 rounded-xl p-1">
                    {['openrouter', 'ollama'].map(p => (
                        <button
                            key={p}
                            onClick={() => setProvider(p)}
                            className={`flex-1 py-2 rounded-lg font-syne font-600 text-sm transition-all ${provider === p ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'
                                }`}
                        >
                            {p === 'openrouter' ? '☁️ OpenRouter' : '🦙 Ollama'}
                        </button>
                    ))}
                </div>

                {provider === 'openrouter' ? (
                    <>
                        <label className="block font-syne font-600 text-[10px] text-muted uppercase tracking-widest mb-2">API Key</label>
                        <input
                            type="password"
                            value={localKey}
                            onChange={e => setLocalKey(e.target.value)}
                            placeholder="sk-or-..."
                            className="w-full p-3 rounded-xl border-2 border-border bg-paper font-dm text-sm outline-none focus:border-accent mb-4"
                        />

                        <label className="block font-syne font-600 text-[10px] text-muted uppercase tracking-widest mb-2">Quick Select Model</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                            {[
                                { id: 'qwen/qwen-2.5-7b-instruct', name: 'Qwen 2.5 7B', tag: 'Free & Math' },
                                { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B', tag: 'Free & Fast' },
                                { id: 'meta-llama/llama-3-8b-instruct', name: 'Llama 3 8B', tag: 'Free & Smart' },
                                { id: 'microsoft/phi-3-mini-instruct', name: 'Phi-3 Mini', tag: 'Free & Efficient' }
                            ].map(m => (
                                <button
                                    key={m.id}
                                    onClick={() => setLocalModel(m.id)}
                                    className={`p-3 rounded-xl border-2 text-left transition-all ${localModel === m.id ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/30'}`}
                                >
                                    <p className="font-syne font-700 text-xs text-ink">{m.name}</p>
                                    <p className="text-[9px] text-muted font-dm uppercase tracking-tighter">{m.tag}</p>
                                </button>
                            ))}
                        </div>

                        <label className="block font-syne font-600 text-[10px] text-muted uppercase tracking-widest mb-2">Manual Model String</label>
                        <input
                            type="text"
                            value={localModel}
                            onChange={e => setLocalModel(e.target.value)}
                            placeholder="provider/model-name"
                            className="w-full p-3 rounded-xl border-2 border-border bg-paper font-dm text-sm outline-none focus:border-accent"
                        />
                    </>
                ) : (
                    <>
                        <label className="block font-syne font-600 text-[10px] text-muted uppercase tracking-widest mb-2">Ollama Base URL</label>
                        <input
                            type="text"
                            value={localUrl}
                            onChange={e => setLocalUrl(e.target.value)}
                            placeholder="http://localhost:11434"
                            className="w-full p-3 rounded-xl border-2 border-border bg-paper font-dm text-sm outline-none focus:border-accent mb-4"
                        />

                        <label className="block font-syne font-600 text-[10px] text-muted uppercase tracking-widest mb-2">Installed Models</label>
                        <div className="grid grid-cols-2 gap-2 mb-4">
                            {['qwen3.5', 'gpt-oss', 'llama3.1:8b', 'glm-4.7-flash'].map(m => (
                                <button
                                    key={m}
                                    onClick={() => setLocalModel(m)}
                                    className={`p-3 rounded-xl border-2 text-center transition-all ${localModel === m ? 'border-accent bg-accent/5 text-accent' : 'border-border text-muted hover:border-accent/30'}`}
                                >
                                    <span className="font-syne font-700 text-xs">{m}</span>
                                </button>
                            ))}
                        </div>

                        <label className="block font-syne font-600 text-[10px] text-muted uppercase tracking-widest mb-2">Manual Model Name</label>
                        <input
                            type="text"
                            value={localModel}
                            onChange={e => setLocalModel(e.target.value)}
                            placeholder="llama3"
                            className="w-full p-3 rounded-xl border-2 border-border bg-paper font-dm text-sm outline-none focus:border-accent"
                        />
                    </>
                )}

                {testStatus === 'fail' && errorMsg && (
                    <div className="mt-4 p-3 rounded-lg bg-wrong/10 border border-wrong/20">
                        <p className="text-[10px] text-wrong font-dm leading-tight">
                            <span className="font-syne font-800 uppercase mr-1">Error:</span>
                            {errorMsg}
                        </p>
                    </div>
                )}

                {testLog && (
                    <div className="mt-4 p-4 bg-ink rounded-xl border border-white/10 font-mono text-[10px] space-y-3 shadow-inner">
                        <div className="flex items-center gap-2 border-b border-white/5 pb-2 mb-2">
                            <div className="flex gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-wrong/50" />
                                <span className="w-1.5 h-1.5 rounded-full bg-accent2/50" />
                                <span className="w-1.5 h-1.5 rounded-full bg-accent/50" />
                            </div>
                            <span className="text-white/40 uppercase tracking-widest font-syne font-700 text-[8px]">Raw Exchange</span>
                        </div>
                        <div>
                            <p className="text-accent2/80 mb-1">▶ SENT</p>
                            <p className="text-paper/90 leading-relaxed indent-4">{testLog.sent}</p>
                        </div>
                        <div>
                            <p className="text-accent/80 mb-1">◀ RECEIVED</p>
                            <p className="text-paper/90 leading-relaxed indent-4">
                                {testStatus === 'testing' ? (
                                    <span className="animate-pulse">Waiting for model...</span>
                                ) : (
                                    testLog.received || '(Empty Response)'
                                )}
                            </p>
                        </div>
                    </div>
                )}

                <div className="flex gap-3 mt-5">
                    <button
                        onClick={handleTest}
                        disabled={testStatus === 'testing'}
                        className="flex-1 py-3 rounded-xl border-2 border-border bg-paper font-syne font-600 text-sm text-ink hover:border-accent transition-colors disabled:opacity-50"
                    >
                        {testStatus === 'testing' ? 'Testing Model…' : testStatus === 'ok' ? '✓ Model Functional' : testStatus === 'fail' ? '✗ Test Failed' : 'Verify Model Logic'}
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 py-3 rounded-xl bg-accent text-white font-syne font-700 text-sm hover:bg-accent/90 active:scale-[0.98] transition-all shadow-lg shadow-accent/20"
                    >
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    );
}
