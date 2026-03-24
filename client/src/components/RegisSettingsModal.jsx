import { useRegis } from '../context/RegisContext';

export default function RegisSettingsModal({ onClose }) {
    const { model, provider } = useRegis();

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
                        <span className="font-syne font-700">☁️ Cloud AI (OpenRouter)</span> — Powered by OpenRouter.
                        No local setup required, internet connection needed.
                    </p>
                </div>

                {/* Model Display */}
                <label className="block font-syne font-600 text-[10px] text-muted uppercase tracking-widest mb-2">
                    AI Model
                </label>
                <div className="mb-5 p-4 rounded-xl bg-accent/10 border border-accent/20">
                    <div className="flex items-start gap-3">
                        <span className="text-2xl">🤖</span>
                        <div>
                            <p className="font-syne font-700 text-sm text-ink mb-1">
                                {model}
                            </p>
                            <p className="font-dm text-xs text-muted leading-relaxed">
                                Running via OpenRouter at https://openrouter.ai
                            </p>
                            <p className="font-dm text-xs text-muted leading-relaxed mt-2">
                                <span className="font-syne font-700">To change models:</span>
                                <br />
                                Update the model name in <code className="bg-ink/20 px-1 rounded">client/src/context/RegisContext.jsx</code>
                                <br />
                                Browse models: <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" className="text-accent underline">openrouter.ai/models</a>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Setup Instructions */}
                <div className="mb-5 p-4 rounded-xl bg-paper border border-border">
                    <p className="font-syne font-700 text-sm text-ink mb-2">📦 First Time Setup</p>
                    <ol className="font-dm text-xs text-muted space-y-2 list-decimal list-inside">
                        <li>Get an API key from <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-accent underline">openrouter.ai/keys</a></li>
                        <li>Add <code className="bg-ink/20 px-1 rounded">OPENROUTER_API_KEY=your_key_here</code> to backend environment variables</li>
                        <li>Optional: set <code className="bg-ink/20 px-1 rounded">OPENROUTER_MODEL=openai/gpt-4o-mini,google/gemini-2.0-flash-001,qwen/qwen3-235b-a22b-thinking-2507</code> on the backend</li>
                        <li>Redeploy backend service</li>
                    </ol>
                    <p className="font-dm text-xs text-muted mt-3">
                        <span className="font-syne font-700">Model chain:</span> openai/gpt-4o-mini → google/gemini-2.0-flash-001 → qwen/qwen3-235b-a22b-thinking-2507
                    </p>
                </div>

                <button
                    onClick={onClose}
                    className="w-full py-3 rounded-xl bg-accent text-white font-syne font-700 text-sm hover:bg-accent/90 active:scale-[0.98] transition-all shadow-lg shadow-accent/20"
                >
                    Done
                </button>
            </div>
        </div>
    );
}
