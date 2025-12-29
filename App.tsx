import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { ToastProvider } from './context/ToastContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { PendenciasList } from './pages/Pendencias';
import { Config } from './pages/Config';

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
    <AppProvider>
      <ToastProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </ToastProvider>
    </AppProvider>
  );
};

export default App;