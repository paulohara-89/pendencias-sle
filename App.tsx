
import React, { ReactNode, ErrorInfo, Component } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { ToastProvider } from './context/ToastContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { PendenciasList } from './pages/Pendencias';
import { Config } from './pages/Config';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Fixed ErrorBoundary: Explicitly extending React.Component and using this.state/this.props to ensure TypeScript correctly resolves inherited members.
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    // Initialize state
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    // Access state and props via 'this' to ensure type resolution
    const { hasError, error } = this.state;
    const { children } = this.props;

    if (hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 text-center">
          <div className="max-w-md bg-white p-8 rounded-2xl shadow-xl border border-red-100">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ph-fill ph-warning-octagon text-3xl"></i>
            </div>
            <h1 className="text-xl font-bold text-gray-800 mb-2">Ops! Algo deu errado.</h1>
            <p className="text-gray-500 mb-6 text-sm">
              O sistema encontrou um erro inesperado. Tente recarregar a página.
            </p>
            <div className="bg-gray-100 p-3 rounded-lg text-left text-xs font-mono text-gray-600 overflow-auto max-h-32 mb-6">
               {error?.message || 'Erro desconhecido'}
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:bg-indigo-900 transition"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}

const ProtectedRoute = ({ children }: React.PropsWithChildren) => {
  const { currentUser } = useApp();
  if (!currentUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const AppRoutes = () => {
  const { currentUser } = useApp();

  return (
    <Routes>
      <Route path="/login" element={currentUser ? <Navigate to="/" /> : <Login />} />
      
      <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
      <Route path="/pendencias" element={<ProtectedRoute><Layout><PendenciasList mode="all" /></Layout></ProtectedRoute>} />
      <Route path="/criticos" element={<ProtectedRoute><Layout><PendenciasList mode="critical" /></Layout></ProtectedRoute>} />
      <Route path="/em-busca" element={<ProtectedRoute><Layout><PendenciasList mode="search" /></Layout></ProtectedRoute>} />
      
      <Route path="/config" element={<ProtectedRoute><Layout><Config /></Layout></ProtectedRoute>} />
    </Routes>
  );
}

const App = () => {
  return (
    <ErrorBoundary>
      <AppProvider>
        <ToastProvider>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </ToastProvider>
      </AppProvider>
    </ErrorBoundary>
  );
};

export default App;
