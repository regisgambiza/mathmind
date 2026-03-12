import { createContext, useContext, useState, useEffect } from 'react';
import api from '../hooks/useApi';

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

    const googleLogin = async (credential) => {
        try {
            const response = await api.post('/api/auth/google/login', {
                credential,
                user_type: 'teacher'
            });
            const { user: userData, token } = response.data;
            login({ ...userData, token, authType: 'google' });
            return response.data;
        } catch (error) {
            console.error('Google login error:', error);
            throw error;
        }
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, googleLogin, isAuthenticated: !!user, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
