import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

// Create axios instance with default config
const api = axios.create({
  baseURL: import.meta.env.VITE_SERVER_URL || '/',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add request interceptor to include token in all requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear token on auth error
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('token');
    console.log('AuthProvider mounted:', {
      hasToken: !!token,
      tokenLength: token?.length,
      timestamp: new Date().toISOString()
    });

    const initializeAuth = async () => {
      try {
        if (token) {
          await checkAuthStatus();
        }
      } catch (err) {
        console.error('Auth initialization failed:', {
          error: err.message,
          timestamp: new Date().toISOString()
        });
        localStorage.removeItem('token');
        setUser(null);
      } finally {
        setInitialized(true);
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      console.log('Checking auth status:', {
        hasToken: !!token,
        tokenLength: token?.length,
        timestamp: new Date().toISOString()
      });

      if (!token) {
        console.log('No token found in checkAuthStatus:', {
          timestamp: new Date().toISOString()
        });
        setUser(null);
        return;
      }

      const response = await api.get('/api/auth/me');
      
      // The response is wrapped in a data field
      const { data } = response.data;
      if (!data || !data.user) {
        console.error('Invalid auth check response:', {
          response: response.data,
          timestamp: new Date().toISOString()
        });
        throw new Error('Invalid server response');
      }
      
      console.log('Auth check response:', {
        success: !!data,
        userData: data.user,
        timestamp: new Date().toISOString()
      });
      
      setUser(data.user);
      return data.user;
    } catch (err) {
      console.error('Auth check failed:', {
        error: err.message,
        response: err.response?.data,
        status: err.response?.status,
        timestamp: new Date().toISOString()
      });
      localStorage.removeItem('token');
      setUser(null);
      throw err;
    }
  };

  const login = async (email, password) => {
    try {
      setError(null);
      setLoading(true);
      console.log('Attempting login:', {
        email,
        hasPassword: !!password,
        timestamp: new Date().toISOString()
      });

      const response = await api.post('/api/auth/login', {
        email,
        password
      });
      
      // The response is wrapped in a data field
      const { data } = response.data;
      if (!data || !data.token || !data.user) {
        console.error('Invalid login response:', {
          response: response.data,
          timestamp: new Date().toISOString()
        });
        throw new Error('Invalid server response');
      }

      const { token, user } = data;
      console.log('Login successful:', {
        hasToken: !!token,
        tokenLength: token?.length,
        userData: user,
        timestamp: new Date().toISOString()
      });

      localStorage.setItem('token', token);
      setUser(user);
      return { success: true, user };
    } catch (err) {
      console.error('Login failed:', {
        error: err.message,
        response: err.response?.data,
        status: err.response?.status,
        timestamp: new Date().toISOString()
      });
      setError(err.response?.data?.error || err.message || 'Login failed');
      return { success: false, error: err.response?.data?.error || err.message || 'Login failed' };
    } finally {
      setLoading(false);
    }
  };

  const register = async (username, email, password) => {
    try {
      setError(null);
      console.log('Attempting registration:', {
        username,
        email,
        hasPassword: !!password,
        timestamp: new Date().toISOString()
      });

      const response = await api.post('/api/auth/register', {
        username,
        email,
        password
      });
      
      // The response is wrapped in a data field
      const { data } = response.data;
      if (!data || !data.token || !data.user) {
        console.error('Invalid registration response:', {
          response: response.data,
          timestamp: new Date().toISOString()
        });
        throw new Error('Invalid server response');
      }

      const { token, user } = data;
      console.log('Registration successful:', {
        hasToken: !!token,
        tokenLength: token?.length,
        userData: user,
        timestamp: new Date().toISOString()
      });

      localStorage.setItem('token', token);
      setUser(user);
      return { success: true };
    } catch (err) {
      console.error('Registration failed:', {
        error: err.message,
        response: err.response?.data,
        status: err.response?.status,
        timestamp: new Date().toISOString()
      });
      setError(err.response?.data?.error || err.message || 'Registration failed');
      return { success: false, error: err.response?.data?.error || err.message || 'Registration failed' };
    }
  };

  const logout = () => {
    console.log('Logging out:', {
      hadUser: !!user,
      timestamp: new Date().toISOString()
    });
    localStorage.removeItem('token');
    setUser(null);
    // Redirect to login page
    window.location.href = '/login';
  };

  // Debug log for user state changes
  useEffect(() => {
    console.log('User state changed:', {
      hasUser: !!user,
      userData: user,
      timestamp: new Date().toISOString()
    });
  }, [user]);

  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    checkAuthStatus
  };

  return (
    <AuthContext.Provider value={value}>
      {initialized && !loading && children}
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

// Export the configured axios instance
export { api as axios }; 