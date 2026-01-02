
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
  const [previews, setPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const cteNotes = notes
    .filter(n => n.cteId === cte.id)
    .sort((a, b) => parseDateTime(a.date) - parseDateTime(b.date));

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [cteNotes]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...filesArray]);
      
      const newPreviews: string[] = [];
      for (const file of filesArray) {
        const reader = new FileReader();
        const p = new Promise<string>((resolve) => {
          reader.onload = (ev) => resolve(ev.target?.result as string);
          reader.readAsDataURL(file);
        });
        newPreviews.push(await p);
      }
      setPreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSendNote = async () => {
    if (!newNote.trim() && selectedFiles.length === 0) return;
    setIsSubmitting(true);
    
    try {
      const imagesBase64: string[] = [];
      for (const file of selectedFiles) {
          try { 
            const base64 = await compressImage(file, 1024, 0.7); 
            imagesBase64.push(base64); 
          } catch (e) { 
            console.error("Compression failed", e); 
          }
      }
      
      const success = await addNote(cte.id, newNote, imagesBase64);
      if (success) {
          setNewNote('');
          setSelectedFiles([]);
          setPreviews([]);
          setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 100);
          addToast('Tratativa salva!', 'success');
      } else {
          addToast('Erro ao salvar no servidor!', 'error');
      }
    } catch (err) {
      addToast('Erro ao processar imagens.', 'error');
    } finally {
      setIsSubmitting(false);
    }
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
            <button onClick={onClose} className="absolute top-4 right-4 z-50 bg-white/80 p-2 rounded-full hover:bg-red-100 hover:text-red-500 transition shadow-sm text-gray-500 flex items-center justify-center border border-gray-100"><i className="ph-bold ph-x text-xl"></i></button>
            
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
                    {cteNotes.length === 0 ? (<div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60"><i className="ph-duotone ph-chats text-4xl mb-2"></i><p className="text-sm font-medium">Sem tratativas registradas.</p></div>) : (
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

                <div className="bg-white border-t border-gray-100 shadow-lg">
                    {previews.length > 0 && (
                      <div className="p-3 bg-gray-50 flex gap-3 overflow-x-auto no-scrollbar border-b border-gray-100 animate-fade-in">
                        {previews.map((src, i) => (
                          <div key={i} className="relative w-20 h-20 shrink-0">
                            <img src={src} className="w-full h-full object-cover rounded-xl border-2 border-primary/20 shadow-sm" />
                            <button onClick={() => removeFile(i)} className="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition">
                              <i className="ph-bold ph-x text-xs"></i>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="p-4 flex gap-2 items-center">
                        <label className="p-3 rounded-2xl bg-gray-100 text-gray-500 hover:bg-primary/10 hover:text-primary cursor-pointer border border-gray-200 transition-all flex items-center justify-center shrink-0">
                            <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileSelect} />
                            <i className="ph-bold ph-camera text-2xl"></i>
                        </label>
                        
                        <div className="flex-1 relative">
                            <input 
                              type="text" 
                              value={newNote} 
                              onChange={e => setNewNote(e.target.value)} 
                              placeholder={isSubmitting ? "Enviando..." : "Digite uma tratativa..."} 
                              disabled={isSubmitting}
                              className="w-full pl-4 pr-12 py-3.5 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary/10 outline-none transition-all" 
                              onKeyDown={e => e.key === 'Enter' && !isSubmitting && handleSendNote()}
                            />
                            <button 
                              onClick={handleSendNote} 
                              disabled={isSubmitting || (!newNote.trim() && selectedFiles.length === 0)} 
                              className={`absolute right-1 top-1/2 transform -translate-y-1/2 w-10 h-10 rounded-xl transition-all flex items-center justify-center ${(!newNote.trim() && selectedFiles.length === 0) ? 'text-gray-300' : 'bg-primary text-white shadow-lg active:scale-90'}`}
                            >
                                {isSubmitting ? <i className="ph ph-spinner ph-spin"></i> : <i className="ph-bold ph-paper-plane-right text-lg"></i>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export const PendenciasList = ({ mode }: { mode: 'all' | 'critical' | 'search' }) => {
  const { ctes, notes, currentUser, setSelectedCteId } = useApp();
  const { addToast } = useToast();
  const [filterText, setFilterText] = useState('');
  const [selectedDestUnit, setSelectedDestUnit] = useState<string>('all');
  const [flowFilter, setFlowFilter] = useState<'all' | 'inbound' | 'outbound'>('inbound'); 
  const [paymentFilters, setPaymentFilters] = useState<string[]>([]);
  const [noteFilter, setNoteFilter] = useState<'all' | 'with' | 'without'>('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'dataLimite', direction: 'asc' });

  const role = currentUser?.role.toLowerCase();
  const isAdmin = role === 'admin';
  const isGlobalUser = isAdmin || role === 'leitor' || (!currentUser?.linkedOriginUnit && !currentUser?.linkedDestUnit);

  const destinationUnits = useMemo(() => Array.from(new Set(ctes.map(c => c.entrega).filter(Boolean))).sort(), [ctes]);

  // Set default unit for non-global users and LOCK if linked
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
    
    // 1. Filtragem por texto (Busca Global de CTE) - Ignora travas de unidade
    if (filterText) {
        const term = filterText.toLowerCase();
        data = data.filter(c => 
            c.cte.includes(term) || 
            c.serie.includes(term) || 
            c.destinatario?.toLowerCase().includes(term)
        );
    } else {
        // 2. Filtragem por Unidade e Status - Respeita "EM BUSCA" globalmente
        if (!isGlobalUser) {
            const myDest = currentUser?.linkedDestUnit?.trim().toLowerCase();
            const myOrigin = currentUser?.linkedOriginUnit?.trim().toLowerCase();
            
            data = data.filter(c => {
                // Exceção: Status "EM BUSCA" é global
                if (c.status === 'EM BUSCA') return true;

                // Se o usuário está filtrando por SAÍDA, ignoramos o filtro de unidade destino manual (cadeado)
                // e focamos estritamente na Origem do usuário.
                if (flowFilter === 'outbound') {
                    return myOrigin ? c.coleta.toLowerCase().includes(myOrigin) : false;
                } 

                // Caso contrário (ENTRADA), usamos o destino vinculado ou selecionado
                if (selectedDestUnit !== 'all') {
                    return c.entrega === selectedDestUnit;
                }

                return myDest ? c.entrega.toLowerCase().includes(myDest) : false;
            });
        } else {
            // Usuário sem trava (Admin/Leitor/Global): segue seleção manual
            if (selectedDestUnit !== 'all') {
                data = data.filter(c => c.entrega === selectedDestUnit);
            }
        }
    }

    // 3. Filtragem por Aba de Navegação
    if (mode === 'critical') {
        data = data.filter(c => c.computedStatus === 'CRITICO' && c.status !== 'EM BUSCA');
    } else if (mode === 'search') {
        data = data.filter(c => c.status === 'EM BUSCA');
    } else {
        data = data.filter(c => c.computedStatus !== 'CRITICO' && c.status !== 'EM BUSCA');
    }

    // 4. Filtros de Pagamento e Notas
    if (paymentFilters.length > 0) {
        data = data.filter(c => paymentFilters.some(pf => c.fretePago?.toUpperCase().includes(pf.toUpperCase())));
    }
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

  const handleExport = () => {
    if (filteredData.length === 0) {
      addToast('Não há dados para exportar.', 'warning');
      return;
    }

    const exportData = filteredData.map(item => {
      const cteNotes = notes
        .filter(n => n.cteId === item.id)
        .sort((a, b) => parseDateTime(b.date) - parseDateTime(a.date));
      const lastNote = cteNotes[0]?.text || '';

      return {
        'CTE': item.cte,
        'Série': item.serie,
        'Destinatário': item.destinatario,
        'Data Emissão': item.dataEmissao,
        'Data Limite': item.dataLimite,
        'Status': item.status === 'EM BUSCA' ? 'EM BUSCA' : item.computedStatus?.replace(/_/g, ' '),
        'Pagamento': item.fretePago,
        'Origem': item.coleta,
        'Destino': item.entrega,
        'Última Tratativa': lastNote
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pendencias");
    
    // Nome do arquivo agora inclui o nome do usuário após a data
    const dateFormatted = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    const userName = currentUser?.username || 'desconhecido';
    const fileName = `Export_${mode}_${dateFormatted}_${userName}.xlsx`;
    
    XLSX.writeFile(workbook, fileName);
    addToast('Relatório gerado!', 'success');
  };

  return (
    <div className="space-y-6 pb-20 max-w-full overflow-hidden">
      <div className="glass-panel p-5 rounded-3xl space-y-4 border border-white/50 shadow-sm">
        <div className="flex flex-col xl:flex-row justify-between items-stretch gap-4">
            <div className="flex flex-col md:flex-row items-stretch gap-3 flex-1">
                <div className="relative flex-1 md:max-w-md">
                    <i className="ph-bold ph-magnifying-glass absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    <input type="text" placeholder="Busca Global de CTE..." value={filterText} onChange={(e) => setFilterText(e.target.value)} className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 bg-white outline-none focus:border-primary/40 transition shadow-inner" />
                </div>
                
                <div className="flex gap-2">
                    <div className="relative">
                      <select 
                        disabled={!isGlobalUser}
                        className={`pl-10 pr-4 py-3 rounded-2xl border border-gray-200 bg-white text-xs font-black uppercase tracking-tighter outline-none shadow-inner appearance-none min-w-[200px] ${!isGlobalUser ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`} 
                        value={selectedDestUnit} 
                        onChange={(e) => setSelectedDestUnit(e.target.value)}
                      >
                        <option value="all">TODAS AS UNIDADES</option>
                        {destinationUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                      </select>
                      <i className={`ph-bold ${isGlobalUser ? 'ph-map-pin' : 'ph-lock-key'} absolute left-4 top-1/2 transform -translate-y-1/2 text-indigo-400`}></i>
                    </div>
                    
                    {!isGlobalUser && (
                        <select className="px-4 py-3 rounded-2xl border border-gray-200 bg-white text-xs font-black uppercase tracking-tighter outline-none shadow-inner" value={flowFilter} onChange={(e) => setFlowFilter(e.target.value as any)}>
                            <option value="inbound">MEU FLUXO ENTRADA</option>
                            <option value="outbound">MEU FLUXO SAÍDA</option>
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
                
                <button 
                  onClick={handleExport}
                  title="Exportar Excel"
                  className="ml-2 h-9 w-10 md:w-12 rounded-xl bg-green-50 text-green-600 border border-green-200 hover:bg-green-600 hover:text-white transition-all flex items-center justify-center shrink-0 shadow-sm active:scale-90"
                >
                  <i className="ph-bold ph-file-xls text-xl"></i>
                </button>
            </div>
        </div>
      </div>
      
      <div className="hidden md:block glass-panel rounded-3xl border border-white/50 shadow-sm overflow-x-auto relative">
        <table className="w-full text-left border-separate border-spacing-0 table-fixed min-w-[1250px]">
          <colgroup>
            <col style={{ width: '130px' }} />
            <col style={{ width: '280px' }} />
            <col style={{ width: '140px' }} />
            <col style={{ width: '180px' }} />
            <col style={{ width: '320px' }} />
            <col style={{ width: '100px' }} />
          </colgroup>
          <thead className="bg-gray-50/90 text-gray-500 text-[10px] uppercase font-black tracking-widest sticky top-0 z-20 backdrop-blur-md">
            <tr>
              <th className="p-4 pl-6 cursor-pointer border-b border-gray-100" onClick={() => handleSort('cte')}>CTE / SÉRIE <i className="ph ph-caret-up-down ml-1"></i></th>
              <th className="p-4 border-b border-gray-100">DESTINATÁRIO</th>
              <th className="p-4 cursor-pointer border-b border-gray-100" onClick={() => handleSort('dataLimite')}>LIMITE <i className="ph ph-caret-up-down ml-1"></i></th>
              <th className="p-4 border-b border-gray-100">STATUS / PAGTO</th>
              <th className="p-4 border-b border-gray-100">ORIGEM / DESTINO</th>
              <th className="p-4 text-right pr-8 border-b border-gray-100">AÇÕES</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 bg-white/50">
            {filteredData.map(item => {
                const cteNotes = notes.filter(n => n.cteId === item.id);
                const noteCount = cteNotes.length;
                const lastNote = [...cteNotes].sort((a,b) => parseDateTime(b.date) - parseDateTime(a.date))[0];
                const badgeColor = (lastNote && lastNote.user !== currentUser?.username) ? 'bg-red-600' : 'bg-indigo-600';

                return (
                    <tr key={item.id} className="hover:bg-white/80 transition group h-20">
                        <td className="p-4 pl-6 font-bold text-primary truncate">{item.cte} / {item.serie}</td>
                        <td className="p-4">
                            <div className="text-[11px] font-semibold text-gray-700 line-clamp-2" title={item.destinatario}>
                                {item.destinatario}
                            </div>
                        </td>
                        <td className="p-4 text-xs font-black text-gray-900">{item.dataLimite}</td>
                        <td className="p-4">
                            <div className="flex flex-col gap-1 items-start">
                                <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-tighter shadow-sm border ${item.status === 'EM BUSCA' ? 'bg-purple-600 text-white border-purple-800' : getStatusColor(item.computedStatus || 'NO_PRAZO')}`}>{item.status === 'EM BUSCA' ? 'EM BUSCA' : item.computedStatus?.replace(/_/g, ' ')}</span>
                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${getPaymentColor(item.fretePago)}`}>{item.fretePago}</span>
                            </div>
                        </td>
                        <td className="p-4">
                            <div className="text-[10px] font-bold text-gray-500 flex items-center gap-1.5 flex-wrap">
                                <span className="max-w-[130px] truncate">{item.coleta}</span>
                                <i className="ph-bold ph-arrow-right text-indigo-300"></i>
                                <span className="max-w-[130px] truncate text-gray-800">{item.entrega}</span>
                            </div>
                        </td>
                        <td className="p-4 text-right pr-8">
                            <button onClick={() => setSelectedCteId(item.id)} className="relative w-10 h-10 rounded-2xl bg-gray-100 text-gray-500 hover:bg-primary hover:text-white transition shadow-sm border border-gray-200 flex items-center justify-center ml-auto active:scale-90">
                                <i className="ph-bold ph-chat-circle-dots text-lg"></i>
                                {noteCount > 0 && (
                                  <span className={`absolute -top-1.5 -right-1.5 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full border-2 border-white animate-pulse ${badgeColor}`}>
                                    {noteCount}
                                  </span>
                                )}
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
            const cteNotes = notes.filter(n => n.cteId === item.id);
            const noteCount = cteNotes.length;
            return (
                <div key={item.id} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 active:bg-gray-50" onClick={() => setSelectedCteId(item.id)}>
                    <div className="flex justify-between mb-3">
                        <h4 className="font-black text-primary text-base">{item.cte} / {item.serie}</h4>
                        <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${item.status === 'EM BUSCA' ? 'bg-purple-600 text-white' : getStatusColor(item.computedStatus || 'NO_PRAZO')}`}>{item.status === 'EM BUSCA' ? 'EM BUSCA' : item.computedStatus?.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="text-[11px] font-bold text-gray-600 mb-3">{item.coleta} &rarr; {item.entrega}</div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-black text-gray-900">{item.dataLimite}</span>
                        <div className="relative w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <i className="ph-bold ph-chat-circle-dots text-xl"></i>
                            {noteCount > 0 && <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">{noteCount}</span>}
                        </div>
                    </div>
                </div>
            );
        })}
      </div>
    </div>
  );
}
