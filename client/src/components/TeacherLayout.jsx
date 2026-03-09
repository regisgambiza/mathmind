import React, { useState } from 'react';
import TeacherSidebar from './TeacherSidebar';

export default function TeacherLayout({ children }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="flex min-h-screen bg-paper">
            <TeacherSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile Header */}
                <header className="lg:hidden flex items-center justify-between px-6 py-4 bg-card border-b-2 border-border sticky top-0 z-30">
                    <h1 className="font-syne font-800 text-lg text-ink">
                        Math<span className="text-accent">Mind</span>
                    </h1>
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="p-2 text-ink hover:bg-accent/10 rounded-lg transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                </header>

                <main className="flex-1 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
