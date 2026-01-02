
import React, { useState, useMemo, useRef, useEffect, memo, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { getStatusColor, getPaymentColor, parseDate, calculateBusinessDaysDiff, compressImage, parseDateTime, formatImageUrl } from '../utils';
import { CTE, Note } from '../types';
import * as XLSX from 'xlsx';

// Sorting Types
type SortKey = 'cte' | 'dataEmissao' | 'dataLimite' | 'status' | 'origem' | 'destino' | 'pagamento' | 'destinatario';
type SortDirection = 'asc' | 'desc';

export const DetailModal = ({ cte, onClose }: { cte: CTE; onClose: () => void }) => {
  const { notes, addNote, currentUser, markAsInSearch, resolveSearch } = useApp();
  const { addToast } = useToast();
  const [newNote, setNewNote] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const cteNotes = notes
    .filter(n => n.cteId === cte.id)
    .sort((a, b) => parseDateTime(a.date) - parseDateTime(b.date));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [cteNotes]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleSendNote = async () => {
    if (!newNote.trim() && selectedFiles.length === 0) return;
    setIsSubmitting(true);
    const imagesBase64: string[] = [];
    for (const file of selectedFiles) {
        try {
            const base64 = await compressImage(file);
            imagesBase64.push(base64);
        } catch (e) {
            console.error("Compression failed", e);
        }
    }
    const success = await addNote(cte.id, newNote, imagesBase64);
    if (success) {
        setNewNote('');
        setSelectedFiles([]);
        setTimeout(() => {
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }, 100);
        addToast('Nota enviada!', 'success');
    } else {
        addToast('Erro ao enviar nota', 'error');
    }
    setIsSubmitting(false);
  };

  const handleMarkSearch = async () => {
      if(!confirm('Deseja marcar esta mercadoria como EM BUSCA?')) return;
      setIsSubmitting(true);
      const success = await markAsInSearch(cte.id);
      if(success) addToast('Mercadoria em BUSCA!', 'success');
      setIsSubmitting(false);
  };

  const handleResolve = async () => {
      if(!confirm('Confirmar localização da mercadoria?')) return;
      setIsSubmitting(true);
      const success = await resolveSearch(cte.id);
      if(success) {
          addToast('Resolvido com sucesso!', 'success');
          onClose(); 
      }
      setIsSubmitting(false);
  };

  const isResolved = cte.status === 'MERCADORIA LOCALIZADA' || cte.status === 'RESOLVIDO';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in cursor-pointer" onClick={onClose}>
        <div className="bg-white w-full max-w-4xl h-[90vh] rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden relative animate-scale-in cursor-auto" onClick={(e) => e.stopPropagation()}>
            <button onClick={onClose} className="absolute top-4 right-4 z-50 bg-gray-100 p-2 rounded-full hover:bg-red-100 hover:text-red-500 transition shadow-sm text-gray-500 flex items-center justify-center border border-gray-200" title="Fechar"><i className="ph-bold ph-x text-xl"></i></button>
            
            {/* Lateral Info */}
            <div className="w-full md:w-1/3 bg-gray-50 p-6 overflow-y-auto border-r border-gray-100 hidden md:block pt-12 md:pt-6">
                <div className="mb-6"><h2 className="text-2xl font-bold text-gray-800 tracking-tighter">{cte.cte}</h2><p className="text-sm text-gray-500 font-medium">Série {cte.serie}</p>
                    <div className="mt-3 flex flex-wrap gap-2"><span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${getStatusColor(cte.computedStatus || 'NO_PRAZO')}`}>{cte.computedStatus?.replace(/_/g, ' ')}</span><span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${getPaymentColor(cte.fretePago)}`}>{cte.fretePago}</span></div>
                </div>
                <div className="space-y-4 text-sm text-gray-600">
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100"><p className="text-xs font-bold text-gray-400 uppercase mb-1">Rota</p><div className="flex flex-col gap-2"><div><p className="font-bold text-gray-800">{cte.coleta}</p><p className="text-[10px] text-gray-400 font-bold uppercase">Origem</p></div><div className="w-px h-4 bg-gray-200 ml-1"></div><div><p className="font-bold text-gray-800">{cte.entrega}</p><p className="text-[10px] text-gray-400 font-bold uppercase">Destino</p></div></div></div>
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100"><p className="text-xs font-bold text-gray-400 uppercase mb-1">Prazos</p><div className="flex justify-between"><span>Emissão:</span><span className="font-medium">{cte.dataEmissao}</span></div><div className="flex justify-between mt-1"><span>Limite:</span><span className="font-bold text-red-600">{cte.dataLimite}</span></div></div>
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100"><p className="text-xs font-bold text-gray-400 uppercase mb-1">Cliente</p><p className="font-medium text-gray-800 break-words leading-tight">{cte.destinatario}</p></div>
                </div>
                <div className="mt-8 space-y-3">
                    {cte.status === 'EM BUSCA' ? (<button onClick={handleResolve} disabled={isSubmitting} className="w-full py-4 bg-green-600 text-white rounded-2xl font-black uppercase text-xs shadow-lg hover:bg-green-700 transition flex items-center justify-center gap-2"><i className="ph-bold ph-check-circle text-lg"></i> LOCALIZADA</button>) : isResolved ? (<div className="w-full py-4 bg-green-50 text-green-700 border border-green-200 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2"><i className="ph-fill ph-check-circle text-lg"></i> LOCALIZADA</div>) : (<button onClick={handleMarkSearch} disabled={isSubmitting} className="w-full py-4 bg-purple-100 text-purple-700 border border-purple-200 rounded-2xl font-black uppercase text-xs hover:bg-purple-200 transition flex items-center justify-center gap-2"><i className="ph-bold ph-binoculars text-lg"></i> MARCAR BUSCA</button>)}
                </div>
            </div>
            
            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col bg-white overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white z-10 pt-6 flex items-center gap-2">
                   <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-primary"><i className="ph-fill ph-chat-circle-dots text-xl"></i></div>
                   <h3 className="font-bold text-gray-800">Histórico de Tratativas</h3>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-8 bg-[#F8F9FC] custom-scrollbar" ref={scrollRef}>
                    {cteNotes.length === 0 ? (<div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60"><i className="ph-duotone ph-chats text-4xl mb-2"></i><p className="text-sm font-medium">Nenhuma tratativa iniciada.</p></div>) : (
                        cteNotes.map(note => {
                            const isMe = currentUser?.username === note.user;
                            const isSearchNote = note.statusBusca || note.text.includes('BUSCA') || note.text.includes('LOCALIZADA');
                            
                            return (
                              <div key={note.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 shadow-sm relative border-2 ${isSearchNote ? 'border-purple-200 bg-purple-50/50' : (isMe ? 'bg-white border-indigo-50' : 'bg-white border-gray-100')}`}>
                                  <div className="flex justify-between items-center gap-4 mb-2">
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${isSearchNote ? 'text-purple-700' : (isMe ? 'text-indigo-600' : 'text-primary')}`}>
                                        {isSearchNote && <i className="ph-fill ph-warning-circle mr-1"></i>}
                                        {note.user}
                                    </span>
                                    <span className="text-[10px] text-gray-400 font-bold">{note.date}</span>
                                  </div>
                                  <p className={`text-sm whitespace-pre-wrap leading-relaxed ${isSearchNote ? 'text-purple-900 font-semibold' : 'text-gray-800'}`}>{note.text}</p>
                                  
                                  {/* Grid de Imagens */}
                                  {note.imageUrl && (
                                    <div className="mt-4 flex gap-3 flex-wrap">
                                      {note.imageUrl.split(',')
                                        .map(url => url.trim())
                                        .filter(url => url.length > 0)
                                        .map((url, i) => {
                                          // USAR THUMBNAIL PARA PREVIEW (Mais rápido e bypassa restrições)
                                          const thumbUrl = formatImageUrl(url, true);
                                          const fullViewUrl = formatImageUrl(url, false);
                                          
                                          return (
                                            <div key={i} className="flex flex-col gap-1 group">
                                              <a href={fullViewUrl} target="_blank" rel="noopener noreferrer" className="block relative overflow-hidden rounded-xl border-2 border-white shadow-md bg-gray-100 w-32 h-32 flex items-center justify-center">
                                                <img 
                                                  src={thumbUrl} 
                                                  alt="evidência" 
                                                  loading="lazy"
                                                  className="w-full h-full object-cover group-hover:scale-110 transition duration-500" 
                                                  onError={(e) => {
                                                    const target = e.target as HTMLImageElement;
                                                    // Fallback 1: Tentar o link direto sem thumbnail
                                                    if (!target.src.includes('uc?')) {
                                                        target.src = fullViewUrl;
                                                    } else {
                                                        // Fallback final: Placeholder amigável
                                                        target.parentElement!.classList.add('bg-indigo-50');
                                                        target.style.display = 'none';
                                                        const icon = document.createElement('i');
                                                        icon.className = 'ph ph-image-square text-3xl text-indigo-300';
                                                        target.parentElement!.appendChild(icon);
                                                    }
                                                  }}
                                                />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                                   <i className="ph-bold ph-magnifying-glass-plus text-white text-2xl"></i>
                                                </div>
                                              </a>
                                              <a href={fullViewUrl} target="_blank" rel="noopener noreferrer" className="text-[9px] text-center font-black text-gray-400 hover:text-primary transition uppercase tracking-tighter py-1">Abrir Original</a>
                                            </div>
                                          );
                                        })
                                      }
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                        })
                    )}
                </div>
                
                {/* Input Area */}
                <div className="p-4 bg-white border-t border-gray-100">
                    <div className="flex gap-2 items-center">
                        <label className="flex items-center gap-2 px-3 py-3 rounded-xl bg-gray-50 text-gray-500 hover:bg-gray-100 cursor-pointer border border-gray-200 transition-colors shadow-sm">
                            <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileSelect} />
                            <i className="ph-bold ph-camera text-xl"></i>
                        </label>
                        <div className="flex-1 relative">
                            <input 
                                type="text" 
                                value={newNote} 
                                onChange={e => setNewNote(e.target.value)} 
                                placeholder="Digite sua resposta ou tratativa..." 
                                className="w-full pl-4 pr-12 py-3.5 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary/10 transition-all outline-none font-medium text-sm" 
                                onKeyDown={e => e.key === 'Enter' && !isSubmitting && handleSendNote()}
                            />
                            <button 
                                onClick={handleSendNote} 
                                disabled={isSubmitting || (!newNote.trim() && selectedFiles.length === 0)} 
                                className={`absolute right-2 top-1/2 transform -translate-y-1/2 p-2.5 rounded-xl transition shadow-md flex items-center justify-center ${(!newNote.trim() && selectedFiles.length === 0) ? 'bg-gray-100 text-gray-400' : 'bg-primary text-white hover:bg-accent'}`}
                            >
                                <i className="ph-bold ph-paper-plane-right"></i>
                            </button>
                        </div>
                    </div>
                    {selectedFiles.length > 0 && (
                        <div className="mt-3 flex gap-2 overflow-x-auto py-1">
                            {selectedFiles.map((f, idx) => (
                                <div key={idx} className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg text-[10px] font-black border border-indigo-100 flex items-center gap-1">
                                    <i className="ph ph-image"></i> {f.name.substring(0, 10)}...
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export const PendenciasList = ({ mode }: { mode: 'all' | 'critical' | 'search' }) => {
  const { ctes, notes, currentUser, config, setSelectedCteId } = useApp();
  const [filterText, setFilterText] = useState('');
  const [selectedDestUnit, setSelectedDestUnit] = useState<string>('all');
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'dataLimite', direction: 'asc' });

  const role = currentUser?.role.toLowerCase();
  const isAdmin = role === 'admin';
  const isGlobalUser = isAdmin || role === 'leitor' || (!currentUser?.linkedOriginUnit && !currentUser?.linkedDestUnit);

  const destinationUnits = useMemo(() => {
    const units = new Set(ctes.map(c => c.entrega).filter(Boolean));
    return Array.from(units).sort();
  }, [ctes]);

  useEffect(() => {
    if (!isGlobalUser && currentUser?.linkedDestUnit) {
        setSelectedDestUnit(currentUser.linkedDestUnit);
    }
  }, [currentUser, isGlobalUser]);

  const handleSort = (key: SortKey) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const filteredData = useMemo(() => {
    let data = ctes;
    if (filterText.length > 0) {
        const term = filterText.toLowerCase();
        data = data.filter(c => c.cte.includes(filterText) || c.serie.includes(filterText) || (c.destinatario && c.destinatario.toLowerCase().includes(term)));
    } else {
        if (!isGlobalUser) {
            data = data.filter(c => (currentUser?.linkedOriginUnit && c.coleta.includes(currentUser.linkedOriginUnit)) || (currentUser?.linkedDestUnit && c.entrega.includes(currentUser.linkedDestUnit)) || c.status === 'EM BUSCA');
        }
        if (mode === 'critical') data = data.filter(c => c.computedStatus === 'CRITICO');
        else if (mode === 'search') data = data.filter(c => c.status === 'EM BUSCA');
        else data = data.filter(c => c.computedStatus !== 'CRITICO' && c.status !== 'EM BUSCA');

        if (selectedDestUnit !== 'all') data = data.filter(c => c.entrega === selectedDestUnit);
    }

    data = [...data].sort((a, b) => {
      let valA: any, valB: any;
      switch (sortConfig.key) {
        case 'cte': valA = parseInt(a.cte) || 0; valB = parseInt(b.cte) || 0; break;
        case 'dataLimite': valA = parseDate(a.dataLimite)?.getTime() || 0; valB = parseDate(b.dataLimite)?.getTime() || 0; break;
        default: return 0;
      }
      return sortConfig.direction === 'asc' ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
    });
    return data;
  }, [ctes, mode, filterText, currentUser, selectedDestUnit, isGlobalUser, sortConfig]);

  const SortIcon = ({ colKey }: { colKey: SortKey }) => {
    if (sortConfig.key !== colKey) return <i className="ph-bold ph-caret-up-down text-gray-300 ml-1 text-xs"></i>;
    return <i className={`ph-bold ${sortConfig.direction === 'asc' ? 'ph-caret-up' : 'ph-caret-down'} text-primary ml-1 text-xs`}></i>;
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="glass-panel p-4 rounded-3xl flex flex-col gap-4 border border-white/50">
        <div className="flex flex-col xl:flex-row justify-between items-center gap-4">
            <div className="flex flex-col md:flex-row items-center gap-3 w-full xl:w-auto">
                <div className="relative w-full md:w-80"><i className="ph-bold ph-magnifying-glass absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i><input type="text" placeholder="Filtre por CTE ou Cliente..." value={filterText} onChange={(e) => setFilterText(e.target.value)} className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 bg-white shadow-inner outline-none focus:border-primary/40 transition" /></div>
                {!filterText && (<div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-3 py-3 shadow-inner w-full md:w-auto">{isGlobalUser ? (<select className="bg-transparent text-xs font-black uppercase tracking-tighter text-gray-700 w-full md:w-48 outline-none" value={selectedDestUnit} onChange={(e) => setSelectedDestUnit(e.target.value)}><option value="all">TODAS AS UNIDADES</option>{destinationUnits.map(unit => (<option key={unit} value={unit}>{unit}</option>))}</select>) : (<span className="font-black text-gray-800 text-xs px-2 uppercase tracking-tighter">{currentUser?.linkedDestUnit || 'TODAS AS UNIDADES'}</span>)}</div>)}
            </div>
            <button onClick={() => { const ws = XLSX.utils.json_to_sheet(filteredData); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Dados"); XLSX.writeFile(wb, `Relatorio_${mode}.xlsx`); }} className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white font-black uppercase text-xs rounded-2xl hover:bg-green-600 transition shadow-lg shadow-green-200"><i className="ph-bold ph-download"></i> EXPORTAR</button>
        </div>
      </div>
      
      <div className="hidden md:block glass-panel rounded-3xl overflow-hidden shadow-sm overflow-x-auto border border-white/50">
        <table className="w-full text-left min-w-[1000px]">
          <thead className="bg-gray-50/50 text-gray-500 text-[10px] uppercase font-black tracking-widest border-b border-gray-100">
            <tr>
              <th className="p-5 cursor-pointer" onClick={() => handleSort('cte')}>CTE / SÉRIE <SortIcon colKey="cte" /></th>
              <th className="p-5">DESTINATÁRIO</th>
              <th className="p-5 cursor-pointer" onClick={() => handleSort('dataLimite')}>PRAZO / LIMITE <SortIcon colKey="dataLimite" /></th>
              <th className="p-5">STATUS</th>
              <th className="p-5 text-right">AÇÕES</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 bg-white/50 backdrop-blur-sm">
            {filteredData.map(item => (
                <tr key={item.id} className="hover:bg-white transition group">
                    <td className="p-5 font-bold text-primary">{item.cte} / {item.serie}</td>
                    <td className="p-5 text-sm font-medium text-gray-700 truncate max-w-[250px]">{item.destinatario}</td>
                    <td className="p-5 text-sm font-bold text-gray-900">{item.dataLimite}</td>
                    <td className="p-5">
                        <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter shadow-sm ${item.status === 'EM BUSCA' ? 'bg-purple-600 text-white' : getStatusColor(item.computedStatus || 'NO_PRAZO')}`}>
                            {item.status === 'EM BUSCA' ? 'EM BUSCA' : item.computedStatus?.replace(/_/g, ' ')}
                        </span>
                    </td>
                    <td className="p-5 text-right"><button onClick={() => setSelectedCteId(item.id)} className="w-12 h-12 rounded-2xl bg-gray-50 text-gray-500 hover:bg-primary hover:text-white transition shadow-sm border border-gray-200 flex items-center justify-center mx-auto hover:rotate-6"><i className="ph-bold ph-chat-circle-dots text-xl"></i></button></td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {filteredData.map(item => (
            <div key={item.id} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100" onClick={() => setSelectedCteId(item.id)}>
                <div className="flex justify-between items-start mb-3">
                    <div><p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">CTE / SÉRIE</p><h4 className="font-black text-primary text-lg">{item.cte} / {item.serie}</h4></div>
                    <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter ${item.status === 'EM BUSCA' ? 'bg-purple-600 text-white' : getStatusColor(item.computedStatus || 'NO_PRAZO')}`}>{item.status === 'EM BUSCA' ? 'EM BUSCA' : item.computedStatus?.replace(/_/g, ' ')}</span>
                </div>
                <div className="mb-4"><p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">DESTINATÁRIO</p><p className="text-sm font-medium text-gray-700 truncate">{item.destinatario}</p></div>
                <div className="flex justify-between items-center"><div className="flex flex-col"><span className="text-[10px] font-black text-gray-400 uppercase">LIMITE</span><span className="text-sm font-bold text-gray-800">{item.dataLimite}</span></div><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><i className="ph-bold ph-arrow-right"></i></div></div>
            </div>
        ))}
      </div>
    </div>
  );
}
