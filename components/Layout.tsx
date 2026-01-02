
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { Link, useLocation } from 'react-router-dom';
import { DetailModal } from '../pages/Pendencias';
import { postDataToScript } from '../services/api';
import { parseDateTime } from '../utils';

interface NotificationItem {
    id: string;
    type: 'BUSCA' | 'CRITICO' | 'VENCE_AMANHA' | 'MSG';
    date: string | null;
    text: string;
    cteId: string;
    sortDate: number;
    colorClass: string;
    icon: string;
    isSearch?: boolean;
    sender?: string;
    isExternal?: boolean;
}

export const Layout = ({ children }: React.PropsWithChildren) => {
  const { currentUser, logout, alertActive, dismissAlert, openAlertCTE, alertCteId, ctes, notes, selectedCteId, setSelectedCteId } = useApp();
  const { toasts, removeToast } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  
  const [latestNotification, setLatestNotification] = useState<NotificationItem | null>(null);
  const [showToast, setShowToast] = useState(false);
  const prevIdsRef = useRef<Set<string>>(new Set());

  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);

  useEffect(() => {
    if (currentUser) {
        const storageKey = `read_notifications_${currentUser.username}`;
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
            setReadNotificationIds(saved);
        } catch {
            setReadNotificationIds([]);
        }
    }
  }, [currentUser?.username]);

  useEffect(() => {
    if (currentUser) {
        const storageKey = `read_notifications_${currentUser.username}`;
        localStorage.setItem(storageKey, JSON.stringify(readNotificationIds));
    }
  }, [readNotificationIds, currentUser]);

  const notifRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  if (!currentUser) return <>{children}</>;

  const role = currentUser.role.toLowerCase();
  const isAdmin = role === 'admin';
  const isGlobalUser = isAdmin || role === 'leitor' || (!currentUser.linkedOriginUnit && !currentUser.linkedDestUnit);

  const alertCte = alertCteId ? ctes.find(c => c.id === alertCteId) : null;
  const selectedCte = selectedCteId ? ctes.find(c => c.id === selectedCteId) : null;

  const badgeCounts = useMemo(() => {
    let pendencias = 0;
    let criticos = 0;
    let emBusca = 0;
    
    ctes.forEach(c => {
       if (c.status === 'EM BUSCA') emBusca++;
       let countsForBadge = isGlobalUser || (currentUser.linkedDestUnit && c.entrega.includes(currentUser.linkedDestUnit));
       if (countsForBadge) {
           if (c.computedStatus === 'CRITICO') criticos++;
           else if (c.computedStatus !== 'NO_PRAZO') pendencias++;
       }
    });
    return { pendencias, criticos, emBusca };
  }, [ctes, currentUser, isGlobalUser]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) setIsNotifOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const notifications = useMemo(() => {
    const list: NotificationItem[] = [];
    const now = new Date().getTime();

    ctes.forEach(c => {
        const isRelevant = isGlobalUser || 
                           (currentUser.linkedDestUnit && c.entrega.includes(currentUser.linkedDestUnit)) ||
                           (currentUser.linkedOriginUnit && c.coleta.includes(currentUser.linkedOriginUnit));

        if (!isRelevant && c.status !== 'EM BUSCA') return;

        if (c.status === 'EM BUSCA') {
            list.push({ 
                id: `BUSCA-${c.id}`,
                type: 'BUSCA', 
                date: null, 
                text: `EM BUSCA: CTE ${c.cte} série ${c.serie}`, 
                cteId: c.id, 
                sortDate: now + 5000,
                colorClass: 'bg-purple-600 text-white shadow-purple-200',
                icon: 'ph-binoculars',
                isSearch: true
            });
        } 
        else if (c.computedStatus === 'CRITICO') {
            list.push({ 
                id: `CRITICO-${c.id}`,
                type: 'CRITICO', 
                date: null, 
                text: `CTE ${c.cte} com prazo estourado (Crítico).`, 
                cteId: c.id, 
                sortDate: now + 1000,
                colorClass: 'bg-red-600 text-white shadow-red-200',
                icon: 'ph-siren'
            });
        }
    });

    // Fix: Removed incorrect recentNotes and fix comment, sortedNotes is already correctly defined.
    const sortedNotes = [...notes].sort((a, b) => parseDateTime(b.date) - parseDateTime(a.date)).slice(0, 30);
    sortedNotes.forEach(n => {
        const relevantCte = ctes.find(c => c.id === n.cteId);
        if (relevantCte) {
            const isUserInvolved = isGlobalUser || 
                (currentUser.linkedDestUnit && relevantCte.entrega.includes(currentUser.linkedDestUnit)) ||
                (currentUser.linkedOriginUnit && relevantCte.coleta.includes(currentUser.linkedOriginUnit));
            
            if (!isUserInvolved) return;

            const isMe = n.user === currentUser.username;
            const isNoteSearch = n.statusBusca || n.text.toUpperCase().includes('BUSCA') || n.text.toUpperCase().includes('LOCALIZADA');
            
            const statusColor = isMe ? 'bg-primary' : 'bg-red-600';

            list.push({ 
                id: `MSG-${n.id}`,
                type: 'MSG', 
                date: n.date, 
                text: `${n.user}: ${n.text.substring(0, 40)}${n.text.length > 40 ? '...' : ''} (CTE ${relevantCte.cte})`, 
                cteId: n.cteId,
                sortDate: parseDateTime(n.date),
                colorClass: `${statusColor} text-white shadow-lg`,
                icon: isNoteSearch ? 'ph-binoculars' : 'ph-chat-circle-dots',
                sender: n.user,
                isExternal: !isMe
            });
        }
    });

    const uniqueList = Array.from(new Map(list.map(item => [item.id, item])).values());
    return uniqueList.sort((a, b) => b.sortDate - a.sortDate).slice(0, 40);
  }, [ctes, notes, currentUser, isGlobalUser]);

  useEffect(() => {
    const currentIds = new Set(notifications.map(n => n.id));
    if (prevIdsRef.current.size > 0) {
        const newNotifs = notifications.filter(n => !prevIdsRef.current.has(n.id) && !readNotificationIds.includes(n.id));
        if (newNotifs.length > 0) {
            const newest = newNotifs[0];
            setLatestNotification(newest);
            setShowToast(true);
            const timer = setTimeout(() => setShowToast(false), 8000);
            return () => clearTimeout(timer);
        }
    }
    prevIdsRef.current = currentIds;
  }, [notifications, readNotificationIds]);

  const unreadCount = notifications.filter(n => !readNotificationIds.includes(n.id)).length;

  const handleNotificationClick = (cteId: string, notifId: string) => {
      if (!readNotificationIds.includes(notifId)) {
        setReadNotificationIds(prev => [...prev, notifId]);
      }
      setSelectedCteId(cteId);
      setIsNotifOpen(false);
      setShowToast(false);
  };

  const menuItems = [
    { icon: 'ph-squares-four', label: 'Visão Geral', path: '/', count: 0 },
    { icon: 'ph-package', label: 'Pendências', path: '/pendencias', count: badgeCounts.pendencias, badgeColor: 'bg-indigo-100 text-indigo-700' },
    { icon: 'ph-siren', label: 'Críticos', path: '/criticos', count: badgeCounts.criticos, badgeColor: 'bg-red-100 text-red-600' },
    { icon: 'ph-binoculars', label: 'Em Busca', path: '/em-busca', count: badgeCounts.emBusca, badgeColor: 'bg-yellow-100 text-yellow-700' },
    ...(isAdmin ? [{ icon: 'ph-sliders', label: 'Configurações', path: '/config', count: 0 }] : []),
  ];

  return (
    <div className="flex h-screen bg-background text-primary overflow-hidden font-sans relative">
      <div className="fixed top-4 right-4 z-[10000] flex flex-col gap-2">
        {toasts.map(toast => (
          <div key={toast.id} className={`min-w-[300px] p-4 rounded-xl shadow-xl flex items-center justify-between animate-slide-in-right bg-white border-l-4 ${toast.type === 'success' ? 'border-green-500 text-green-800' : toast.type === 'error' ? 'border-red-500 text-red-800' : 'border-blue-500 text-blue-800'}`}>
             <div className="flex items-center gap-3">
               <i className={`text-xl ph-fill ${toast.type === 'success' ? 'ph-check-circle' : toast.type === 'error' ? 'ph-x-circle' : 'ph-info'}`}></i>
               <span className="font-bold text-sm">{toast.message}</span>
             </div>
             <button onClick={() => removeToast(toast.id)} className="opacity-50 hover:opacity-100"><i className="ph-bold ph-x"></i></button>
          </div>
        ))}
      </div>

      {showToast && latestNotification && (
          <div className="fixed top-20 right-6 z-[9999] animate-slide-in-right cursor-pointer group" onClick={() => handleNotificationClick(latestNotification.cteId, latestNotification.id)}>
              <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 max-w-sm flex items-start gap-4 ring-2 ring-primary/5 hover:scale-[1.02] transition">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-lg ${latestNotification.colorClass}`}>
                      <i className={`ph-fill ${latestNotification.icon} text-2xl`}></i>
                  </div>
                  <div className="flex-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1 tracking-widest">
                        {latestNotification.isExternal ? 'Nova Resposta!' : 'Atenção!'}
                      </p>
                      <p className="text-sm font-bold text-gray-800 leading-tight">{latestNotification.text}</p>
                      <p className="text-[10px] text-primary mt-2 font-bold underline">Toque para ver detalhes</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setShowToast(false); }} className="text-gray-300 hover:text-red-500"><i className="ph-bold ph-x"></i></button>
              </div>
          </div>
      )}

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} username={currentUser.username} />}
      {selectedCte && <DetailModal cte={selectedCte} onClose={() => setSelectedCteId(null)} />}

      {alertActive && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-red-900/95 backdrop-blur-md animate-fade-in">
          <div className="bg-white p-10 rounded-3xl shadow-2xl max-w-lg text-center border-t-8 border-red-600 animate-bounce-in relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-1 bg-red-600 animate-pulse"></div>
             <i className="ph-fill ph-siren text-7xl text-red-600 mb-6 animate-shake"></i>
             <h2 className="text-4xl font-black text-red-800 mb-4 tracking-tighter uppercase italic">Em Busca!</h2>
             <p className="text-gray-700 mb-8 font-semibold leading-relaxed">ALERTA CRÍTICO: Uma mercadoria foi marcada como pendência de busca.</p>
             
             {alertCte && (
                 <div className="bg-red-50 p-6 rounded-2xl border border-red-200 mb-8 text-left shadow-inner">
                    <p className="text-lg font-black text-red-900 mb-1">CTE: {alertCte.cte}</p>
                    <p className="text-sm text-red-700 font-bold">{alertCte.coleta} &rarr; {alertCte.entrega}</p>
                 </div>
             )}

             <div className="flex gap-4 justify-center">
                <button onClick={dismissAlert} className="flex-1 py-4 px-6 rounded-2xl border-2 border-red-100 text-red-800 font-black hover:bg-red-50 transition">IGNORAR</button>
                <button onClick={openAlertCTE} className="flex-[2] bg-red-600 hover:bg-red-700 text-white font-black py-4 px-8 rounded-2xl shadow-xl transition transform hover:scale-105 flex items-center justify-center gap-3"><i className="ph-bold ph-magnifying-glass-plus"></i> VER DETALHES</button>
             </div>
          </div>
        </div>
      )}

      <aside className={`hidden md:flex flex-col w-64 glass-panel m-4 rounded-2xl border border-white/50`}>
        <div className="p-6 border-b border-gray-100">
           <h1 className="text-xl font-bold text-primary tracking-tight flex items-center gap-2">
             <i className="ph-fill ph-cube text-secondary text-2xl"></i>
             <div className="flex flex-col"><span>São Luiz <span className="text-secondary">Express</span></span><span className="text-[10px] text-gray-400 font-normal">Logística & Pendências</span></div>
           </h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
           {menuItems.map((item) => (
             <Link key={item.path} to={item.path} className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group ${location.pathname === item.path ? 'bg-primary text-white shadow-lg shadow-primary/30 font-semibold' : 'text-gray-500 hover:bg-white hover:text-primary hover:shadow-sm'}`}>
               <div className="flex items-center gap-3">
                 <i className={`ph ${item.icon} text-xl ${location.pathname === item.path ? 'ph-fill' : 'ph-light group-hover:ph-regular'}`}></i>
                 <span className="text-sm">{item.label}</span>
               </div>
               {item.count > 0 && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.badgeColor || 'bg-gray-100 text-gray-600'}`}>{item.count}</span>}
             </Link>
           ))}
           <div className="pt-4 mt-2 border-t border-gray-100">
             <button onClick={() => setShowPasswordModal(true)} className="flex w-full items-center gap-3 px-4 py-3 rounded-xl transition-colors text-gray-500 hover:bg-white hover:text-primary text-sm font-medium hover:shadow-sm">
                <i className="ph-light ph-lock-key text-xl"></i><span>Mudar Senha</span>
              </button>
           </div>
        </nav>
        <div className="p-4"><button onClick={logout} className="flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 rounded-xl w-full transition text-sm font-bold"><i className="ph-bold ph-sign-out text-xl"></i><span>Sair</span></button></div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)}></div>}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white transform transition-transform duration-300 md:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} shadow-2xl`}>
         <div className="p-6 border-b border-gray-100"><h1 className="text-xl font-bold text-primary flex items-center gap-2"><i className="ph-fill ph-cube text-secondary"></i>Menu</h1></div>
         <nav className="p-4 space-y-2">
           {menuItems.map((item) => (
             <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)} className={`flex items-center justify-between px-4 py-3 rounded-lg ${location.pathname === item.path ? 'bg-primary text-white' : 'hover:bg-gray-50 text-gray-600'}`}>
               <div className="flex items-center gap-3"><i className={`ph ${item.icon} text-xl`}></i>{item.label}</div>
               {item.count > 0 && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.badgeColor || 'bg-gray-100'}`}>{item.count}</span>}
             </Link>
           ))}
         </nav>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[#F8F9FC]">
        <header className="h-20 flex items-center justify-between px-6 md:px-10 pt-6 pb-4 shrink-0 z-30">
           <div className="flex items-center gap-4">
             <button onClick={() => setSidebarOpen(true)} className="md:hidden text-primary text-2xl"><i className="ph ph-list"></i></button>
             <h2 className="text-2xl font-bold text-gray-800 hidden md:block tracking-tight">{menuItems.find(i => i.path === location.pathname)?.label || 'Painel'}</h2>
           </div>
           
           <div className="flex items-center gap-6">
             <div className="relative cursor-pointer group" ref={notifRef}>
               <div className={`p-2 rounded-full transition-all duration-300 ${unreadCount > 0 ? 'bg-yellow-400 text-white shadow-[0_0_15px_rgba(250,204,21,0.5)]' : isNotifOpen ? 'bg-indigo-50 text-secondary' : 'hover:bg-white hover:shadow-sm text-gray-400'}`} onClick={() => setIsNotifOpen(!isNotifOpen)}>
                 <i className={`text-2xl ${unreadCount > 0 || isNotifOpen ? 'ph-fill ph-bell' : 'ph-light ph-bell'}`}></i>
                 {unreadCount > 0 && (
                   <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] bg-red-600 text-white text-[11px] font-black flex items-center justify-center rounded-full border-2 border-white shadow-xl animate-bounce">
                     {unreadCount}
                   </span>
                 )}
               </div>
               {isNotifOpen && (
                 <div className="absolute right-0 top-12 w-80 md:w-96 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-fade-in origin-top-right z-50">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                        <div className="flex items-center gap-2"><h3 className="font-bold text-gray-800">Notificações</h3><span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-black">{unreadCount} NOVAS</span></div>
                        {unreadCount > 0 && <button onClick={() => { const allIds = notifications.map(n => n.id); setReadNotificationIds(prev => Array.from(new Set([...prev, ...allIds]))); }} className="text-[10px] font-bold text-primary hover:underline">Limpar todas</button>}
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 flex flex-col items-center"><i className="ph-duotone ph-bell-slash text-3xl mb-2 opacity-50"></i><p className="text-sm">Tudo em dia.</p></div>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {notifications.map((item, idx) => {
                                    const isRead = readNotificationIds.includes(item.id);
                                    return (
                                        <div key={idx} onClick={() => handleNotificationClick(item.cteId, item.id)} className={`p-4 hover:bg-indigo-50/30 transition cursor-pointer flex gap-3 group ${isRead ? 'opacity-40 bg-white' : 'bg-blue-50/20'}`}>
                                            <div className={`mt-1 w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${item.colorClass}`}>
                                                <i className={`text-sm ph-fill ${item.icon}`}></i>
                                            </div>
                                            <div className="flex-1">
                                                <p className={`text-sm font-bold leading-tight ${isRead ? 'text-gray-500' : 'text-gray-900'}`}>{item.text}</p>
                                                <div className="flex justify-between items-center mt-1"><span className="text-[9px] font-black uppercase tracking-tighter text-gray-400">{item.type}</span>{item.date && <span className="text-[9px] text-gray-400 font-bold">{item.date}</span>}</div>
                                            </div>
                                            {!isRead && <div className="w-2 h-2 bg-red-500 rounded-full mt-2 shrink-0"></div>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                 </div>
               )}
             </div>
             
             <div className="flex items-center gap-3 pl-6 border-l border-gray-200">
               <div className="text-right hidden md:block"><p className="text-sm font-bold text-gray-800 leading-tight">{currentUser.username}</p><p className="text-[10px] text-gray-500 uppercase font-bold">{currentUser.linkedDestUnit || 'Painel Central'}</p></div>
               <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-primary flex items-center justify-center text-white font-bold text-lg shadow-md ring-2 ring-white">{currentUser.username.charAt(0).toUpperCase()}</div>
             </div>
           </div>
        </header>
        <div className="flex-1 overflow-auto p-4 md:px-10 md:pb-10">{children}</div>
      </main>
    </div>
  );
};

const ChangePasswordModal = ({ onClose, username }: { onClose: () => void, username: string }) => {
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const { addToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const handleSave = async () => {
    if (newPass !== confirmPass) return addToast('Senhas não conferem.', 'error');
    setIsLoading(true);
    const success = await postDataToScript('changePassword', { username, newPass, sheet: 'USERS' });
    if (success) { addToast('Senha alterada!', 'success'); onClose(); }
    else addToast('Erro!', 'error');
    setIsLoading(false);
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-sm p-6 animate-scale-in">
        <h3 className="text-xl font-bold text-primary mb-4">Mudar Senha</h3>
        <input type="password" placeholder="Nova Senha" className="w-full mb-3 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" value={newPass} onChange={e => setNewPass(e.target.value)} />
        <input type="password" placeholder="Confirmar Senha" className="w-full mb-6 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} />
        <div className="flex gap-3"><button onClick={onClose} className="flex-1 py-2 text-gray-600 font-medium hover:bg-gray-50 rounded-lg">Cancelar</button><button onClick={handleSave} className="flex-1 py-2 bg-primary text-white rounded-lg font-bold hover:bg-accent transition">Salvar</button></div>
      </div>
    </div>
  );
};
