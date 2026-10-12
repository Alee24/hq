import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { api } from '../api/client';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (credentials: { username_or_email: string; password: string }) => Promise<void>;
  logout: () => void;
  hasRole: (allowedRoles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getStoredUser = (): User | null => {
  try {
    const raw = localStorage.getItem('cc_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const setStoredUser = (u: User | null) => {
  try {
    if (u) {
      localStorage.setItem('cc_user', JSON.stringify(u));
    } else {
      localStorage.removeItem('cc_user');
    }
  } catch {
    // Ignore storage quota or disabled localStorage
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialUser = getStoredUser();
  const [user, setUserState] = useState<User | null>(initialUser);
  const [loading, setLoading] = useState<boolean>(!initialUser && !!api.getToken());

  const setUser = (newUser: User | null) => {
    setUserState(newUser);
    setStoredUser(newUser);
  };

  const fetchCurrentUser = async () => {
    const token = api.getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const me = await api.getMe();
      if (me && me.id) {
        setUser(me);
      }
    } catch (err: any) {
      // Resilience across container rebuilds & transient network hiccups:
      // If the backend is restarting or rebuilding, KEEP the user logged in using cached credentials.
      console.warn('[AUTH] Session verification deferred due to server restart or network delay:', err?.message);
      const cached = getStoredUser();
      if (!cached && err?.message?.includes('401')) {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();

    const handleUnauthorized = () => {
      // Only clear if token was also removed
      if (!api.getToken()) {
        setUser(null);
      }
    };
    window.addEventListener('cc_unauthorized', handleUnauthorized);
    return () => window.removeEventListener('cc_unauthorized', handleUnauthorized);
  }, []);

  const login = async (credentials: { username_or_email: string; password: string }) => {
    const res = await api.login(credentials);
    setUser(res.user);
  };

  const logout = () => {
    api.logout();
    setUser(null);
  };

  const hasRole = (allowedRoles: UserRole[]): boolean => {
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN') return true;
    return allowedRoles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
