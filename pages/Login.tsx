import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export const Login = () => {
  const { login, loading } = useApp();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsAnimating(true);
    
    // Login is now async to support animation timing
    const success = await login(user, pass);
    
    if (!success) {
      setIsAnimating(false);
      setError('Credenciais inválidas. Tente novamente.');
    }
    // If success, component will unmount/redirect, so no need to stop animation
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-[#E8E8F9] p-4 font-sans overflow-hidden">
      <div className="relative w-full max-w-md">
        
        {/* Animated Background Blob */}
        <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute top-0 -right-4 w-72 h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>

        <div className="glass-panel w-full p-10 rounded-3xl shadow-2xl border border-white/50 relative overflow-hidden transition-all duration-500">
           
           {/* Success/Entering Overlay */}
           {isAnimating && (
             <div className="absolute inset-0 z-20 bg-white/90 flex flex-col items-center justify-center animate-fade-in">
                 <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                 <h2 className="text-xl font-bold text-primary animate-pulse">Acessando Sistema...</h2>
                 <p className="text-sm text-gray-500 mt-2">Verificando credenciais</p>
             </div>
           )}

          <div className={`transition-opacity duration-500 ${isAnimating ? 'opacity-0' : 'opacity-100'}`}>
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary text-white mb-4 shadow-lg shadow-primary/30 transform hover:scale-105 transition duration-300">
                <i className="ph-fill ph-cube text-4xl"></i>
              </div>
              <h1 className="text-3xl font-bold text-primary tracking-tight">São Luiz <span className="text-secondary">Express</span></h1>
              <p className="text-gray-500 mt-2 text-sm font-medium">Controle de Pendências & Logística</p>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-1.5 group">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide ml-1 group-focus-within:text-secondary transition-colors">Usuário</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <i className="ph-duotone ph-user text-xl text-gray-400 group-focus-within:text-secondary transition-colors"></i>
                  </div>
                  <input 
                    type="text" 
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-gray-200 bg-white text-[#0F103A] focus:bg-white focus:border-secondary focus:ring-4 focus:ring-secondary/10 transition-all outline-none font-medium placeholder-gray-400"
                    placeholder="Seu nome de usuário"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5 group">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide ml-1 group-focus-within:text-secondary transition-colors">Senha</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <i className="ph-duotone ph-lock-key text-xl text-gray-400 group-focus-within:text-secondary transition-colors"></i>
                  </div>
                  <input 
                    type={showPass ? 'text' : 'password'} 
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    className="w-full pl-12 pr-12 py-3.5 rounded-xl border border-gray-200 bg-white text-[#0F103A] focus:bg-white focus:border-secondary focus:ring-4 focus:ring-secondary/10 transition-all outline-none font-medium placeholder-gray-400"
                    placeholder="••••••••"
                    required
                  />
                  <button 
                      type="button" 
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-0 inset-y-0 px-4 flex items-center text-gray-400 hover:text-secondary transition-colors focus:outline-none"
                      tabIndex={-1}
                  >
                      <i className={showPass ? "ph-bold ph-eye-slash text-xl" : "ph-bold ph-eye text-xl"}></i>
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-3 text-red-600 text-sm bg-red-50 p-4 rounded-xl border border-red-100 animate-shake">
                  <i className="ph-fill ph-warning-circle text-lg shrink-0"></i>
                  <span className="font-medium">{error}</span>
                </div>
              )}

              <button 
                type="submit" 
                disabled={loading || isAnimating}
                className="w-full bg-primary hover:bg-[#1A1B62] text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-primary/30 flex justify-center items-center gap-2 group transform active:scale-[0.98]"
              >
                {loading ? <i className="ph ph-spinner ph-spin text-xl"></i> : (
                  <>
                    Entrar no Sistema
                    <i className="ph-bold ph-arrow-right group-hover:translate-x-1 transition-transform"></i>
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 text-center">
               <p className="text-xs text-gray-400">© 2026 São Luiz Express. Todos os direitos reservados.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};