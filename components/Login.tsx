import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { Truck, Loader2, User, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, Zap, PackageCheck, Lightbulb } from 'lucide-react';
import { DEFAULT_CREDS } from '../constants';
import clsx from 'clsx';

const Login: React.FC = () => {
  const { login } = useAuth();
  const { users, baseData } = useData();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState<string | null>(null);

  // Efeito para limpar erro ao digitar
  useEffect(() => {
    if (error) setError('');
  }, [username, password]);

  // Lógica para obter a data de atualização (Mesma do Dashboard)
  const latestEmissaoDate = useMemo(() => {
    if (!baseData || baseData.length === 0) return '--/--/----';
    let maxVal = 0;
    let maxStr = '';
    
    // Helper para converter data dd/mm/yyyy para numero comparavel yyyymmdd
    const parseDateToComparable = (dateStr: string) => {
        if (!dateStr || typeof dateStr !== 'string') return 0;
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            return parseInt(parts[2] + parts[1].padStart(2, '0') + parts[0].padStart(2, '0'));
        }
        return 0;
    };

    baseData.forEach(d => {
       const currentVal = parseDateToComparable(d.DATA_EMISSAO);
       if (currentVal > maxVal) {
           maxVal = currentVal;
           maxStr = d.DATA_EMISSAO;
       }
    });
    return maxStr || '--/--/----';
  }, [baseData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    setTimeout(() => {
      const normalizedUser = username.trim().toLowerCase();
      
      const isAdmin = normalizedUser === DEFAULT_CREDS.username;
      const sheetUser = users?.find(u => u.username.toLowerCase() === normalizedUser);

      if (!isAdmin && !sheetUser) {
        setError('Credenciais inválidas. Verifique seu usuário.');
        setLoading(false);
        return;
      }

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
        setError('Senha incorreta. Tente novamente.');
      }
      
      setLoading(false);
    }, 1000); 
  };

  return (
    <div className="min-h-screen w-full flex relative overflow-hidden bg-[#050511] font-sans">
      <style>{`
        @keyframes highway-flow {
          0% { transform: translateY(100vh) scaleY(1); opacity: 0; }
          20% { opacity: 0.8; }
          100% { transform: translateY(-100vh) scaleY(1.5); opacity: 0; }
        }
        .light-stream {
          position: absolute;
          width: 3px;
          height: 150px;
          background: linear-gradient(to top, transparent, #EC1B23, transparent);
          opacity: 0;
          animation: highway-flow 3s infinite linear;
          border-radius: 4px;
        }
        .light-stream.white {
            background: linear-gradient(to top, transparent, rgba(255,255,255,0.3), transparent);
            width: 1px;
            height: 100px;
        }
        .light-stream.thick {
            width: 4px;
            height: 250px;
            background: linear-gradient(to top, transparent, #FF4D4D, transparent);
        }
        /* Delays & Positions for chaotic traffic feel */
        .light-stream:nth-child(1) { left: 10%; animation-duration: 4s; animation-delay: 0s; }
        .light-stream:nth-child(2) { left: 25%; animation-duration: 2.5s; animation-delay: 1s; }
        .light-stream:nth-child(3) { left: 45%; animation-duration: 3.5s; animation-delay: 2s; }
        .light-stream:nth-child(4) { left: 70%; animation-duration: 5s; animation-delay: 0.5s; }
        .light-stream:nth-child(5) { left: 85%; animation-duration: 3s; animation-delay: 1.5s; }
        .light-stream:nth-child(6) { left: 60%; animation-duration: 2.8s; animation-delay: 0.2s; }
        .light-stream:nth-child(7) { left: 15%; animation-duration: 4.5s; animation-delay: 2.5s; }
        .light-stream:nth-child(8) { left: 95%; animation-duration: 3.2s; animation-delay: 0.8s; }
      `}</style>

      {/* BACKGROUND ANIMATION LAYER (Visible on both Mobile & Desktop) */}
      <div className="absolute inset-0 z-0 pointer-events-none">
          {/* Subtle Grid */}
          <div className="absolute inset-0 opacity-10" style={{ 
              backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)', 
              backgroundSize: '50px 50px' 
          }}></div>
          
          {/* Moving Lights Container - Angled for speed effect */}
          <div className="absolute inset-0 transform -skew-x-12 scale-125 origin-bottom opacity-60 lg:opacity-100">
              <div className="light-stream thick"></div>
              <div className="light-stream"></div>
              <div className="light-stream white"></div>
              <div className="light-stream thick"></div>
              <div className="light-stream"></div>
              <div className="light-stream white"></div>
              <div className="light-stream"></div>
              <div className="light-stream thick"></div>
          </div>
          
          {/* Gradient Overlay for Depth */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#050511] via-transparent to-[#050511]/90"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#050511]/90 via-transparent to-[#050511]/50 lg:to-transparent"></div>
      </div>

      {/* LADO ESQUERDO: VISUAL & IDENTIDADE (Desktop) / TOP (Mobile) */}
      <div className="relative z-10 w-full lg:w-[60%] flex flex-col justify-between p-8 lg:p-16 h-full lg:h-auto text-white">
        
        {/* Header Brand */}
        <div className="flex flex-col items-center lg:items-start text-center lg:text-left mt-10 lg:mt-0">
            {/* Online Status Badge */}
            <div className="inline-flex items-center gap-2 bg-black/40 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full text-green-400 text-[11px] font-bold tracking-widest uppercase mb-8 shadow-lg shadow-black/20">
                <div className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </div>
                Atualizado em: {latestEmissaoDate}
            </div>

            <h1 className="text-4xl lg:text-7xl font-black text-white leading-tight tracking-tight drop-shadow-2xl">
                São Luiz <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#EC1B23] to-[#FF4D4D]">Express</span>
            </h1>
            <p className="mt-6 text-gray-300 text-sm lg:text-xl max-w-lg font-light leading-relaxed drop-shadow-md hidden lg:block">
                Conectando rotas, otimizando prazos. Gestão inteligente de pendências para uma logística de alta performance.
            </p>
        </div>

        {/* Pillars Footer (Desktop) */}
        <div className="hidden lg:grid grid-cols-4 gap-4 border-t border-white/10 pt-8 mt-auto">
            {[
                { label: 'RAPIDEZ', icon: Zap },
                { label: 'QUALIDADE', icon: PackageCheck },
                { label: 'SEGURANÇA', icon: ShieldCheck },
                { label: 'SOLUÇÃO', icon: Lightbulb }
            ].map((item) => (
                <div key={item.label} className="flex flex-col items-start group cursor-default">
                    <item.icon className="text-[#EC1B23] mb-2 group-hover:scale-110 transition-transform" size={24} />
                    <span className="text-sm font-bold tracking-widest text-gray-400 group-hover:text-white transition-colors">{item.label}</span>
                </div>
            ))}
        </div>
      </div>

      {/* LADO DIREITO: FORMULÁRIO (Desktop) / OVERLAY (Mobile) */}
      <div className="absolute inset-0 lg:static lg:w-[40%] flex flex-col justify-center items-center p-4 lg:p-12 z-20">
        
        {/* Form Container */}
        <div className="w-full max-w-sm mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700 bg-white/90 lg:bg-[#FCFCFE] backdrop-blur-lg lg:backdrop-blur-none p-6 md:p-10 rounded-3xl shadow-2xl lg:shadow-none border border-white/50 lg:border-none">
            
            {/* Mobile Brand Icon */}
            <div className="lg:hidden mb-6 text-center">
                <div className="w-14 h-14 bg-gradient-to-br from-[#0F103A] to-[#1A1B62] rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-blue-900/40">
                    <Truck className="text-white" size={28} />
                </div>
                <h2 className="text-xl font-black text-[#0F103A]">São Luiz Express</h2>
            </div>

            <div className="mb-8 lg:mb-10 text-center lg:text-left">
                <h2 className="text-2xl lg:text-3xl font-bold text-[#0F103A] mb-2 tracking-tight">Bem-vindo</h2>
                <p className="text-[#6E71DA] text-xs lg:text-sm font-bold">Faça login para acessar o painel de controle.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                {/* Username Input */}
                <div className="space-y-1.5 group">
                    <label className="text-[10px] lg:text-xs font-bold text-[#4649CF] uppercase tracking-wide ml-1">Usuário</label>
                    <div className={clsx(
                        "relative flex items-center bg-white border-2 rounded-xl transition-all duration-300 overflow-hidden",
                        isFocused === 'user' ? "border-[#4649CF] shadow-[0_0_0_4px_rgba(70,73,207,0.1)]" : "border-[#E5E5F1] hover:border-[#BFC0EF]"
                    )}>
                        <div className="pl-4 text-[#9798E4]">
                            <User size={20} />
                        </div>
                        <input 
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onFocus={() => setIsFocused('user')}
                            onBlur={() => setIsFocused(null)}
                            className="w-full py-3 px-3 outline-none text-[#0F103A] font-medium bg-transparent placeholder-[#BFC0EF] text-sm lg:text-base"
                            placeholder="Digite seu usuário"
                            required
                        />
                    </div>
                </div>

                {/* Password Input */}
                <div className="space-y-1.5 group">
                    <label className="text-[10px] lg:text-xs font-bold text-[#4649CF] uppercase tracking-wide ml-1">Senha</label>
                    <div className={clsx(
                        "relative flex items-center bg-white border-2 rounded-xl transition-all duration-300 overflow-hidden",
                        isFocused === 'pass' ? "border-[#4649CF] shadow-[0_0_0_4px_rgba(70,73,207,0.1)]" : "border-[#E5E5F1] hover:border-[#BFC0EF]"
                    )}>
                        <div className="pl-4 text-[#9798E4]">
                            <Lock size={20} />
                        </div>
                        <input 
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onFocus={() => setIsFocused('pass')}
                            onBlur={() => setIsFocused(null)}
                            className="w-full py-3 px-3 outline-none text-[#0F103A] font-medium bg-transparent placeholder-[#BFC0EF] text-sm lg:text-base"
                            placeholder="Sua senha secreta"
                            required
                        />
                        <button 
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="pr-4 text-[#9798E4] hover:text-[#4649CF] transition-colors focus:outline-none"
                        >
                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                    </div>
                    <div className="flex justify-end">
                        <a href="#" className="text-[10px] lg:text-xs font-bold text-[#6E71DA] hover:text-[#EC1B23] transition-colors">Esqueceu a senha?</a>
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="p-3 bg-[#FEEFEF] border-l-4 border-[#EC1B23] rounded-r text-[#EC1B23] text-xs lg:text-sm font-bold flex items-center gap-2 animate-in slide-in-from-top-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#EC1B23] shrink-0"></div>
                        {error}
                    </div>
                )}

                {/* Submit Button */}
                <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full group relative bg-gradient-to-r from-[#2E31B4] to-[#4649CF] hover:from-[#C41017] hover:to-[#EC1B23] text-white font-bold py-3.5 rounded-xl shadow-lg shadow-[#4649CF]/30 hover:shadow-[#EC1B23]/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-500 disabled:opacity-70 disabled:cursor-not-allowed overflow-hidden mt-4"
                >
                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500 rounded-xl"></div>
                    <div className="relative flex items-center justify-center gap-2">
                        {loading ? (
                            <>
                                <Loader2 size={20} className="animate-spin" />
                                <span>Acessando...</span>
                            </>
                        ) : (
                            <>
                                <span>Entrar no Sistema</span>
                                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </div>
                </button>
            </form>
        </div>

        {/* Mobile Pillars (Visible only on mobile inside the overlay container) */}
        <div className="lg:hidden mt-8 grid grid-cols-4 gap-2 w-full max-w-sm">
             {[
                { label: 'RÁPIDO', icon: Zap },
                { label: 'QUALIDADE', icon: PackageCheck },
                { label: 'SEGURO', icon: ShieldCheck },
                { label: 'SOLUÇÃO', icon: Lightbulb }
            ].map((item) => (
                <div key={item.label} className="flex flex-col items-center justify-center p-2 bg-black/40 backdrop-blur-sm rounded-lg border border-white/10">
                    <item.icon className="text-[#EC1B23] mb-1" size={16} />
                    <span className="text-[8px] font-bold text-gray-200">{item.label}</span>
                </div>
            ))}
        </div>

        {/* Footer */}
        <div className="absolute bottom-4 lg:bottom-6 w-full text-center px-6 z-30">
            <h3 className="text-white lg:text-[#0F103A] font-bold text-xs lg:text-sm mb-1 drop-shadow-md lg:drop-shadow-none">Gestão Inteligente de Pendências</h3>
            <p className="text-gray-300 lg:text-[#9798E4] text-[10px] lg:text-xs">© 2026 São Luiz Express. Todos os direitos reservados.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;