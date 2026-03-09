import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
    const [darkMode, setDarkMode] = useState(() => {
        return localStorage.getItem('mathmind_theme') === 'dark';
    });

    useEffect(() => {
        if (darkMode) {
            document.body.classList.add('dark');
            localStorage.setItem('mathmind_theme', 'dark');
        } else {
            document.body.classList.remove('dark');
            localStorage.setItem('mathmind_theme', 'light');
        }
    }, [darkMode]);

    const toggleDarkMode = () => setDarkMode(!darkMode);

    return (
        <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
