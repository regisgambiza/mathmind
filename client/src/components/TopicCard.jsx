import React from 'react';

/**
 * TopicCard displays the quiz topic/chapter and its subtopics in a clean, flat card format.
 * @param {string} chapter - The main topic or chapter title.
 * @param {string[]} subtopics - Array of subtopics to list.
 * @param {boolean} compact - If true, renders a more condensed version (e.g., for headers).
 */
export default function TopicCard({ chapter, subtopics = [], compact = false }) {
    if (!chapter && (!subtopics || subtopics.length === 0)) return null;

    if (compact) {
        return (
            <div className="flex flex-col min-w-0">
                <p className="text-[9px] font-syne font-800 text-muted uppercase tracking-widest mb-0.5">Quiz Topic</p>
                <h2 className="font-syne font-800 text-sm text-ink truncate leading-tight">
                    {chapter || (subtopics.length > 0 ? subtopics[0] : 'General Math')}
                </h2>
                {subtopics.length > 1 && (
                    <p className="text-[8px] font-dm text-muted truncate">
                        + {subtopics.length - 1} more subtopics
                    </p>
                )}
            </div>
        );
    }

    return (
        <div className="w-full bg-card border-2 border-border rounded-[2rem] overflow-hidden shadow-sm animate-fadeUp">
            {/* Header */}
            <div className="bg-accent/5 px-6 py-5 border-b-2 border-border/50">
                <p className="text-[10px] font-syne font-800 text-accent uppercase tracking-[0.2em] mb-1">Current Topic</p>
                <h3 className="font-syne font-800 text-2xl text-ink leading-tight">
                    {chapter || 'General Math'}
                </h3>
            </div>

            {/* Subtopics List */}
            {subtopics && subtopics.length > 0 && (
                <div className="p-4 space-y-1">
                    {subtopics.map((st, idx) => (
                        <div
                            key={idx}
                            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted/5 transition-colors group"
                        >
                            <div className="w-1.5 h-1.5 rounded-full bg-accent/40 group-hover:bg-accent transition-colors" />
                            <span className="font-dm font-600 text-sm text-ink/80 group-hover:text-ink transition-colors">
                                {st}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
