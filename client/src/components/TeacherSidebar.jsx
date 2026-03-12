import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRegis } from '../context/RegisContext';
import RegisSettingsModal from './RegisSettingsModal';

export default function TeacherSidebar({ isOpen, onClose }) {
    const { user, logout } = useAuth();
    const { provider, model } = useRegis();
    const navigate = useNavigate();
    const [showSettings, setShowSettings] = React.useState(false);

    const handleLogout = () => {
        logout();
        navigate('/');
    };
    const navItems = [
        { name: 'Dashboard', path: '/teacher/dashboard-home', icon: 'D' },
        { name: 'My Quizzes', path: '/teacher/history', icon: 'Q' },
        { name: 'Create Quiz', path: '/teacher/setup', icon: '+' },
        { name: 'Classroom', path: '/teacher/connect-classroom', icon: '📚' },
        { name: 'Admin', path: '/teacher/admin', icon: 'A' },
    ];

    return (
        <>
            {/* Backdrop for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-ink/20 backdrop-blur-sm z-40 lg:hidden"
                    onClick={onClose}
                />
            )}

            <div className={`
                fixed inset-y-0 left-0 z-50 w-64 bg-card border-r-2 border-border flex flex-col pt-10 px-4 transition-transform duration-300 lg:translate-x-0 lg:static lg:h-screen lg:sticky lg:top-0
                ${isOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="mb-10 px-4 flex items-center justify-between">
                    <div>
                        <h1 className="font-syne font-800 text-xl text-ink">
                            Math<span className="text-accent">Mind</span>
                        </h1>
                        <p className="text-[10px] text-muted font-600 uppercase tracking-widest mt-1">Teacher Dashboard</p>
                    </div>
                    {/* Close button for mobile */}
                    <button onClick={onClose} className="lg:hidden p-2 text-muted hover:text-ink">
                        ✕
                    </button>
                </div>

                <nav className="flex-1 space-y-2">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={() => {
                                if (window.innerWidth < 1024) onClose();
                            }}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-4 py-3 rounded-xl font-syne font-600 text-sm transition-all ${isActive
                                    ? 'bg-accent text-white shadow-lg shadow-accent/20'
                                    : 'text-muted hover:bg-accent/10 hover:text-accent'
                                }`
                            }
                        >
                            <span className="text-lg">{item.icon}</span>
                            {item.name}
                        </NavLink>
                    ))}
                </nav>

                <div className="mt-auto pb-10 space-y-4">
                    <div className="bg-paper border border-border rounded-xl p-4">
                        <p className="text-[10px] text-muted font-600 uppercase mb-1">Signed in as</p>
                        <p className="font-syne font-700 text-ink text-xs truncate">{user?.username || 'Teacher'}</p>
                    </div>

                    <div className="bg-paper border border-border rounded-xl p-4">
                        <p className="text-[10px] text-muted font-600 uppercase mb-1">Active Engine (Regis)</p>
                        <div className="flex items-center gap-2">
                            <span className="text-xs">{provider === 'openrouter' ? '☁️' : '🦙'}</span>
                            <p className="font-syne font-700 text-accent text-[10px] truncate uppercase tracking-tighter">
                                {model.split('/').pop()}
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={() => setShowSettings(true)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-ink font-syne font-600 text-sm hover:bg-accent/10 hover:text-accent transition-all"
                    >
                        <span>⚙️</span>
                        Regis Settings
                    </button>

                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-wrong font-syne font-600 text-sm hover:bg-red-50 transition-all"
                    >
                        <span>🚪</span>
                        Logout
                    </button>
                </div>
            </div>

            {showSettings && <RegisSettingsModal onClose={() => setShowSettings(false)} />}
        </>
    );
}


