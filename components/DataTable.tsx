import React, { useState, useMemo } from 'react';
import { CteData } from '../types';
import StatusBadge from './StatusBadge';
import { MessageSquare, Filter, X, CheckCircle, Package, ArrowUpDown, ArrowUp, ArrowDown, FileSpreadsheet, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import clsx from 'clsx';
import { COLORS } from '../constants';

interface Props {
  data: CteData[];
  onNoteClick: (cte: CteData) => void;
  title: string;
  isPendencyView?: boolean;
  isCriticalView?: boolean;
  enableFilters?: boolean; // New prop to force enable filters
}

type SortDirection = 'asc' | 'desc';
interface SortConfig {
  key: keyof CteData | 'STATUS_CALCULADO' | 'VALOR_NUMBER' | 'DATA_LIMITE_DATE';
  direction: SortDirection;
}

const DataTable: React.FC<Props> = ({ data, onNoteClick, title, isPendencyView = false, isCriticalView = false, enableFilters = false }) => {
  const { user } = useAuth();
  const { notes, getLatestNote } = useData();

  // --- Filter State ---
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [paymentFilters, setPaymentFilters] = useState<string[]>([]);
  const [noteFilter, setNoteFilter] = useState<'ALL' | 'WITH' | 'WITHOUT'>('ALL');
  const [globalSearch, setGlobalSearch] = useState('');
  
  // --- Sort State ---
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'DATA_LIMITE_DATE', direction: 'asc' });

  // --- Constants ---
  const STATUS_OPTIONS = useMemo(() => {
    if (isPendencyView) {
        return ['FORA DO PRAZO', 'PRIORIDADE', 'VENCE AMANHÃ', 'NO PRAZO'];
    }
    if (isCriticalView) {
        return ['CRÍTICO'];
    }
    return ['CRÍTICO', 'FORA DO PRAZO', 'PRIORIDADE', 'VENCE AMANHÃ', 'NO PRAZO'];
  }, [isPendencyView, isCriticalView]);

  const PAYMENT_OPTIONS = ['CIF', 'FOB', 'FATURAR_REMETENTE', 'FATURAR_DEST'];
  
  const STATUS_COLORS_MAP: Record<string, string> = {
    'CRÍTICO': COLORS.critical,
    'FORA DO PRAZO': COLORS.late,
    'PRIORIDADE': COLORS.priority,
    'VENCE AMANHÃ': COLORS.tomorrow,
    'NO PRAZO': COLORS.ontime,
  };

  const PAYMENT_COLORS_MAP: Record<string, string> = {
    'CIF': '#10b981',
    'FOB': '#ef4444',
    'FATURAR_REMETENTE': '#eab308',
    'FATURAR_DEST': '#f97316'
  };

  // --- Helpers ---
  const toggleFilter = (list: string[], item: string) => {
    return list.includes(item) ? list.filter(i => i !== item) : [...list, item];
  };

  const getNoteCount = (cte: string) => notes.filter(n => n.CTE === cte).length;

  const parseCurrency = (value: string) => {
    if (!value) return 0;
    return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
  };

  const parseDate = (dateStr: string) => {
    if (!dateStr) return 0;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return 0;
    return parseInt(`${parts[2]}${parts[1]}${parts[0]}`);
  };

  // --- Sorting Handler ---
  const handleSort = (key: SortConfig['key']) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // --- Data Processing ---
  const availableUnits = useMemo(() => {
    const units = new Set(data.map(d => d.ENTREGA).filter(Boolean));
    return Array.from(units).sort();
  }, [data]);

  const filteredData = useMemo(() => {
    if (globalSearch.trim().length > 0) {
      const term = globalSearch.toLowerCase();
      return data.filter(d => 
        d.CTE.toLowerCase().includes(term) ||
        d.DESTINATARIO.toLowerCase().includes(term) ||
        d.ENTREGA.toLowerCase().includes(term) ||
        d.SERIE.toLowerCase().includes(term)
      );
    }

    let result = data;

    // Strict view filtering handled by App.tsx, but kept here for safety in case data prop isn't filtered
    if (isPendencyView) {
      result = result.filter(d => d.STATUS_CALCULADO !== 'CRÍTICO');
    }

    const effectiveUnit = user?.linkedDestUnit || selectedUnit;
    if (effectiveUnit) {
      result = result.filter(d => d.ENTREGA === effectiveUnit);
    }

    if (statusFilters.length > 0) {
      result = result.filter(d => statusFilters.includes(d.STATUS_CALCULADO || ''));
    }

    if (paymentFilters.length > 0) {
      result = result.filter(d => paymentFilters.includes(d.FRETE_PAGO || ''));
    }

    if (noteFilter !== 'ALL') {
      result = result.filter(d => {
        const count = getNoteCount(d.CTE);
        return noteFilter === 'WITH' ? count > 0 : count === 0;
      });
    }

    return result;
  }, [data, isPendencyView, user, selectedUnit, statusFilters, paymentFilters, noteFilter, notes, globalSearch]);

  const sortedData = useMemo(() => {
    const sorted = [...filteredData];
    sorted.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      switch (sortConfig.key) {
        case 'VALOR_NUMBER':
          valA = parseCurrency(a.VALOR_CTE);
          valB = parseCurrency(b.VALOR_CTE);
          break;
        case 'DATA_LIMITE_DATE':
          valA = parseDate(a.DATA_LIMITE_BAIXA);
          valB = parseDate(b.DATA_LIMITE_BAIXA);
          break;
        case 'CTE':
          valA = parseInt(a.CTE) || 0;
          valB = parseInt(b.CTE) || 0;
          break;
        case 'STATUS_CALCULADO':
          valA = a.STATUS_CALCULADO || a.STATUS || '';
          valB = b.STATUS_CALCULADO || b.STATUS || '';
          break;
        default:
          // @ts-ignore
          valA = a[sortConfig.key] || '';
          // @ts-ignore
          valB = b[sortConfig.key] || '';
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredData, sortConfig]);

  // --- Export ---
  const handleExport = () => {
    // Export with Latest Note Details included
    const exportData = sortedData.map(d => {
        const latestNote = getLatestNote(d.CTE);
        return {
            CTE: d.CTE,
            SERIE: d.SERIE,
            CODIGO: d.CODIGO,
            DATA_EMISSAO: d.DATA_EMISSAO,
            DATA_LIMITE: d.DATA_LIMITE_BAIXA,
            STATUS_ATUAL: d.STATUS_CALCULADO || d.STATUS,
            UNIDADE_DESTINO: d.ENTREGA,
            CLIENTE: d.DESTINATARIO,
            VALOR: d.VALOR_CTE,
            QTD_NOTAS: getNoteCount(d.CTE),
            ULTIMA_NOTA_TEXTO: latestNote ? latestNote.TEXTO : '',
            ULTIMA_NOTA_USUARIO: latestNote ? latestNote.USUARIO : '',
            ULTIMA_NOTA_DATA: latestNote ? latestNote.DATA : ''
        };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendencias_Atualizadas");
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Relatorio_SLE_${title.replace(/\s/g, '_')}_${dateStr}.xlsx`);
  };

  // Counts for filters
  const getCount = (filterType: 'status' | 'payment' | 'note', key: string) => {
      let base = data;
      // Consistent filtering for counts
      if (isPendencyView) {
        base = base.filter(d => d.STATUS_CALCULADO !== 'CRÍTICO');
      }
      
      const effectiveUnit = user?.linkedDestUnit || selectedUnit;
      if (effectiveUnit) base = base.filter(d => d.ENTREGA === effectiveUnit);

      if (filterType === 'status') return base.filter(d => d.STATUS_CALCULADO === key).length;
      if (filterType === 'payment') return base.filter(d => d.FRETE_PAGO === key).length;
      if (filterType === 'note') {
         return base.filter(d => {
             const count = getNoteCount(d.CTE);
             return key === 'WITH' ? count > 0 : count === 0;
         }).length;
      }
      return 0;
  };

  const showFilters = isPendencyView || enableFilters;

  // --- Internal Components (defined here to access state/handlers) ---
  
  const SortHeader = ({ label, sortKey }: { label: string, sortKey: SortConfig['key'] }) => (
    <th 
      className="px-4 py-3 cursor-pointer group hover:bg-gray-100 transition-colors select-none"
      onClick={() => handleSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        <div className="text-gray-400 group-hover:text-primary-600">
           {sortConfig.key === sortKey ? (
               sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
           ) : (
               <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-50" />
           )}
        </div>
      </div>
    </th>
  );

  const FilterCard = ({ label, count, color, selected, onClick }: { label: string, count: number, color: string, selected: boolean, onClick: () => void }) => (
    <div 
        onClick={onClick}
        className={clsx(
            "rounded-lg p-2 border transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden group hover:shadow-sm min-h-[60px]",
            selected 
                ? "bg-white ring-1 ring-inset" 
                : "bg-gray-50 border-gray-200 hover:bg-white"
        )}
        style={{ 
            borderColor: selected ? color : undefined, 
            backgroundColor: selected ? `${color}08` : undefined
        }}
    >
        {selected && (
            <div className="absolute top-1 right-1">
                <CheckCircle size={12} fill={color} className="text-white" />
            </div>
        )}
        <span className="font-bold text-[10px] uppercase tracking-wider text-gray-500 truncate block pr-3" style={{ color: selected ? color : undefined }}>
            {label}
        </span>
        <div className="mt-1">
            <span className="text-lg font-bold text-gray-800 leading-none">{count}</span>
        </div>
        <div className="absolute bottom-0 left-0 h-0.5 w-full transition-all" style={{ backgroundColor: color, opacity: selected ? 1 : 0.3 }} />
    </div>
  );

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      
      {/* --- Global Search Section --- */}
      <div className="relative">
         <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="text-gray-400" size={20} />
         </div>
         <input 
            type="text"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Busca Global (CTE, Destinatário, Unidade)..."
            className={clsx(
                "w-full pl-10 pr-4 py-3 rounded-lg border focus:ring-2 focus:ring-primary-500 outline-none transition-all shadow-sm text-gray-900",
                globalSearch ? "bg-primary-50 border-primary-300 ring-2 ring-primary-100" : "bg-white border-gray-200"
            )}
         />
         {globalSearch && (
            <div className="absolute right-3 top-3 text-xs text-primary-600 font-bold animate-pulse">
                Buscando em toda a base...
            </div>
         )}
      </div>

      {/* --- Filter Section --- */}
      {showFilters && (
        <div className={clsx("space-y-3 bg-white p-4 rounded-xl shadow-sm border border-gray-200 transition-opacity", globalSearch ? "opacity-50 pointer-events-none grayscale" : "opacity-100")}>
            {/* Header / Unit Selector */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <Filter size={18} className="text-primary-600" />
                    Filtros
                </h2>
                
                {/* Unit Selector */}
                <div className="w-full md:w-auto">
                    {user?.linkedDestUnit ? (
                        <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 cursor-not-allowed">
                            <Package size={14} />
                            <span className="font-bold text-xs">{user.linkedDestUnit}</span>
                        </div>
                    ) : (
                        <select 
                            value={selectedUnit}
                            onChange={(e) => setSelectedUnit(e.target.value)}
                            className="w-full md:w-64 appearance-none bg-gray-50 border border-gray-200 text-gray-700 py-2 px-3 rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer"
                        >
                            <option value="">Todas as Unidades</option>
                            {availableUnits.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                    )}
                </div>
            </div>

            {/* Filter Grids */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {/* Status Cards - Hide in Critical View */}
                {!isCriticalView && STATUS_OPTIONS.map(status => (
                    <FilterCard 
                        key={status}
                        label={status}
                        count={getCount('status', status)}
                        color={STATUS_COLORS_MAP[status]}
                        selected={statusFilters.includes(status)}
                        onClick={() => setStatusFilters(prev => toggleFilter(prev, status))}
                    />
                ))}

                 <FilterCard 
                    label="Com Anotações"
                    count={getCount('note', 'WITH')}
                    color={COLORS.priority} 
                    selected={noteFilter === 'WITH'}
                    onClick={() => setNoteFilter(prev => prev === 'WITH' ? 'ALL' : 'WITH')}
                 />
                 <FilterCard 
                    label="Sem Anotações"
                    count={getCount('note', 'WITHOUT')}
                    color="#6b7280" 
                    selected={noteFilter === 'WITHOUT'}
                    onClick={() => setNoteFilter(prev => prev === 'WITHOUT' ? 'ALL' : 'WITHOUT')}
                 />
            </div>
            
             <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-gray-100">
                {PAYMENT_OPTIONS.map(pay => (
                    <div 
                        key={pay}
                        onClick={() => setPaymentFilters(prev => toggleFilter(prev, pay))}
                        className={clsx(
                            "flex items-center justify-between px-3 py-1.5 rounded-lg border cursor-pointer transition-colors",
                            paymentFilters.includes(pay) 
                              ? "bg-white shadow-sm ring-1 ring-inset" 
                              : "bg-gray-50 border-gray-100 hover:bg-gray-100"
                        )}
                        style={{ borderColor: paymentFilters.includes(pay) ? PAYMENT_COLORS_MAP[pay] : undefined }}
                    >
                        <div className="flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PAYMENT_COLORS_MAP[pay] }} />
                           <span className="text-[10px] font-bold text-gray-600">{pay.replace('_', ' ')}</span>
                        </div>
                        <span className="text-[10px] font-bold text-gray-800">{getCount('payment', pay)}</span>
                    </div>
                ))}
             </div>
             
             {(statusFilters.length > 0 || paymentFilters.length > 0 || noteFilter !== 'ALL') && (
                 <button 
                    onClick={() => { setStatusFilters([]); setPaymentFilters([]); setNoteFilter('ALL'); }}
                    className="w-full py-1.5 text-xs text-red-500 font-bold hover:bg-red-50 rounded transition-colors flex items-center justify-center gap-1"
                 >
                    <X size={12} /> Limpar Filtros
                 </button>
             )}
        </div>
      )}

      <div className="flex justify-between items-center mb-4 mt-6">
        <h2 className="text-xl font-bold text-primary-900">{title} <span className="text-gray-400 text-sm font-normal">({filteredData.length})</span></h2>
        <button 
          onClick={handleExport}
          className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 text-sm font-medium shadow-sm flex items-center gap-2 transition-colors"
        >
          <FileSpreadsheet size={18} />
          Exportar Excel
        </button>
      </div>

      <div className="hidden md:block overflow-x-auto bg-white rounded-lg shadow border border-gray-200">
        <table className="w-full text-sm text-left">
          <thead className="bg-primary-50 text-primary-900 uppercase font-bold text-xs">
            <tr>
              <SortHeader label="Status" sortKey="STATUS_CALCULADO" />
              <SortHeader label="CTE / Série" sortKey="CTE" />
              <SortHeader label="Data Limite" sortKey="DATA_LIMITE_DATE" />
              <SortHeader label="Unid. Destino / Cliente" sortKey="DESTINATARIO" />
              <SortHeader label="Valor" sortKey="VALOR_NUMBER" />
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedData.map((row, idx) => {
              const noteCount = getNoteCount(row.CTE);
              const rowHasNotes = noteCount > 0;
              return (
                <tr key={`${row.CTE}-${idx}`} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      <StatusBadge 
                          status={row.STATUS_CALCULADO || row.STATUS} 
                          onClick={() => showFilters && row.STATUS_CALCULADO && setStatusFilters(prev => toggleFilter(prev, row.STATUS_CALCULADO!))}
                      />
                      <StatusBadge 
                          status={row.FRETE_PAGO} 
                          onClick={() => showFilters && setPaymentFilters(prev => toggleFilter(prev, row.FRETE_PAGO))}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{row.CTE}</div>
                    <div className="text-xs text-gray-500">Série: {row.SERIE}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      "font-bold",
                      row.STATUS_CALCULADO === 'FORA DO PRAZO' ? 'text-red-600' : 'text-gray-700'
                    )}>
                      {row.DATA_LIMITE_BAIXA}
                    </span>
                  </td>
                  <td className="px-4 py-3 truncate max-w-xs">
                    <div className="truncate text-xs text-primary-600 font-bold uppercase mb-0.5" title={row.ENTREGA}>
                        {row.ENTREGA}
                    </div>
                    <div className="truncate font-medium text-gray-800" title={row.DESTINATARIO}>
                        {row.DESTINATARIO}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-gray-700">
                    {row.VALOR_CTE}
                  </td>
                  <td className="px-4 py-3">
                    <button 
                      onClick={() => onNoteClick(row)}
                      className={clsx(
                        "p-2 rounded-full relative transition-all group",
                        rowHasNotes 
                          ? "text-orange-500 bg-orange-50 hover:bg-orange-100" 
                          : "text-gray-400 hover:text-primary-600 hover:bg-gray-100"
                      )}
                      title={rowHasNotes ? "Ver Anotações" : "Adicionar Nota"}
                    >
                      <div className="relative">
                        <MessageSquare size={18} fill={rowHasNotes ? "currentColor" : "none"} className={rowHasNotes ? "fill-orange-500/20" : ""} />
                        {rowHasNotes && (
                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold shadow-sm border border-white">
                                {noteCount}
                            </span>
                        )}
                      </div>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredData.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">Nenhum resultado para os filtros aplicados.</div>}
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {sortedData.map((row, idx) => {
           const noteCount = getNoteCount(row.CTE);
           const rowHasNotes = noteCount > 0;
           return (
            <div key={`${row.CTE}-${idx}`} className="bg-white p-4 rounded-lg shadow border-l-4 border-primary-500">
              <div className="flex justify-between items-start mb-2">
                <div>
                    <div className="text-lg font-bold text-gray-900">CTE {row.CTE}</div>
                    <div className="text-xs text-gray-500">Série {row.SERIE}</div>
                </div>
                <div className="flex flex-col gap-1 items-end">
                    <StatusBadge status={row.STATUS_CALCULADO || row.STATUS} />
                    <StatusBadge 
                        status={row.FRETE_PAGO} 
                        onClick={() => showFilters && setPaymentFilters(prev => toggleFilter(prev, row.FRETE_PAGO))}
                    />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm text-gray-700 mb-3">
                <div>
                  <span className="block text-xs text-gray-400">Limite</span>
                  <span className={clsx("font-bold", row.STATUS_CALCULADO === 'FORA DO PRAZO' ? 'text-red-600' : 'text-gray-700')}>
                    {row.DATA_LIMITE_BAIXA}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-gray-400">Valor</span>
                  <span className="font-mono font-bold">{row.VALOR_CTE}</span>
                </div>
                <div className="col-span-2 mt-1 pt-1 border-t border-gray-50">
                   <div className="flex flex-col">
                       <span className="text-[10px] uppercase font-bold text-primary-600">{row.ENTREGA}</span>
                       <span className="font-medium truncate text-gray-800">{row.DESTINATARIO}</span>
                   </div>
                </div>
              </div>

              <div className="flex justify-end border-t pt-2">
                  <button 
                    onClick={() => onNoteClick(row)}
                    className={clsx(
                      "flex items-center font-medium text-sm transition-colors",
                      rowHasNotes ? "text-orange-500" : "text-gray-500 hover:text-primary-600"
                    )}
                  >
                    <MessageSquare size={16} className="mr-1" fill={rowHasNotes ? "currentColor" : "none"} />
                    {rowHasNotes ? `Ver Notas (${noteCount})` : 'Adicionar Nota'}
                  </button>
              </div>
            </div>
           );
        })}
         {filteredData.length === 0 && <div className="p-8 text-center text-gray-400 text-sm bg-white rounded-lg border border-dashed">Nenhum resultado.</div>}
      </div>
    </div>
  );
};

export default DataTable;