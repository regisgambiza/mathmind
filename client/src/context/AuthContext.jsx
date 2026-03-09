import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const saved = localStorage.getItem('mathmind_teacher');
        if (saved) {
            try {
                setUser(JSON.parse(saved));
            } catch (e) {
                localStorage.removeItem('mathmind_teacher');
            }
        }
        setLoading(false);
    }, []);

    const login = (userData) => {
        setUser(userData);
        localStorage.setItem('mathmind_teacher', JSON.stringify(userData));
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('mathmind_teacher');
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
