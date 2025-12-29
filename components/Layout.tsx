import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { Link, useLocation } from 'react-router-dom';
import { DetailModal } from '../pages/Pendencias';
import { postDataToScript } from '../services/api';

interface NotificationItem {
    id: string;
    type: 'BUSCA' | 'CRITICO' | 'VENCE_AMANHA' | 'MSG';
    date: string | null;
    text: string;
    cteId: string;
    sortDate: number;
    colorClass: string;
    icon: string;
}

export const Layout = ({ children }: React.PropsWithChildren) => {
  const { currentUser, logout, alertActive, dismissAlert, openAlertCTE, alertCteId, ctes, notes, selectedCteId, setSelectedCteId } = useApp();
  const { toasts, removeToast } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  
  // New Notification Toast State
  const [latestNotification, setLatestNotification] = useState<NotificationItem | null>(null);
  const [showToast, setShowToast] = useState(false);
  const prevNotifCountRef = useRef(0);

  // Persistent Read Notifications State
  // We use state to hold the list, but we load it via useEffect to ensure it updates when user changes (login/logout)
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);

  // Load read notifications when currentUser changes
  useEffect(() => {
    if (currentUser) {
        const storageKey = `read_notifications_${currentUser.username}`;
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
            setReadNotificationIds(saved);
        } catch {
            setReadNotificationIds([]);
        }
    } else {
        setReadNotificationIds([]);
    }
  }, [currentUser?.username]);

  // Save read notifications whenever they change
  useEffect(() => {
    if (currentUser && readNotificationIds.length > 0) {
        const storageKey = `read_notifications_${currentUser.username}`;
        localStorage.setItem(storageKey, JSON.stringify(readNotificationIds));
    }
  }, [readNotificationIds, currentUser]);

  const notifRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  if (!currentUser) return <>{children}</>;

  const isAdmin = currentUser.role.toLowerCase() === 'admin';

  const alertCte = alertCteId ? ctes.find(c => c.id === alertCteId) : null;
  const selectedCte = selectedCteId ? ctes.find(c => c.id === selectedCteId) : null;

  // Calculate Badges Counts (UPDATED LOGIC: Strict Destination Check & Separation of Critical)
  const badgeCounts = useMemo(() => {
    let pendencias = 0;
    let criticos = 0;
    let emBusca = 0;
    
    ctes.forEach(c => {
       // Em Busca logic remains broad (Global issue)
       if (c.status === 'EM BUSCA' || c.justificativa?.toUpperCase().includes('BUSCA')) {
           emBusca++;
       }

       // Strict Destination Logic for Badges
       // Only count for badge if I am Admin OR I am the Destination Unit
       let countsForBadge = false;

       if (isAdmin) {
           countsForBadge = true;
       } else {
           // Must be explicitly linked to the destination unit to count in the badge
           if (currentUser.linkedDestUnit && c.entrega.includes(currentUser.linkedDestUnit)) {
               countsForBadge = true;
           }
       }

       if (countsForBadge) {
           // Critical items for this unit
           if (c.computedStatus === 'CRITICO') {
               criticos++;
           } else {
               // Only count as 'Pendência' if NOT Critical (to avoid duplication)
               pendencias++;
           }
       }
    });

    return { pendencias, criticos, emBusca };
  }, [ctes, currentUser, isAdmin]);

  // Close notifications when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Generate Notifications List
  const notifications = useMemo(() => {
    const list: NotificationItem[] = [];
    const now = new Date().getTime();

    ctes.forEach(c => {
        // Notification Logic: Show relevant items
        // We usually show notifications for both Origin and Dest to keep user informed,
        // even if the Badge count is strict.
        const isRelevant = isAdmin || 
                           (currentUser.linkedDestUnit && c.entrega.includes(currentUser.linkedDestUnit)) ||
                           (currentUser.linkedOriginUnit && c.coleta.includes(currentUser.linkedOriginUnit));

        if (!isRelevant && c.status !== 'EM BUSCA') return;

        if (c.status === 'EM BUSCA' || c.justificativa?.toUpperCase().includes('BUSCA')) {
            list.push({ 
                id: `BUSCA-${c.id}`,
                type: 'BUSCA', 
                date: null, 
                text: `CTE ${c.cte} está em busca/perdido.`, 
                cteId: c.id, 
                sortDate: now + 1000,
                colorClass: 'bg-purple-100 text-purple-700',
                icon: 'ph-binoculars'
            });
        } 
        else if (c.computedStatus === 'CRITICO') {
            list.push({ 
                id: `CRITICO-${c.id}`,
                type: 'CRITICO', 
                date: null, 
                text: `CTE ${c.cte} com prazo estourado (Crítico).`, 
                cteId: c.id, 
                sortDate: now,
                colorClass: 'bg-red-100 text-red-600',
                icon: 'ph-siren'
            });
        }
        else if (c.computedStatus === 'VENCE_AMANHA') {
             list.push({ 
                id: `VENCE-${c.id}`,
                type: 'VENCE_AMANHA', 
                date: null, 
                text: `CTE ${c.cte} vence amanhã.`, 
                cteId: c.id, 
                sortDate: now - 500,
                colorClass: 'bg-yellow-100 text-yellow-700',
                icon: 'ph-hourglass'
            });
        }
    });

    const recentNotes = [...notes].reverse().slice(0, 15);
    recentNotes.forEach(n => {
        const relevantCte = ctes.find(c => c.id === n.cteId);
        let isOriginMsg = false;
        
        // Only show messages if relevant to user
        if (relevantCte) {
            const isUserInvolved = isAdmin || 
                (currentUser.linkedDestUnit && relevantCte.entrega.includes(currentUser.linkedDestUnit)) ||
                (currentUser.linkedOriginUnit && relevantCte.coleta.includes(currentUser.linkedOriginUnit));
            
            if (!isUserInvolved) return;

            if (currentUser.linkedOriginUnit && relevantCte.coleta.includes(currentUser.linkedOriginUnit)) {
                isOriginMsg = true;
            }

            list.push({ 
                id: `MSG-${n.id}`,
                type: 'MSG', 
                date: n.date, 
                text: `${n.user}: ${n.text.substring(0, 40)}${n.text.length > 40 ? '...' : ''}`, 
                cteId: n.cteId,
                sortDate: 0,
                colorClass: isOriginMsg ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-blue-50 text-blue-600',
                icon: 'ph-chat-circle-text'
            });
        }
    });

    return list.sort((a, b) => {
        const priority = { 'BUSCA': 4, 'CRITICO': 3, 'VENCE_AMANHA': 2, 'MSG': 1 };
        if (priority[a.type] !== priority[b.type]) {
            return priority[b.type] - priority[a.type];
        }
        return b.sortDate - a.sortDate;
    }).slice(0, 20);
  }, [ctes, notes, currentUser, isAdmin]);

  // Effect to detect NEW notifications
  useEffect(() => {
    if (notifications.length > prevNotifCountRef.current && prevNotifCountRef.current > 0) {
        const newest = notifications.find(n => !readNotificationIds.includes(n.id));
        if (newest) {
            setLatestNotification(newest);
            setShowToast(true);
            const timer = setTimeout(() => setShowToast(false), 5000);
            return () => clearTimeout(timer);
        }
    }
    prevNotifCountRef.current = notifications.length;
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

  const markAllAsRead = () => {
      const allIds = notifications.map(n => n.id);
      const uniqueIds = Array.from(new Set([...readNotificationIds, ...allIds]));
      setReadNotificationIds(uniqueIds);
  };

  // Modern Icons for Menu
  const menuItems = [
    { icon: 'ph-squares-four', label: 'Visão Geral', path: '/', count: 0 },
    { icon: 'ph-package', label: 'Pendências', path: '/pendencias', count: badgeCounts.pendencias, badgeColor: 'bg-indigo-100 text-indigo-700' },
    { icon: 'ph-siren', label: 'Críticos', path: '/criticos', count: badgeCounts.criticos, badgeColor: 'bg-red-100 text-red-600' },
    { icon: 'ph-binoculars', label: 'Em Busca', path: '/em-busca', count: badgeCounts.emBusca, badgeColor: 'bg-yellow-100 text-yellow-700' },
    ...(currentUser.role.toLowerCase() === 'admin' ? [{ icon: 'ph-sliders', label: 'Configurações', path: '/config', count: 0 }] : []),
  ];

  return (
    <div className="flex h-screen bg-background text-primary overflow-hidden font-sans relative">
      
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-[10000] flex flex-col gap-2">
        {toasts.map(toast => (
          <div 
            key={toast.id}
            className={`min-w-[300px] p-4 rounded-xl shadow-xl flex items-center justify-between animate-slide-in-right ${
              toast.type === 'success' ? 'bg-white border-l-4 border-green-500 text-green-800' :
              toast.type === 'error' ? 'bg-white border-l-4 border-red-500 text-red-800' :
              toast.type === 'warning' ? 'bg-white border-l-4 border-yellow-500 text-yellow-800' :
              'bg-white border-l-4 border-blue-500 text-blue-800'
            }`}
          >
             <div className="flex items-center gap-3">
               <i className={`text-xl ph-fill ${
                  toast.type === 'success' ? 'ph-check-circle' :
                  toast.type === 'error' ? 'ph-x-circle' :
                  toast.type === 'warning' ? 'ph-warning' : 'ph-info'
               }`}></i>
               <span className="font-bold text-sm">{toast.message}</span>
             </div>
             <button onClick={() => removeToast(toast.id)} className="opacity-50 hover:opacity-100">
               <i className="ph-bold ph-x"></i>
             </button>
          </div>
        ))}
      </div>

      {/* Real-time Notification Toast */}
      {showToast && latestNotification && (
          <div className="fixed top-24 right-6 z-[9999] animate-slide-in-right cursor-pointer" onClick={() => handleNotificationClick(latestNotification.cteId, latestNotification.id)}>
              <div className="bg-white rounded-xl shadow-2xl border border-gray-100 p-4 max-w-sm flex items-start gap-3 ring-1 ring-black/5">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${latestNotification.colorClass}`}>
                      <i className={`ph-fill ${latestNotification.icon} text-xl`}></i>
                  </div>
                  <div className="flex-1">
                      <p className="text-xs font-bold text-gray-400 uppercase mb-0.5">Nova Notificação</p>
                      <p className="text-sm font-semibold text-gray-800 leading-tight">{latestNotification.text}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setShowToast(false); }} className="text-gray-400 hover:text-gray-600">
                      <i className="ph-bold ph-x"></i>
                  </button>
              </div>
          </div>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} username={currentUser.username} />
      )}

      {/* Global CTE Detail Modal */}
      {selectedCte && (
        <DetailModal cte={selectedCte} onClose={() => setSelectedCteId(null)} />
      )}

      {/* Search Alert Modal */}
      {alertActive && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-red-900/90 backdrop-blur-sm animate-pulse">
          <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-lg text-center border-4 border-red-600 animate-bounce-in">
             <i className="ph-fill ph-siren text-6xl text-red-600 mb-4 animate-bounce"></i>
             <h2 className="text-3xl font-bold text-red-800 mb-2">ALERTA: EM BUSCA</h2>
             <p className="text-gray-600 mb-4 font-medium">Uma mercadoria foi marcada como perdida/em busca e requer sua atenção imediata (Nota obrigatória).</p>
             
             {alertCte ? (
                 <div className="bg-red-50 p-4 rounded-xl border border-red-100 mb-6 text-left">
                    <p className="text-sm font-bold text-red-900">CTE: {alertCte.cte}</p>
                    <p className="text-xs text-red-700">Origem: {alertCte.coleta} &rarr; Destino: {alertCte.entrega}</p>
                    <p className="text-xs text-red-700 mt-1">Destinatário: {alertCte.destinatario}</p>
                 </div>
             ) : (
                 <p className="text-sm text-red-500 mb-6">CTE ID: {alertCteId}</p>
             )}

             <div className="flex gap-3 justify-center">
                <button 
                onClick={dismissAlert}
                className="border border-red-200 text-red-800 hover:bg-red-50 font-bold py-3 px-6 rounded-xl transition"
                >
                Fechar Alerta
                </button>
                <button 
                onClick={openAlertCTE}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg transition transform hover:scale-105 flex items-center gap-2"
                >
                <i className="ph-bold ph-eye"></i> Resolver
                </button>
             </div>
          </div>
        </div>
      )}

      {/* Sidebar - Desktop */}
      <aside className={`hidden md:flex flex-col w-64 glass-panel m-4 rounded-2xl transition-all duration-300 border border-white/50`}>
        <div className="p-6 border-b border-gray-100">
           <h1 className="text-xl font-bold text-primary tracking-tight flex items-center gap-2">
             <i className="ph-fill ph-cube text-secondary text-2xl"></i>
             <div className="flex flex-col">
                <span>São Luiz <span className="text-secondary">Express</span></span>
                <span className="text-[10px] text-gray-400 font-normal">Logística & Pendências</span>
             </div>
           </h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
           {menuItems.map((item) => (
             <Link 
               key={item.path}
               to={item.path}
               className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group ${
                 location.pathname === item.path 
                 ? 'bg-primary text-white shadow-lg shadow-primary/30 font-semibold' 
                 : 'text-gray-500 hover:bg-white hover:text-primary hover:shadow-sm'
               }`}
             >
               <div className="flex items-center gap-3">
                 <i className={`ph ${item.icon} text-xl ${location.pathname === item.path ? 'ph-fill' : 'ph-light group-hover:ph-regular'}`}></i>
                 <span className="text-sm">{item.label}</span>
               </div>
               {item.count > 0 && (
                   <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.badgeColor || 'bg-gray-100 text-gray-600'}`}>
                       {item.count}
                   </span>
               )}
             </Link>
           ))}

           <div className="pt-4 mt-2 border-t border-gray-100">
             <button 
                onClick={() => setShowPasswordModal(true)}
                className="flex w-full items-center gap-3 px-4 py-3 rounded-xl transition-colors text-gray-500 hover:bg-white hover:text-primary text-sm font-medium hover:shadow-sm"
              >
                <i className="ph-light ph-lock-key text-xl"></i>
                <span>Mudar Senha</span>
              </button>
           </div>
        </nav>
        <div className="p-4">
          <button onClick={logout} className="flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 rounded-xl w-full transition text-sm font-bold">
            <i className="ph-bold ph-sign-out text-xl"></i>
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)}></div>
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white transform transition-transform duration-300 md:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} shadow-2xl`}>
         <div className="p-6 border-b border-gray-100">
            <h1 className="text-xl font-bold text-primary flex items-center gap-2">
                <i className="ph-fill ph-cube text-secondary"></i>
                Menu
            </h1>
         </div>
         <nav className="p-4 space-y-2">
           {menuItems.map((item) => (
             <Link 
               key={item.path}
               to={item.path}
               onClick={() => setSidebarOpen(false)}
               className={`flex items-center justify-between px-4 py-3 rounded-lg ${
                  location.pathname === item.path ? 'bg-primary text-white' : 'hover:bg-gray-50 text-gray-600'
               }`}
             >
               <div className="flex items-center gap-3">
                  <i className={`ph ${item.icon} text-xl`}></i>
                  {item.label}
               </div>
               {item.count > 0 && (
                   <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.badgeColor || 'bg-gray-100'}`}>
                       {item.count}
                   </span>
               )}
             </Link>
           ))}
           <button onClick={() => { setShowPasswordModal(true); setSidebarOpen(false); }} className="flex items-center gap-3 px-4 py-3 text-gray-600 w-full hover:bg-gray-50 rounded-lg">
             <i className="ph ph-lock-key text-xl"></i> Mudar Senha
           </button>
           <button onClick={logout} className="flex items-center gap-3 px-4 py-3 text-red-500 mt-4 font-bold">
             <i className="ph ph-sign-out text-xl"></i> Sair
           </button>
         </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[#F8F9FC]">
        {/* Header */}
        <header className="h-20 flex items-center justify-between px-6 md:px-10 pt-6 pb-4 shrink-0 z-30">
           <div className="flex items-center gap-4">
             <button onClick={() => setSidebarOpen(true)} className="md:hidden text-primary text-2xl">
               <i className="ph ph-list"></i>
             </button>
             <h2 className="text-2xl font-bold text-gray-800 hidden md:block tracking-tight">
               {menuItems.find(i => i.path === location.pathname)?.label || 'Bem-vindo'}
             </h2>
           </div>
           
           <div className="flex items-center gap-6">
             {/* Notification Bell */}
             <div className="relative cursor-pointer group" ref={notifRef}>
               <div 
                 className={`p-2 rounded-full transition ${isNotifOpen ? 'bg-indigo-50 text-secondary' : 'hover:bg-white hover:shadow-sm text-gray-600'}`}
                 onClick={() => setIsNotifOpen(!isNotifOpen)}
               >
                 <i className={`text-2xl ${isNotifOpen ? 'ph-fill ph-bell' : 'ph-light ph-bell'}`}></i>
               </div>
               
               {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#F8F9FC]"></span>
               )}

               {/* Notifications Dropdown */}
               {isNotifOpen && (
                 <div className="absolute right-0 top-12 w-80 md:w-96 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-fade-in origin-top-right z-50">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                        <div className="flex items-center gap-2">
                           <h3 className="font-bold text-gray-800">Notificações</h3>
                           {unreadCount > 0 && <span className="text-xs font-bold bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">{unreadCount}</span>}
                        </div>
                        {unreadCount > 0 && (
                           <button 
                             onClick={markAllAsRead}
                             className="text-[10px] font-bold text-primary hover:text-secondary hover:underline transition"
                           >
                             Marcar todas como lidas
                           </button>
                        )}
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 flex flex-col items-center">
                                <i className="ph-duotone ph-bell-slash text-3xl mb-2 opacity-50"></i>
                                <p className="text-sm">Nenhuma notificação recente.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {notifications.map((item, idx) => {
                                    const isRead = readNotificationIds.includes(item.id);
                                    return (
                                        <div 
                                            key={idx} 
                                            onClick={() => handleNotificationClick(item.cteId, item.id)}
                                            className={`p-4 hover:bg-indigo-50/30 transition cursor-pointer flex gap-3 group ${isRead ? 'opacity-60 bg-white' : 'bg-blue-50/30'}`}
                                        >
                                            <div className={`mt-1 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${item.colorClass}`}>
                                                <i className={`text-sm ph-fill ${item.icon}`}></i>
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-start">
                                                    <p className={`text-sm font-medium leading-snug group-hover:text-primary transition ${isRead ? 'text-gray-600' : 'text-gray-900'}`}>{item.text}</p>
                                                    {!isRead && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-1.5 ml-2"></span>}
                                                </div>
                                                <div className="flex justify-between items-center mt-1">
                                                    <span className="text-[10px] text-gray-400 font-bold bg-gray-100 px-1.5 rounded">{item.type.replace('_', ' ')}</span>
                                                    {item.date && <span className="text-[10px] text-gray-400">{item.date}</span>}
                                                </div>
                                            </div>
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
               <div className="text-right hidden md:block">
                  <p className="text-sm font-bold text-gray-800 leading-tight">{currentUser.username}</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">{currentUser.role}</p>
               </div>
               <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-primary flex items-center justify-center text-white font-bold text-lg shadow-md ring-2 ring-white">
                 {currentUser.username.charAt(0).toUpperCase()}
               </div>
             </div>
           </div>
        </header>

        {/* Scrollable Page Content */}
        <div className="flex-1 overflow-auto p-4 md:px-10 md:pb-10">
           {children}
        </div>
      </main>
    </div>
  );
};

const ChangePasswordModal = ({ onClose, username }: { onClose: () => void, username: string }) => {
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const { addToast } = useToast();
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (newPass !== confirmPass) {
      addToast('Senhas não conferem.', 'error');
      return;
    }
    setIsLoading(true);
    const success = await postDataToScript('changePassword', { 
        username, 
        newPass,
        password: newPass,
        newPassword: newPass,
        sheet: 'USERS'
    });
    
    if (success) {
      addToast('Senha alterada com sucesso!', 'success');
      setTimeout(onClose, 1500);
    } else {
      addToast('Erro ao alterar senha. Tente novamente.', 'error');
    }
    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        handleSave();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-scale-in">
        <h3 className="text-xl font-bold text-primary mb-4">Alterar Senha</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Nova Senha</label>
            <div className="relative mt-1">
                <input 
                type={showPass ? 'text' : 'password'}
                className="w-full px-4 py-2 border rounded-lg bg-white text-gray-900 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none pr-10"
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                onKeyDown={handleKeyDown}
                />
                <button 
                  type="button" 
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                    <i className={showPass ? "ph-bold ph-eye-slash" : "ph-bold ph-eye"}></i>
                </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Confirmar Senha</label>
            <div className="relative mt-1">
                <input 
                type={showPass ? 'text' : 'password'}
                className="w-full px-4 py-2 border rounded-lg bg-white text-gray-900 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none pr-10"
                value={confirmPass}
                onChange={e => setConfirmPass(e.target.value)}
                onKeyDown={handleKeyDown}
                />
            </div>
          </div>
        </div>
        
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium">Cancelar</button>
          <button onClick={handleSave} disabled={isLoading} className="flex-1 py-2 rounded-lg bg-primary text-white hover:bg-accent font-medium shadow-lg shadow-primary/20">{isLoading ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
};