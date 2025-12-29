import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { testConnection } from '../services/api';
import { User, Profile } from '../types';

// Defined system permissions
const SYSTEM_PERMISSIONS = [
  { id: 'VIEW_DASHBOARD', label: 'Ver Dashboard' },
  { id: 'VIEW_PENDENCIES', label: 'Ver Pendências' },
  { id: 'VIEW_CRITICOS', label: 'Ver Críticos' },
  { id: 'VIEW_SEARCH', label: 'Ver Em Busca' },
  { id: 'EDIT_NOTES', label: 'Criar/Editar Notas' },
  { id: 'MANAGE_SETTINGS', label: 'Gerenciar Configurações (Admin)' },
  { id: 'EXPORT_DATA', label: 'Exportar Relatórios' },
  { id: 'VIEW_FINANCIAL', label: 'Visualizar Valores (R$)' },
  { id: 'MANAGE_USERS', label: 'Gerenciar Usuários' }
];

export const Config = () => {
  const { users, profiles, currentUser, createUser, updateUser, deleteUser, createProfile, updateProfile, deleteProfile, refreshData } = useApp();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'users' | 'profiles' | 'system'>('users');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals State
  const [userModal, setUserModal] = useState<{open: boolean, mode: 'create'|'edit', data?: User}>({ open: false, mode: 'create' });
  const [profileModal, setProfileModal] = useState<{open: boolean, mode: 'create'|'edit', data?: Profile}>({ open: false, mode: 'create' });

  if (currentUser?.role.toLowerCase() !== 'admin') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400">
        <i className="ph-duotone ph-lock-key text-6xl mb-4 text-red-200"></i>
        <p className="text-lg font-medium text-gray-600">Acesso Restrito ao Administrador</p>
      </div>
    );
  }

  const handleTestConnection = async () => {
    setConnectionStatus('loading');
    const success = await testConnection();
    setTimeout(() => {
        setConnectionStatus(success ? 'success' : 'error');
        if (success) addToast('Conexão estabelecida com sucesso!', 'success');
        else addToast('Falha na conexão com a planilha.', 'error');
    }, 1000);
  };

  const parsePermissions = (jsonStr: string) => {
    try {
        if(jsonStr.startsWith('[')) return JSON.parse(jsonStr);
        return jsonStr.split(',').map(s => s.trim());
    } catch (e) {
        return [jsonStr];
    }
  };
  
  const handleDeleteUser = async (username: string) => {
      if(confirm(`Tem certeza que deseja excluir o usuário ${username}?`)) {
          const success = await deleteUser(username);
          if (success) addToast('Usuário excluído com sucesso!', 'success');
          else addToast('Erro ao excluir usuário.', 'error');
      }
  };

  const handleDeleteProfile = async (name: string) => {
      if(confirm(`Tem certeza que deseja excluir o perfil ${name}?`)) {
          const success = await deleteProfile(name);
          if (success) addToast('Perfil excluído com sucesso!', 'success');
          else addToast('Erro ao excluir perfil.', 'error');
      }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in max-w-6xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row md:justify-between md:items-end border-b border-gray-200 pb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie usuários, perfis e conexões do sistema.</p>
        </div>
        
        <div className="flex gap-4 md:gap-6 overflow-x-auto pb-1 md:pb-0 w-full md:w-auto no-scrollbar">
          <TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon="ph-users" label="Usuários" />
          <TabButton active={activeTab === 'profiles'} onClick={() => setActiveTab('profiles')} icon="ph-shield-check" label="Perfis" />
          <TabButton active={activeTab === 'system'} onClick={() => setActiveTab('system')} icon="ph-plugs" label="Sistema" />
        </div>
      </div>

      <div className="min-h-[500px]">
        {/* USERS TAB */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm gap-4">
              <div className="relative w-full sm:w-72">
                <i className="ph ph-magnifying-glass absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                <input 
                  type="text" 
                  placeholder="Buscar usuário..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:border-secondary transition" 
                />
              </div>
              <button 
                onClick={() => setUserModal({ open: true, mode: 'create' })}
                className="bg-primary text-white px-5 py-2.5 rounded-lg hover:bg-accent transition shadow-md shadow-primary/20 flex items-center justify-center gap-2 font-medium text-sm w-full sm:w-auto"
              >
                <i className="ph-bold ph-plus"></i> Novo Usuário
              </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm overflow-x-auto">
              <table className="w-full text-left min-w-[600px]">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-semibold">
                  <tr>
                    <th className="p-4 pl-6">Usuário</th>
                    <th className="p-4">Função (Role)</th>
                    <th className="p-4">Unidade Origem</th>
                    <th className="p-4">Unidade Destino</th>
                    <th className="p-4 text-right pr-6">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.filter(u => u.username.toLowerCase().includes(searchTerm.toLowerCase())).map((user, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/80 transition">
                      <td className="p-4 pl-6 font-medium text-gray-900">{user.username}</td>
                      <td className="p-4">
                        <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wide">
                          {user.role}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-600">{user.linkedOriginUnit || <span className="text-gray-300">-</span>}</td>
                      <td className="p-4 text-sm text-gray-600">{user.linkedDestUnit || <span className="text-gray-300">-</span>}</td>
                      <td className="p-4 text-right pr-6">
                         <div className="flex justify-end gap-2">
                           <button onClick={() => setUserModal({ open: true, mode: 'edit', data: user })} className="p-2 rounded-lg text-gray-400 hover:text-primary hover:bg-gray-100 transition"><i className="ph-fill ph-pencil-simple"></i></button>
                           <button onClick={() => handleDeleteUser(user.username)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"><i className="ph-fill ph-trash"></i></button>
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PROFILES TAB */}
        {activeTab === 'profiles' && (
          <div className="space-y-6">
             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <p className="text-sm text-gray-500">Defina os perfis de acesso e permissões.</p>
                <button 
                  onClick={() => setProfileModal({ open: true, mode: 'create' })}
                  className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-2 text-sm font-bold w-full sm:w-auto"
                >
                  <i className="ph-bold ph-plus"></i> Novo Perfil
                </button>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {profiles.map((profile, idx) => {
                  const perms = parsePermissions(profile.permissions);
                  return (
                    <div key={idx} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition group relative">
                       <div className="absolute top-4 right-4 flex gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition">
                           <button onClick={() => setProfileModal({ open: true, mode: 'edit', data: profile })} className="p-1.5 hover:bg-gray-100 rounded text-gray-500"><i className="ph-fill ph-pencil-simple"></i></button>
                           <button onClick={() => handleDeleteProfile(profile.name)} className="p-1.5 hover:bg-red-50 rounded text-red-500"><i className="ph-fill ph-trash"></i></button>
                       </div>
                       <div className="flex justify-between items-start mb-4">
                          <h3 className="font-bold text-lg text-gray-900">{profile.name}</h3>
                          <i className="ph-duotone ph-shield-check text-2xl text-gray-300"></i>
                       </div>
                       <p className="text-sm text-gray-500 mb-6 min-h-[40px] line-clamp-2">{profile.description}</p>
                       
                       <div className="space-y-2">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Permissões</p>
                          <div className="flex flex-wrap gap-2">
                            {Array.isArray(perms) && perms.map((p: string, i: number) => (
                                <span key={i} className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 text-gray-600 text-[10px] font-semibold px-2 py-1 rounded-md">
                                    <i className="ph-bold ph-check text-green-500"></i> {p.replace(/_/g, ' ')}
                                </span>
                            ))}
                          </div>
                       </div>
                    </div>
                  );
                })}
             </div>
          </div>
        )}

        {/* SYSTEM TAB */}
        {activeTab === 'system' && (
          <div className="space-y-6 max-w-3xl">
             {/* Same connection component as before */}
             <div className="bg-white p-4 sm:p-8 rounded-xl border border-gray-200 shadow-sm">
               <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><i className="ph-duotone ph-database text-2xl"></i></div>
                  <div><h3 className="font-bold text-lg text-gray-800">Status da Conexão</h3></div>
               </div>
               <div className="flex flex-col sm:flex-row items-center gap-4 bg-gray-50 p-6 rounded-xl border border-gray-100">
                  <button onClick={handleTestConnection} disabled={connectionStatus === 'loading'} className="w-full sm:w-auto bg-white border border-gray-200 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-100 transition font-bold shadow-sm flex gap-2 items-center justify-center">
                    {connectionStatus === 'loading' ? <i className="ph ph-spinner ph-spin"></i> : <i className="ph-bold ph-lightning"></i>} Testar
                  </button>
                  <div className="flex-1 w-full text-center sm:text-left pl-0 sm:pl-4 border-l-0 sm:border-l border-gray-200">
                    {connectionStatus === 'success' && <span className="text-green-600 font-medium">Conexão estável (200 OK)</span>}
                    {connectionStatus === 'error' && <span className="text-red-600 font-medium">Erro de conexão.</span>}
                  </div>
               </div>
            </div>
          </div>
        )}
      </div>

      {/* User Modal */}
      {userModal.open && (
        <UserModal 
            mode={userModal.mode} 
            initialData={userModal.data} 
            onClose={() => setUserModal({ open: false, mode: 'create' })} 
            onSave={async (u: User) => {
                let success = false;
                if (userModal.mode === 'create') success = await createUser(u);
                else if (userModal.data) success = await updateUser(userModal.data.username, u);
                
                if (success) addToast('Usuário salvo com sucesso!', 'success');
                else addToast('Erro ao salvar usuário.', 'error');
            }} 
        />
      )}

      {/* Profile Modal */}
      {profileModal.open && (
         <ProfileModal
            mode={profileModal.mode}
            initialData={profileModal.data}
            onClose={() => setProfileModal({ open: false, mode: 'create' })}
            onSave={async (p: Profile) => {
                let success = false;
                if (profileModal.mode === 'create') success = await createProfile(p);
                else if (profileModal.data) success = await updateProfile(profileModal.data.name, p);
                
                if (success) addToast('Perfil salvo com sucesso!', 'success');
                else addToast('Erro ao salvar perfil.', 'error');
            }}
         />
      )}
    </div>
  );
};

const TabButton = ({ active, onClick, icon, label }: any) => (
  <button onClick={onClick} className={`flex items-center gap-2 pb-2 text-sm font-bold transition border-b-2 whitespace-nowrap ${active ? 'text-primary border-primary' : 'text-gray-400 border-transparent hover:text-gray-600'}`}>
    <i className={`ph-bold ${icon} text-lg`}></i> {label}
  </button>
);

const UserModal = ({ mode, initialData, onClose, onSave }: any) => {
  const { profiles, origins, destinations } = useApp();
  // Default to first profile if available, else standard string
  const defaultRole = profiles.length > 0 ? profiles[0].name : 'operador';
  
  const [formData, setFormData] = useState<User>(initialData || { 
      username: '', 
      password: '', 
      role: defaultRole, 
      linkedOriginUnit: '', 
      linkedDestUnit: '' 
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await onSave(formData);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
       <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 sm:p-8 animate-scale-in max-h-[90vh] overflow-y-auto">
          <h3 className="text-xl font-bold text-gray-900 mb-6">{mode === 'create' ? 'Novo Usuário' : 'Editar Usuário'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Username</label><input required type="text" className="w-full border rounded-lg px-3 py-2" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} /></div>
               <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Senha</label><input required type="text" className="w-full border rounded-lg px-3 py-2" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} /></div>
             </div>
             <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Perfil (Role)</label>
                <select 
                    className="w-full border rounded-lg px-3 py-2 bg-white" 
                    value={formData.role} 
                    onChange={e => setFormData({...formData, role: e.target.value})}
                >
                  {profiles.map(p => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                  {profiles.length === 0 && <option value="operador">Operador (Padrão)</option>}
                </select>
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Origem Vinculada</label>
                    <select 
                        className="w-full border rounded-lg px-3 py-2 bg-white text-sm" 
                        value={formData.linkedOriginUnit} 
                        onChange={e => setFormData({...formData, linkedOriginUnit: e.target.value})}
                    >
                        <option value="">(Nenhuma)</option>
                        {origins.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Destino Vinculado</label>
                    <select 
                        className="w-full border rounded-lg px-3 py-2 bg-white text-sm" 
                        value={formData.linkedDestUnit} 
                        onChange={e => setFormData({...formData, linkedDestUnit: e.target.value})}
                    >
                        <option value="">(Nenhuma)</option>
                        {destinations.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>
             </div>
             <div className="pt-4 flex gap-3">
               <button type="button" onClick={onClose} className="flex-1 py-2.5 border rounded-lg text-gray-600 font-medium">Cancelar</button>
               <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-primary text-white rounded-lg font-bold">{loading ? 'Salvando...' : 'Salvar'}</button>
             </div>
          </form>
       </div>
    </div>
  );
};

const ProfileModal = ({ mode, initialData, onClose, onSave }: any) => {
    const [formData, setFormData] = useState<Profile>(initialData || { name: '', description: '', permissions: '[]' });
    const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
  
    useEffect(() => {
        try {
            const parsed = formData.permissions.startsWith('[') ? JSON.parse(formData.permissions) : [];
            setSelectedPermissions(Array.isArray(parsed) ? parsed : []);
        } catch (e) {
            setSelectedPermissions([]);
        }
    }, []);

    const togglePermission = (permId: string) => {
        const newPerms = selectedPermissions.includes(permId)
            ? selectedPermissions.filter(p => p !== permId)
            : [...selectedPermissions, permId];
        
        setSelectedPermissions(newPerms);
        setFormData({ ...formData, permissions: JSON.stringify(newPerms) });
    };

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      await onSave({ ...formData, permissions: JSON.stringify(selectedPermissions) });
      setLoading(false);
      onClose();
    };
  
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
         <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 sm:p-8 animate-scale-in max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-6">{mode === 'create' ? 'Novo Perfil' : 'Editar Perfil'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
               <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome do Perfil</label><input required type="text" className="w-full border rounded-lg px-3 py-2" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
               <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Descrição</label><input required type="text" className="w-full border rounded-lg px-3 py-2" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} /></div>
               <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Permissões do Sistema</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto p-2 border rounded-lg bg-gray-50">
                     {SYSTEM_PERMISSIONS.map(perm => (
                        <label key={perm.id} className="flex items-center gap-3 p-2 bg-white border border-gray-100 rounded-lg cursor-pointer hover:border-secondary/50 transition">
                            <input 
                                type="checkbox" 
                                className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                                checked={selectedPermissions.includes(perm.id)}
                                onChange={() => togglePermission(perm.id)}
                            />
                            <span className="text-sm font-medium text-gray-700">{perm.label}</span>
                        </label>
                     ))}
                  </div>
               </div>
               <div className="pt-4 flex gap-3">
                 <button type="button" onClick={onClose} className="flex-1 py-2.5 border rounded-lg text-gray-600 font-medium">Cancelar</button>
                 <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-primary text-white rounded-lg font-bold">{loading ? 'Salvando...' : 'Salvar'}</button>
               </div>
            </form>
         </div>
      </div>
    );
  };