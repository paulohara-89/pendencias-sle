
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
        addToast('Nota adicionada com sucesso', 'success');
    } else {
        addToast('Erro ao adicionar nota', 'error');
    }
    setIsSubmitting(false);
  };

  const handleMarkSearch = async () => {
      if(!confirm('Deseja marcar esta mercadoria como EM BUSCA? Isso gerará um alerta para todos.')) return;
      setIsSubmitting(true);
      const success = await markAsInSearch(cte.id);
      if(success) addToast('Marcado como EM BUSCA', 'success');
      setIsSubmitting(false);
  };

  const handleResolve = async () => {
      if(!confirm('Confirmar que a mercadoria foi LOCALIZADA?')) return;
      setIsSubmitting(true);
      const success = await resolveSearch(cte.id);
      if(success) {
          addToast('Mercadoria localizada e resolvida!', 'success');
          onClose(); 
      }
      setIsSubmitting(false);
  };

  const isResolved = cte.status === 'MERCADORIA LOCALIZADA' || cte.status === 'RESOLVIDO';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in cursor-pointer" onClick={onClose}>
        <div className="bg-white w-full max-w-4xl h-[90vh] rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden relative animate-scale-in cursor-auto" onClick={(e) => e.stopPropagation()}>
            <button onClick={onClose} className="absolute top-4 right-4 z-50 bg-gray-100 p-2 rounded-full hover:bg-red-100 hover:text-red-500 transition shadow-sm text-gray-500 flex items-center justify-center border border-gray-200" title="Fechar"><i className="ph-bold ph-x text-xl"></i></button>
            <div className="w-full md:w-1/3 bg-gray-50 p-6 overflow-y-auto border-r border-gray-100 hidden md:block pt-12 md:pt-6">
                <div className="mb-6"><h2 className="text-2xl font-bold text-gray-800">{cte.cte}</h2><p className="text-sm text-gray-500 font-medium">Série {cte.serie}</p>
                    <div className="mt-3 flex flex-wrap gap-2"><span className={`px-2 py-1 rounded-md text-xs font-bold ${getStatusColor(cte.computedStatus || 'NO_PRAZO')}`}>{cte.computedStatus?.replace(/_/g, ' ')}</span><span className={`px-2 py-1 rounded-md text-xs font-bold ${getPaymentColor(cte.fretePago)}`}>{cte.fretePago}</span></div>
                </div>
                <div className="space-y-4 text-sm text-gray-600">
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100"><p className="text-xs font-bold text-gray-400 uppercase mb-1">Rota</p><div className="flex flex-col gap-2"><div><p className="font-bold text-gray-800">{cte.coleta}</p><p className="text-xs text-gray-400">Origem</p></div><div className="w-px h-4 bg-gray-300 ml-1"></div><div><p className="font-bold text-gray-800">{cte.entrega}</p><p className="text-xs text-gray-400">Destino</p></div></div></div>
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100"><p className="text-xs font-bold text-gray-400 uppercase mb-1">Prazos</p><div className="flex justify-between"><span>Emissão:</span><span className="font-medium">{cte.dataEmissao}</span></div><div className="flex justify-between mt-1"><span>Limite:</span><span className="font-bold text-red-600">{cte.dataLimite}</span></div></div>
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100"><p className="text-xs font-bold text-gray-400 uppercase mb-1">Cliente</p><p className="font-medium text-gray-800 break-words">{cte.destinatario}</p></div>
                </div>
                <div className="mt-8 space-y-3">
                    {cte.status === 'EM BUSCA' ? (<button onClick={handleResolve} disabled={isSubmitting} className="w-full py-3 bg-green-600 text-white rounded-xl font-bold shadow-lg hover:bg-green-700 transition flex items-center justify-center gap-2"><i className="ph-bold ph-check-circle"></i> Mercadoria Localizada</button>) : isResolved ? (<div className="w-full py-3 bg-green-50 text-green-700 border border-green-200 rounded-xl font-bold flex items-center justify-center gap-2"><i className="ph-fill ph-check-circle"></i> LOCALIZADA</div>) : (<button onClick={handleMarkSearch} disabled={isSubmitting} className="w-full py-3 bg-purple-100 text-purple-700 border border-purple-200 rounded-xl font-bold hover:bg-purple-200 transition flex items-center justify-center gap-2"><i className="ph-bold ph-binoculars"></i> MARCAR EM BUSCA</button>)}
                </div>
            </div>
            
            <div className="flex-1 flex flex-col bg-white overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white z-10 pt-6"><h3 className="font-bold text-gray-800 flex items-center gap-2"><i className="ph-fill ph-chat-circle-text text-primary"></i> Histórico de Tratativas</h3></div>
                <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-[#F8F9FC]" ref={scrollRef}>
                    {cteNotes.length === 0 ? (<div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60"><i className="ph-duotone ph-chats text-4xl mb-2"></i><p>Nenhuma nota registrada.</p></div>) : (
                        cteNotes.map(note => {
                            const isMe = currentUser?.username === note.user;
                            const isSearchNote = note.statusBusca || note.text.includes('EM BUSCA');
                            return (
                              <div key={note.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-4 shadow-sm border-2 ${isSearchNote ? 'border-purple-200 bg-purple-50/30' : (isMe ? 'bg-white border-indigo-100' : 'bg-white border-gray-100')}`}>
                                  <div className="flex justify-between items-center gap-4 mb-2">
                                    <span className={`text-xs font-black uppercase tracking-widest ${isSearchNote ? 'text-purple-700' : (isMe ? 'text-indigo-600' : 'text-primary')}`}>{note.user}</span>
                                    <span className="text-[10px] text-gray-400 font-bold">{note.date}</span>
                                  </div>
                                  <p className="text-sm whitespace-pre-wrap leading-relaxed text-gray-800">{note.text}</p>
                                  {note.imageUrl && (
                                    <div className="mt-4 flex gap-3 flex-wrap">
                                      {note.imageUrl.split(',')
                                        .map(url => url.trim())
                                        .filter(url => url.length > 0)
                                        .map((url, i) => {
                                          const previewUrl = formatImageUrl(url, true); // Usa thumbnail para preview
                                          const fullUrl = formatImageUrl(url, false);
                                          return (
                                            <div key={i} className="flex flex-col gap-1">
                                              <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="block relative group overflow-hidden rounded-xl border-2 border-white shadow-md">
                                                <img 
                                                  src={previewUrl} 
                                                  alt="anexo" 
                                                  className="w-32 h-32 object-cover group-hover:scale-110 transition duration-500 bg-gray-200" 
                                                  onError={(e) => {
                                                    const img = e.target as HTMLImageElement;
                                                    if (!img.src.includes('uc?')) {
                                                        img.src = fullUrl; // Tenta o link direto se a thumbnail falhar
                                                    } else {
                                                        img.src = "https://placehold.co/120x120?text=Abrir+Link";
                                                    }
                                                  }}
                                                />
                                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                                   <i className="ph-bold ph-magnifying-glass-plus text-white text-xl"></i>
                                                </div>
                                              </a>
                                              <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="text-[9px] text-center font-black text-gray-400 hover:text-primary transition uppercase tracking-tighter">Ver Original</a>
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
                <div className="p-4 bg-white border-t border-gray-100">
                    <div className="flex gap-2 items-center">
                        <label className="flex items-center gap-2 px-3 py-3 rounded-xl bg-gray-50 text-gray-500 hover:bg-gray-100 cursor-pointer border border-gray-200 transition"><input type="file" multiple accept="image/*" className="hidden" onChange={handleFileSelect} /><i className="ph-bold ph-camera text-xl"></i></label>
                        <div className="flex-1 relative"><input type="text" value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Digite uma nota..." className="w-full pl-4 pr-12 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white outline-none" onKeyDown={e => e.key === 'Enter' && !isSubmitting && handleSendNote()}/><button onClick={handleSendNote} disabled={isSubmitting || (!newNote.trim() && selectedFiles.length === 0)} className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 bg-primary text-white rounded-lg hover:bg-indigo-700 transition"><i className="ph-bold ph-paper-plane-right"></i></button></div>
                    </div>
                    {selectedFiles.length > 0 && <div className="mt-2 text-[10px] font-bold text-indigo-600 ml-2 animate-pulse">{selectedFiles.length} arquivo(s) selecionado(s)</div>}
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
  const [paymentFilters, setPaymentFilters] = useState<string[]>([]);
  const [noteFilter, setNoteFilter] = useState<'all' | 'com_nota' | 'sem_nota'>('all');

  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'dataLimite',
    direction: 'asc'
  });

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
      <div className="glass-panel p-4 rounded-2xl flex flex-col gap-4">
        <div className="flex flex-col xl:flex-row justify-between items-center gap-4">
            <div className="flex flex-col md:flex-row items-center gap-3 w-full xl:w-auto">
                <div className="relative w-full md:w-80"><i className="ph-bold ph-magnifying-glass absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i><input type="text" placeholder="Busca Universal..." value={filterText} onChange={(e) => setFilterText(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white" /></div>
                {!filterText && (<div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-sm w-full md:w-auto">{isGlobalUser ? (<select className="bg-transparent text-sm font-bold text-gray-700 w-full md:w-48 outline-none" value={selectedDestUnit} onChange={(e) => setSelectedDestUnit(e.target.value)}><option value="all">Todas as Direções</option>{destinationUnits.map(unit => (<option key={unit} value={unit}>{unit}</option>))}</select>) : (<span className="font-bold text-gray-800 text-sm px-2">{currentUser?.linkedDestUnit || 'Todas'}</span>)}</div>)}
            </div>
            <button onClick={() => { const ws = XLSX.utils.json_to_sheet(filteredData); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Dados"); XLSX.writeFile(wb, `Relatorio.xlsx`); }} className="flex items-center gap-2 px-5 py-2.5 bg-green-100 text-green-700 font-bold rounded-xl hover:bg-green-200 transition">Exportar</button>
        </div>
      </div>
      <div className="hidden md:block glass-panel rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full text-left min-w-[1000px]">
          <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase font-black tracking-widest">
            <tr>
              <th className="p-5 cursor-pointer" onClick={() => handleSort('cte')}>CTE / Série <SortIcon colKey="cte" /></th>
              <th className="p-5">Destinatário</th>
              <th className="p-5 cursor-pointer" onClick={() => handleSort('dataLimite')}>Prazo <SortIcon colKey="dataLimite" /></th>
              <th className="p-5">Status</th>
              <th className="p-5 text-right">Ver</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filteredData.map(item => (
                <tr key={item.id} className="hover:bg-indigo-50/30 transition group">
                    <td className="p-5 font-bold text-primary">{item.cte} / {item.serie}</td>
                    <td className="p-5 text-sm font-medium text-gray-700 truncate max-w-[200px]">{item.destinatario}</td>
                    <td className="p-5 text-sm"><div className="flex flex-col"><span className="font-bold text-gray-900">{item.dataLimite}</span></div></td>
                    <td className="p-5"><span className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-tighter ${item.status === 'EM BUSCA' ? 'bg-purple-600 text-white' : getStatusColor(item.computedStatus || 'NO_PRAZO')}`}>{item.status === 'EM BUSCA' ? 'EM BUSCA' : item.computedStatus?.replace(/_/g, ' ')}</span></td>
                    <td className="p-5 text-right"><button onClick={() => setSelectedCteId(item.id)} className="w-10 h-10 rounded-xl bg-gray-100 text-gray-600 hover:bg-primary hover:text-white transition shadow-sm"><i className="ph-bold ph-eye"></i></button></td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
