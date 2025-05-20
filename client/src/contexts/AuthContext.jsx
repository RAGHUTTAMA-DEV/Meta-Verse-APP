import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../utils/api';

// Create context with a default value
const AuthContext = createContext({
  user: null,
  loading: true,
  error: null,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  isAuthenticated: false
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setLoading(false);
          return;
        }

        // Get current user data
        const response = await authAPI.getCurrentUser();
        if (response?.data?.user) {
          setUser(response.data.user);
        } else {
          // Clear invalid token
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
        }
      } catch (err) {
        console.error('Session check failed:', err);
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const login = async (email, password) => {
    try {
      setError(null);
      const response = await authAPI.login(email, password);
      
      if (response?.data?.user && response?.data?.token) {
        // Store token
        localStorage.setItem('token', response.data.token);
        
        setUser(response.data.user);
        return { success: true };
      } else {
        throw new Error(response?.error || 'Invalid response from server');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Login failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const register = async (username, email, password) => {
    try {
      setError(null);
      const response = await authAPI.register(username, email, password);
      
      if (response?.data?.user && response?.data?.token) {
        // Store token
        localStorage.setItem('token', response.data.token);
        
        setUser(response.data.user);
        return { success: true };
      } else {
        throw new Error(response?.error || 'Invalid response from server');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Registration failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const logout = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await authAPI.logout();
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      setUser(null);
      setError(null);
    }
  };

  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export default AuthContext; 