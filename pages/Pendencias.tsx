
import React, { useState, useMemo, useRef, useEffect, memo, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { getStatusColor, getPaymentColor, parseDate, calculateBusinessDaysDiff, compressImage, parseDateTime, formatImageUrl } from '../utils';
import { CTE, Note } from '../types';
import * as XLSX from 'xlsx';

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
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [cteNotes]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setSelectedFiles(Array.from(e.target.files));
  };

  const handleSendNote = async () => {
    if (!newNote.trim() && selectedFiles.length === 0) return;
    setIsSubmitting(true);
    const imagesBase64: string[] = [];
    for (const file of selectedFiles) {
        try { const base64 = await compressImage(file); imagesBase64.push(base64); } 
        catch (e) { console.error("Compression failed", e); }
    }
    const success = await addNote(cte.id, newNote, imagesBase64);
    if (success) {
        setNewNote('');
        setSelectedFiles([]);
        setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 100);
        addToast('Tratativa salva!', 'success');
    } else addToast('Erro ao salvar!', 'error');
    setIsSubmitting(false);
  };

  const handleMarkSearch = async () => {
      if(!confirm('Deseja marcar como EM BUSCA?')) return;
      setIsSubmitting(true);
      if(await markAsInSearch(cte.id)) addToast('Em busca!', 'success');
      setIsSubmitting(false);
  };

  const handleResolve = async () => {
      if(!confirm('Confirmar localização?')) return;
      setIsSubmitting(true);
      if(await resolveSearch(cte.id)) { addToast('Resolvido!', 'success'); onClose(); }
      setIsSubmitting(false);
  };

  const isResolved = cte.status === 'MERCADORIA LOCALIZADA' || cte.status === 'RESOLVIDO';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in cursor-pointer" onClick={onClose}>
        <div className="bg-white w-full max-w-4xl h-[90vh] rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden relative animate-scale-in cursor-auto" onClick={(e) => e.stopPropagation()}>
            <button onClick={onClose} className="absolute top-4 right-4 z-50 bg-gray-100 p-2 rounded-full hover:bg-red-100 hover:text-red-500 transition shadow-sm text-gray-500 flex items-center justify-center border border-gray-200"><i className="ph-bold ph-x text-xl"></i></button>
            
            <div className="w-full md:w-1/3 bg-gray-50 p-6 overflow-y-auto border-r border-gray-100 hidden md:block pt-12 md:pt-6">
                <div className="mb-6"><h2 className="text-2xl font-bold text-gray-800 tracking-tighter">{cte.cte}</h2><p className="text-sm text-gray-500 font-medium">Série {cte.serie}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-black tracking-widest uppercase ${getStatusColor(cte.status === 'EM BUSCA' ? 'CRITICO' : (cte.computedStatus || 'NO_PRAZO'))}`}>{cte.status === 'EM BUSCA' ? 'EM BUSCA' : cte.computedStatus?.replace(/_/g, ' ')}</span>
                        <span className={`px-2 py-1 rounded-md text-[10px] font-black tracking-widest uppercase ${getPaymentColor(cte.fretePago)}`}>{cte.fretePago}</span>
                    </div>
                </div>
                <div className="space-y-4 text-sm text-gray-600">
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1 tracking-widest">Rota</p>
                        <div className="flex flex-col gap-2">
                            <div><p className="font-bold text-gray-800">{cte.coleta}</p><p className="text-[10px] text-gray-400 font-bold uppercase">Origem</p></div>
                            <div className="w-px h-4 bg-gray-300 ml-1"></div>
                            <div><p className="font-bold text-gray-800">{cte.entrega}</p><p className="text-[10px] text-gray-400 font-bold uppercase">Destino</p></div>
                        </div>
                    </div>
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100"><p className="text-[10px] font-bold text-gray-400 uppercase mb-1 tracking-widest">Prazos</p><div className="flex justify-between"><span>Emissão:</span><span className="font-medium">{cte.dataEmissao}</span></div><div className="flex justify-between mt-1"><span>Limite:</span><span className="font-bold text-red-600">{cte.dataLimite}</span></div></div>
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100"><p className="text-[10px] font-bold text-gray-400 uppercase mb-1 tracking-widest">Cliente</p><p className="font-medium text-gray-800 break-words leading-snug">{cte.destinatario}</p></div>
                </div>
                <div className="mt-8 space-y-3">
                    {cte.status === 'EM BUSCA' ? (<button onClick={handleResolve} disabled={isSubmitting} className="w-full py-4 bg-green-600 text-white rounded-2xl font-black uppercase text-xs shadow-lg hover:bg-green-700 transition flex items-center justify-center gap-2"><i className="ph-bold ph-check-circle text-lg"></i> LOCALIZADA</button>) : isResolved ? (<div className="w-full py-4 bg-green-50 text-green-700 border border-green-200 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 shadow-inner"><i className="ph-fill ph-check-circle text-lg"></i> LOCALIZADA</div>) : (<button onClick={handleMarkSearch} disabled={isSubmitting} className="w-full py-4 bg-purple-100 text-purple-700 border border-purple-200 rounded-2xl font-black uppercase text-xs hover:bg-purple-200 transition flex items-center justify-center gap-2"><i className="ph-bold ph-binoculars text-lg"></i> MARCAR BUSCA</button>)}
                </div>
            </div>
            
            <div className="flex-1 flex flex-col bg-white overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white z-10 pt-6 flex items-center gap-2"><div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-primary"><i className="ph-fill ph-chat-circle-text text-xl"></i></div><h3 className="font-bold text-gray-800 text-sm">Tratativas e Evidências</h3></div>
                <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-[#F8F9FC] custom-scrollbar" ref={scrollRef}>
                    {cteNotes.length === 0 ? (<div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60"><i className="ph-duotone ph-chats text-4xl mb-2"></i><p className="text-sm font-medium">Sem tratativas.</p></div>) : (
                        cteNotes.map(note => {
                            const isMe = currentUser?.username === note.user;
                            const isSearchNote = note.statusBusca || note.text.toUpperCase().includes('BUSCA') || note.text.toUpperCase().includes('LOCALIZADA');
                            return (
                              <div key={note.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm border-2 ${isSearchNote ? 'border-purple-200 bg-purple-50/50' : (isMe ? 'bg-white border-indigo-100' : 'bg-white border-gray-100')}`}>
                                  <div className="flex justify-between items-center gap-4 mb-1"><span className={`text-[10px] font-black uppercase tracking-widest ${isSearchNote ? 'text-purple-700' : (isMe ? 'text-indigo-600' : 'text-primary')}`}>{note.user}</span><span className="text-[10px] text-gray-400 font-bold">{note.date}</span></div>
                                  <p className={`text-sm whitespace-pre-wrap leading-relaxed ${isSearchNote ? 'text-purple-900 font-semibold' : 'text-gray-800'}`}>{note.text}</p>
                                  {note.imageUrl && (
                                    <div className="mt-3 flex gap-2 flex-wrap">
                                      {note.imageUrl.split(',').map(url => url.trim()).filter(Boolean).map((url, i) => (
                                        <a key={i} href={formatImageUrl(url, false)} target="_blank" rel="noopener noreferrer" className="block relative rounded-lg overflow-hidden border border-gray-200 w-20 h-20 bg-gray-100">
                                            <img src={formatImageUrl(url, true)} className="w-full h-full object-cover" onError={(e) => (e.target as HTMLImageElement).src = formatImageUrl(url, false)} />
                                        </a>
                                      ))}
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
                        <label className="p-3 rounded-xl bg-gray-50 text-gray-500 hover:bg-gray-100 cursor-pointer border border-gray-200 transition-colors"><input type="file" multiple accept="image/*" className="hidden" onChange={handleFileSelect} /><i className="ph-bold ph-camera text-xl"></i></label>
                        <div className="flex-1 relative"><input type="text" value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Digite uma nota..." className="w-full pl-4 pr-12 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white outline-none" onKeyDown={e => e.key === 'Enter' && !isSubmitting && handleSendNote()}/><button onClick={handleSendNote} disabled={isSubmitting || (!newNote.trim() && selectedFiles.length === 0)} className={`absolute right-1 top-1/2 transform -translate-y-1/2 p-2 rounded-lg transition ${(!newNote.trim() && selectedFiles.length === 0) ? 'text-gray-300' : 'bg-primary text-white shadow-sm'}`}><i className="ph-bold ph-paper-plane-right"></i></button></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export const PendenciasList = ({ mode }: { mode: 'all' | 'critical' | 'search' }) => {
  const { ctes, notes, currentUser, setSelectedCteId } = useApp();
  const [filterText, setFilterText] = useState('');
  const [selectedDestUnit, setSelectedDestUnit] = useState<string>('all');
  const [flowFilter, setFlowFilter] = useState<'all' | 'inbound' | 'outbound'>('inbound'); // Prioriza Chegada
  const [paymentFilters, setPaymentFilters] = useState<string[]>([]);
  const [noteFilter, setNoteFilter] = useState<'all' | 'with' | 'without'>('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'dataLimite', direction: 'asc' });

  const role = currentUser?.role.toLowerCase();
  const isAdmin = role === 'admin';
  const isGlobalUser = isAdmin || role === 'leitor' || (!currentUser?.linkedOriginUnit && !currentUser?.linkedDestUnit);

  const destinationUnits = useMemo(() => Array.from(new Set(ctes.map(c => c.entrega).filter(Boolean))).sort(), [ctes]);

  useEffect(() => {
    if (!isGlobalUser && currentUser?.linkedDestUnit) setSelectedDestUnit(currentUser.linkedDestUnit);
  }, [currentUser, isGlobalUser]);

  const togglePaymentFilter = (type: string) => {
    setPaymentFilters(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const filteredData = useMemo(() => {
    let data = ctes;
    
    // --- BUSCA GLOBAL (Prioridade Máxima) ---
    // Se houver texto de busca, ignora todos os outros filtros (exceto modo)
    if (filterText) {
        const term = filterText.toLowerCase();
        data = data.filter(c => 
            c.cte.includes(term) || 
            c.serie.includes(term) || 
            c.destinatario?.toLowerCase().includes(term) ||
            c.id.toLowerCase().includes(term)
        );
    } else {
        // 1. Filtro de Escopo de Unidade (Apenas se não for busca global)
        if (!isGlobalUser) {
            data = data.filter(c => (currentUser?.linkedOriginUnit && c.coleta.includes(currentUser.linkedOriginUnit)) || (currentUser?.linkedDestUnit && c.entrega.includes(currentUser.linkedDestUnit)) || c.status === 'EM BUSCA');
        }

        // 2. Filtro de Unidade Destino (Dropdown)
        if (selectedDestUnit !== 'all') {
            data = data.filter(c => c.entrega === selectedDestUnit);
        }

        // 3. Filtro de Fluxo (Chegada / Saída)
        // Correção da lógica para não zerar a lista
        if (flowFilter !== 'all') {
            const myUnit = currentUser?.linkedDestUnit || currentUser?.linkedOriginUnit;
            if (myUnit) {
                if (flowFilter === 'inbound') data = data.filter(c => c.entrega.includes(myUnit));
                else data = data.filter(c => c.coleta.includes(myUnit));
            }
        }
    }

    // --- SEGREGAÇÃO DE STATUS (Sempre aplicado) ---
    if (mode === 'critical') {
        // Apenas itens Críticos ou em Busca
        data = data.filter(c => c.computedStatus === 'CRITICO' || c.status === 'EM BUSCA');
    } else if (mode === 'search') {
        // Apenas em busca
        data = data.filter(c => c.status === 'EM BUSCA');
    } else {
        // Aba Pendências: FORA_DO_PRAZO, PRIORIDADE, VENCE_AMANHA, NO_PRAZO. 
        // EXCLUI Críticos e Em Busca.
        data = data.filter(c => c.computedStatus !== 'CRITICO' && c.status !== 'EM BUSCA');
    }

    // 4. Filtro de Pagamento
    if (paymentFilters.length > 0) {
        data = data.filter(c => paymentFilters.some(pf => c.fretePago?.toUpperCase().includes(pf.toUpperCase())));
    }

    // 5. Filtro de Notas
    if (noteFilter !== 'all') {
        data = data.filter(c => {
            const hasNotes = notes.some(n => n.cteId === c.id);
            return noteFilter === 'with' ? hasNotes : !hasNotes;
        });
    }

    return [...data].sort((a, b) => {
      let valA: any, valB: any;
      if (sortConfig.key === 'cte') { valA = parseInt(a.cte) || 0; valB = parseInt(b.cte) || 0; }
      else { valA = parseDate(a.dataLimite)?.getTime() || 0; valB = parseDate(b.dataLimite)?.getTime() || 0; }
      return sortConfig.direction === 'asc' ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
    });
  }, [ctes, mode, filterText, currentUser, selectedDestUnit, isGlobalUser, sortConfig, flowFilter, paymentFilters, noteFilter, notes]);

  return (
    <div className="space-y-6 pb-20">
      <div className="glass-panel p-5 rounded-3xl space-y-4 border border-white/50 shadow-sm">
        <div className="flex flex-col xl:flex-row justify-between items-stretch gap-4">
            <div className="flex flex-col md:flex-row items-stretch gap-3 flex-1">
                <div className="relative flex-1 md:max-w-md"><i className="ph-bold ph-magnifying-glass absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i><input type="text" placeholder="Busca Global (Qualquer Unidade)..." value={filterText} onChange={(e) => setFilterText(e.target.value)} className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 bg-white outline-none focus:border-primary/40 transition shadow-inner" /></div>
                
                <div className="flex gap-2">
                    {isGlobalUser ? (
                        <select className="px-4 py-3 rounded-2xl border border-gray-200 bg-white text-xs font-black uppercase tracking-tighter outline-none shadow-inner" value={selectedDestUnit} onChange={(e) => setSelectedDestUnit(e.target.value)}>
                            <option value="all">TODAS AS UNIDADES</option>
                            {destinationUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                        </select>
                    ) : (
                        <select className="px-4 py-3 rounded-2xl border border-gray-200 bg-white text-xs font-black uppercase tracking-tighter outline-none shadow-inner" value={flowFilter} onChange={(e) => setFlowFilter(e.target.value as any)}>
                            <option value="all">FLUXO: TODOS</option>
                            <option value="inbound">CHEGADA (DESTINO)</option>
                            <option value="outbound">SAÍDA (ORIGEM)</option>
                        </select>
                    )}
                </div>
            </div>
            
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                {['CIF', 'FOB', 'FATURAR_REMETENTE', 'FATURAR_DEST'].map(type => (
                    <button key={type} onClick={() => togglePaymentFilter(type)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${paymentFilters.includes(type) ? 'bg-primary text-white border-primary shadow-md' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-300'}`}>
                        {type.replace(/_/g, ' ')}
                    </button>
                ))}
                <div className="w-px h-6 bg-gray-200 mx-1"></div>
                <button onClick={() => setNoteFilter(noteFilter === 'with' ? 'without' : noteFilter === 'without' ? 'all' : 'with')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${noteFilter !== 'all' ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white text-gray-400 border-gray-100'}`}>
                    {noteFilter === 'with' ? 'Com Notas' : noteFilter === 'without' ? 'Sem Notas' : 'Notas: Todas'}
                </button>
            </div>
        </div>
      </div>
      
      <div className="hidden md:block glass-panel rounded-3xl overflow-hidden border border-white/50 shadow-sm overflow-x-auto">
        <table className="w-full text-left min-w-[1100px]">
          <thead className="bg-gray-50/50 text-gray-500 text-[10px] uppercase font-black tracking-widest border-b border-gray-100">
            <tr>
              <th className="p-5 cursor-pointer" onClick={() => handleSort('cte')}>CTE / SÉRIE <i className="ph ph-caret-up-down"></i></th>
              <th className="p-5">DESTINATÁRIO</th>
              <th className="p-5 cursor-pointer" onClick={() => handleSort('dataLimite')}>PRAZO / LIMITE <i className="ph ph-caret-up-down"></i></th>
              <th className="p-5">STATUS / PAGAMENTO</th>
              <th className="p-5">ORIGEM / DESTINO</th>
              <th className="p-5 text-right">AÇÕES</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 bg-white/50 backdrop-blur-sm">
            {filteredData.map(item => {
                const noteCount = notes.filter(n => n.cteId === item.id).length;
                return (
                    <tr key={item.id} className="hover:bg-white transition group">
                        <td className="p-5 font-bold text-primary">{item.cte} / {item.serie}</td>
                        <td className="p-5 text-sm font-medium text-gray-700 truncate max-w-[200px]">{item.destinatario}</td>
                        <td className="p-5 text-sm font-bold text-gray-900">{item.dataLimite}</td>
                        <td className="p-5">
                            <div className="flex flex-col gap-1.5 items-start">
                                <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter shadow-sm border ${item.status === 'EM BUSCA' ? 'bg-purple-600 text-white border-purple-800' : getStatusColor(item.computedStatus || 'NO_PRAZO')}`}>{item.status === 'EM BUSCA' ? 'EM BUSCA' : item.computedStatus?.replace(/_/g, ' ')}</span>
                                <button 
                                  onClick={() => togglePaymentFilter(item.fretePago)}
                                  className={`px-2.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest transition-transform hover:scale-105 active:scale-95 ${getPaymentColor(item.fretePago)}`}
                                >
                                  {item.fretePago}
                                </button>
                            </div>
                        </td>
                        <td className="p-5 text-[10px] font-bold text-gray-500"><div className="flex items-center gap-1.5"><span className="truncate max-w-[100px]">{item.coleta}</span><i className="ph-bold ph-arrow-right text-indigo-300"></i><span className="truncate max-w-[100px] text-gray-700">{item.entrega}</span></div></td>
                        <td className="p-5 text-right">
                            <button onClick={() => setSelectedCteId(item.id)} className="relative w-11 h-11 rounded-2xl bg-gray-50 text-gray-500 hover:bg-primary hover:text-white transition shadow-sm border border-gray-100 flex items-center justify-center ml-auto hover:rotate-3">
                                <i className="ph-bold ph-chat-circle-dots text-lg"></i>
                                {noteCount > 0 && <span className="absolute -top-1.5 -right-1.5 bg-indigo-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full border-2 border-white shadow-md">{noteCount}</span>}
                            </button>
                        </td>
                    </tr>
                );
            })}
          </tbody>
        </table>
      </div>
      
      <div className="md:hidden space-y-4">
        {filteredData.map(item => {
            const noteCount = notes.filter(n => n.cteId === item.id).length;
            return (
                <div key={item.id} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100" onClick={() => setSelectedCteId(item.id)}>
                    <div className="flex justify-between items-start mb-3">
                        <div><p className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-0.5">CTE / SÉRIE</p><h4 className="font-black text-primary text-lg leading-tight">{item.cte} / {item.serie}</h4></div>
                        <div className="flex flex-col items-end gap-1">
                            <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter ${item.status === 'EM BUSCA' ? 'bg-purple-600 text-white' : getStatusColor(item.computedStatus || 'NO_PRAZO')}`}>{item.status === 'EM BUSCA' ? 'EM BUSCA' : item.computedStatus?.replace(/_/g, ' ')}</span>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${getPaymentColor(item.fretePago)}`}>{item.fretePago}</span>
                        </div>
                    </div>
                    <div className="mb-4 text-xs font-bold text-gray-700"><p className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-0.5">ORIGEM &rarr; DESTINO</p>{item.coleta} &rarr; {item.entrega}</div>
                    <div className="flex justify-between items-end"><div className="flex flex-col"><span className="text-[9px] font-black text-gray-400 uppercase">LIMITE</span><span className="text-sm font-bold text-gray-800">{item.dataLimite}</span></div>
                        <div className="relative w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                            <i className="ph-bold ph-chat-circle-dots text-xl"></i>
                            {noteCount > 0 && <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full border border-white">{noteCount}</span>}
                        </div>
                    </div>
                </div>
            );
        })}
      </div>
    </div>
  );
}
