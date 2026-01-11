import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { Truck, Loader2, User, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { DEFAULT_CREDS } from '../constants';

const Login: React.FC = () => {
  const { login } = useAuth();
  const { users, loading: dataLoading } = useData();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    setTimeout(() => {
      const normalizedUser = username.trim().toLowerCase();
      
      // Check if user exists (Admin or Sheet User)
      const isAdmin = normalizedUser === DEFAULT_CREDS.username;
      const sheetUser = users?.find(u => u.username.toLowerCase() === normalizedUser);

      if (!isAdmin && !sheetUser) {
        setError('Usuário não encontrado.');
        setLoading(false);
        return;
      }

      // Check Password
      const validPass = isAdmin 
        ? password === DEFAULT_CREDS.password
        : sheetUser?.password === password;

      if (validPass) {
        login(isAdmin ? {
          username: 'Admin',
          role: 'admin',
          linkedOriginUnit: '',
          linkedDestUnit: ''
        } : sheetUser!);
      } else {
        setError('Senha incorreta.');
      }
      
      setLoading(false);
    }, 800); 
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary-200/30 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary-500/10 rounded-full blur-3xl" />

      <div className="bg-white p-8 md:p-10 rounded-2xl shadow-2xl w-full max-w-md relative z-10 border border-white/50 backdrop-blur-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-gradient-to-tr from-primary-600 to-primary-400 p-4 rounded-2xl shadow-lg mb-4 transform transition hover:scale-105 duration-300">
             <Truck size={40} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight">São Luiz Express</h1>
          <p className="text-gray-500 text-sm mt-1">Gestão Inteligente de Pendências</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Usuário</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User size={18} className="text-gray-400 group-focus-within:text-primary-500 transition-colors" />
              </div>
              <input 
                type="text" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all text-gray-700 placeholder-gray-400"
                placeholder="Seu usuário de acesso"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Senha</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={18} className="text-gray-400 group-focus-within:text-primary-500 transition-colors" />
              </div>
              <input 
                type={showPassword ? "text" : "password"} 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all text-gray-700 placeholder-gray-400"
                placeholder="Sua senha secreta"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <AlertCircle size={20} className="text-red-500 shrink-0" />
              <span className="text-sm text-red-700 font-medium">{error}</span>
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading || dataLoading}
            className="w-full bg-gradient-to-r from-primary-600 to-primary-700 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-primary-500/30 hover:shadow-primary-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none flex justify-center items-center mt-2"
          >
            {loading || dataLoading ? (
               <div className="flex items-center gap-2">
                 <Loader2 className="animate-spin" size={20} />
                 <span>{dataLoading ? 'Carregando Sistema...' : 'Autenticando...'}</span>
               </div>
            ) : (
              'Entrar no Sistema'
            )}
          </button>
        </form>
        
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400">
            &copy; 2026 São Luiz Express. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;