import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api from '../hooks/useApi';

const StudentContext = createContext(null);
const STORAGE_KEY = 'mathmind_student';

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function StudentProvider({ children }) {
  const [student, setStudent] = useState(null);
  const [profile, setProfile] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [progressLoading, setProgressLoading] = useState(false);
  const studentRef = useRef(null);

  useEffect(() => {
    studentRef.current = student;
  }, [student]);

  const persistStudent = (value) => {
    if (!value) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      id: value.id,
      name: value.name,
    }));
  };

  const refreshProfile = useCallback(async (studentId = null) => {
    const id = studentId || studentRef.current?.id;
    if (!id) return null;
    const res = await api.get(`/api/student/${id}/profile`);
    setProfile(res.data);
    setStudent((prev) => ({
      ...(prev || {}),
      id: res.data.id,
      name: res.data.name,
    }));
    return res.data;
  }, []);

  const loadProgress = useCallback(async (studentId = null) => {
    const id = studentId || studentRef.current?.id;
    if (!id) return null;
    setProgressLoading(true);
    try {
      const res = await api.get(`/api/student/${id}/progress`);
      setProgress(res.data);
      return res.data;
    } finally {
      setProgressLoading(false);
    }
  }, []);

  const completeAuth = useCallback(async (data) => {
    const account = data?.student;
    if (!account) throw new Error('Invalid student response');
    setStudent({ id: account.id, name: account.name });
    persistStudent(account);
    await refreshProfile(account.id);
    return account;
  }, [refreshProfile]);

  const register = useCallback(async (name, pin) => {
    const res = await api.post('/api/student/register', { name, pin });
    return completeAuth(res.data);
  }, [completeAuth]);

  const login = useCallback(async (name, pin) => {
    const res = await api.post('/api/student/login', { name, pin });
    return completeAuth(res.data);
  }, [completeAuth]);

  const googleLogin = useCallback(async (credential, googleId) => {
    const res = await api.post('/api/student/google-login', { 
      credential, 
      google_id: googleId 
    });
    return completeAuth(res.data);
  }, [completeAuth]);

  const logout = useCallback(() => {
    setStudent(null);
    setProfile(null);
    setProgress(null);
    persistStudent(null);
  }, []);

  const updateSettings = useCallback(async (patch) => {
    if (!student?.id) return null;
    const res = await api.patch(`/api/student/${student.id}/settings`, patch);
    await refreshProfile(student.id);
    await loadProgress(student.id);
    return res.data;
  }, [loadProgress, refreshProfile, student?.id]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const savedRaw = localStorage.getItem(STORAGE_KEY);
      const saved = savedRaw ? safeParse(savedRaw) : null;
      if (!saved?.id) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        if (!cancelled) setStudent({ id: saved.id, name: saved.name });
        await refreshProfile(saved.id);
      } catch {
        if (!cancelled) logout();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [refreshProfile]);

  const value = useMemo(() => ({
    student,
    profile,
    progress,
    loading,
    progressLoading,
    isStudentAuthenticated: !!student,
    register,
    login,
    googleLogin,
    logout,
    refreshProfile,
    loadProgress,
    updateSettings,
    setProgress,
  }), [
    student,
    profile,
    progress,
    loading,
    progressLoading,
    register,
    login,
    googleLogin,
    refreshProfile,
    loadProgress,
    updateSettings,
  ]);

  return (
    <StudentContext.Provider value={value}>
      {!loading && children}
    </StudentContext.Provider>
  );
}

export function useStudent() {
  return useContext(StudentContext);
}
