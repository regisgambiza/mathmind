import React from 'react';

export default function TutorExplanation({ data }) {
    if (!data) return null;

    const { intro, why_mistake, steps, key_rule, practice_tip } = data;

    return (
        <div className="animate-fadeUp">
            {/* Branded Section Label */}
            <div className="flex items-center gap-2 mb-6">
                <span className="text-base">✨</span>
                <h3 className="font-syne font-800 text-[10px] text-accent uppercase tracking-[0.2em]">Regis Explanation</h3>
                <div className="h-[1px] flex-1 bg-accent/10" />
            </div>

            <div className="space-y-6">
                {/* Intro */}
                {intro && (
                    <p className="font-dm text-ink text-sm leading-relaxed italic">
                        "{intro}"
                    </p>
                )}

                {/* Why the mistake */}
                {why_mistake && (
                    <div className="space-y-2">
                        <h4 className="font-syne font-700 text-xs text-accent uppercase flex items-center gap-1.5">
                            <span>💡</span> Why this might have happened
                        </h4>
                        <p className="font-dm text-muted text-sm leading-relaxed">
                            {why_mistake}
                        </p>
                    </div>
                )}

                {/* Steps */}
                {steps && Array.isArray(steps) && steps.length > 0 && (
                    <div className="space-y-3">
                        <h4 className="font-syne font-700 text-xs text-accent uppercase flex items-center gap-1.5">
                            <span>👣</span> Step-by-Step path
                        </h4>
                        <div className="space-y-2.5">
                            {steps.map((step, i) => (
                                <div key={i} className="flex gap-3 items-start">
                                    <span className="w-5 h-5 rounded-full bg-accent/10 text-accent flex items-center justify-center font-syne font-800 text-[10px] flex-shrink-0 mt-0.5">
                                        {i + 1}
                                    </span>
                                    <p className="font-dm text-ink text-sm leading-relaxed">{step}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Key Rule */}
                {key_rule && (
                    <div className="bg-accent2/5 border border-accent2/20 rounded-xl p-4">
                        <h4 className="font-syne font-700 text-xs text-accent2 uppercase flex items-center gap-1.5 mb-1.5">
                            <span>🎯</span> Key Rule to Remember
                        </h4>
                        <p className="font-dm text-ink text-sm font-500 italic">
                            {key_rule}
                        </p>
                    </div>
                )}

                {/* Practice Tip */}
                {practice_tip && (
                    <div className="pt-2">
                        <div className="flex items-center gap-2 text-muted">
                            <span className="text-sm">💪</span>
                            <p className="font-dm text-xs italic">{practice_tip}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
