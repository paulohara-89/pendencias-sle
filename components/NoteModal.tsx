import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Camera, Image as ImageIcon, Paperclip, Loader2, Trash2, Clock, CheckCircle2, SearchCheck, MapPin, ZoomIn, AlertCircle, Check, AlertTriangle } from 'lucide-react';
import { CteData, NoteData } from '../types';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import clsx from 'clsx';

interface Props {
  cte: CteData | null;
  onClose: () => void;
}

// --- Helpers ---

// 1. Convert Google Drive Viewer Links to Embeddable Image Links
const formatImageUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('data:')) return url; // Base64 is already valid

  // Extract ID from common Drive URL patterns
  const idMatch = url.match(/[-\w]{25,}/);
  if (!idMatch) return url;
  
  const id = idMatch[0];
  // Use the thumbnail API with size=w1000 for a reliable, large preview without auth redirects/CORS issues
  return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
};

// 2. Compress Image before converting to Base64 (Fixes GAS Payload Limit)
const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800; // Resize to max 800px width
                const scaleSize = MAX_WIDTH / img.width;
                const newWidth = (img.width > MAX_WIDTH) ? MAX_WIDTH : img.width;
                const newHeight = (img.width > MAX_WIDTH) ? img.height * scaleSize : img.height;

                canvas.width = newWidth;
                canvas.height = newHeight;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject('Canvas context failed');
                    return;
                }
                ctx.drawImage(img, 0, 0, newWidth, newHeight);
                
                // Compress to JPEG with 0.7 quality
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                resolve(compressedBase64);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};

// Subcomponent to handle individual image state and errors
const NoteAttachment = ({ url, onPreview }: { url: string, onPreview: (url: string) => void }) => {
  const [hasError, setHasError] = useState(false);
  const displayUrl = formatImageUrl(url);

  if (hasError) {
    return (
       <a 
          href={url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 hover:bg-red-100 transition-colors"
          onClick={(e) => e.stopPropagation()}
       >
          <AlertCircle size={14} />
          Erro na prévia. Abrir link externo
       </a>
    );
  }

  return (
    <div className="mt-2">
        <button 
          type="button"
          onClick={() => onPreview(displayUrl)} 
          className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 transition-colors w-fit px-2 py-1.5 rounded font-medium border border-blue-100 mb-2"
          title="Visualizar Imagem"
        >
          <ImageIcon size={14} /> Ver Imagem Anexada
        </button>
        
        <div 
            className="h-24 w-24 rounded border border-gray-200 overflow-hidden cursor-pointer relative group/img bg-gray-50"
            onClick={() => onPreview(displayUrl)}
        >
            <img 
                src={displayUrl} 
                referrerPolicy="no-referrer"
                alt="Preview" 
                className="w-full h-full object-cover"
                loading="lazy"
                onError={() => setHasError(true)}
            />
            <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-center justify-center">
                <ZoomIn className="text-white opacity-0 group-hover/img:opacity-100 transition-opacity" size={20} />
            </div>
        </div>
    </div>
  );
};

const NoteModal: React.FC<Props> = ({ cte, onClose }) => {
  const { notes, addNote, resolveIssue, baseData, isCteEmBusca, getLatestNote, processControlData } = useData();
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [isSearch, setIsSearch] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>('');
  
  // State for Image Preview (Lightbox)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  
  // State for Resolution Checkbox and Confirmation
  const [resolveChecked, setResolveChecked] = useState(false);
  const [showConfirmResolve, setShowConfirmResolve] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  
  if (!cte) return null;

  // Use baseData to ensure we get the absolute latest status from the spreadsheet if available
  // Fix: Use loose comparison for SERIE (ignore leading zeros) to correctly find the live object
  const normalizeSerie = (s: string) => String(s).replace(/^0+/, '');
  const liveCte = baseData.find(c => 
      c.CTE === cte.CTE && 
      normalizeSerie(c.SERIE) === normalizeSerie(cte.SERIE)
  ) || cte;

  const currentNotes = notes.filter(n => n.CTE === cte.CTE);
  
  const isCurrentlyEmBusca = isCteEmBusca(liveCte.CTE, liveCte.SERIE, liveCte.STATUS);
  
  const latestNote = getLatestNote(liveCte.CTE);
  const baseResolved = liveCte.STATUS === 'RESOLVIDO' || liveCte.STATUS === 'LOCALIZADA';
  const noteResolved = latestNote && (latestNote.STATUS_BUSCA === 'RESOLVIDO' || latestNote.STATUS_BUSCA === 'LOCALIZADA');
  
  const processHistory = processControlData.filter(p => 
    p.CTE === liveCte.CTE && 
    normalizeSerie(p.SERIE || '') === normalizeSerie(liveCte.SERIE || '')
  );
  const lastProcess = processHistory.length > 0 ? processHistory[processHistory.length - 1] : null;
  const processResolved = lastProcess?.STATUS === 'RESOLVIDO' || lastProcess?.STATUS === 'LOCALIZADA';

  // Combined Resolution Status
  const isResolvido = noteResolved || baseResolved || processResolved;
  
  // Display green banner if technically resolved OR if user has checked the box (pending confirmation)
  const showGreenBanner = isResolvido || resolveChecked;
  // Display red banner only if Em Busca AND not showing green
  const showEmBuscaBanner = isCurrentlyEmBusca && !showGreenBanner;

  const handleCameraClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageName(file.name);
      try {
          const compressed = await compressImage(file);
          setSelectedImage(compressed);
      } catch (e) {
          alert("Erro ao processar imagem. Tente uma imagem menor.");
          removeImage();
      }
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImageName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleResolveCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setResolveChecked(checked);
    
    if (checked) {
        // Show custom confirmation dialog instead of window.confirm
        setShowConfirmResolve(true);
    } else {
        setShowConfirmResolve(false);
    }
  };

  const confirmResolveAction = async () => {
      setShowConfirmResolve(false);
      try {
          await resolveIssue(cte.CTE, cte.SERIE);
      } catch (err) {
          setResolveChecked(false);
      }
  };

  const cancelResolveAction = () => {
      setResolveChecked(false);
      setShowConfirmResolve(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !selectedImage) return;

    setIsSending(true);
    const noteUser = user?.username || 'Sistema';

    try {
      await addNote({
        CTE: cte.CTE,
        SERIE: cte.SERIE || '',
        CODIGO: cte.CODIGO,
        DATA: '', 
        USUARIO: noteUser,
        TEXTO: text,
        LINK_IMAGEM: '', 
        STATUS_BUSCA: isSearch ? 'EM BUSCA' : '',
        base64Image: selectedImage || undefined 
      });

      setText('');
      setIsSearch(false);
      removeImage();
    } catch (error) {
      alert('Erro ao enviar anotação. Tente novamente.');
    } finally {
      setIsSending(false);
    }
  };

  const handleOpenPreview = (url: string) => {
      setPreviewUrl(url);
      setPreviewError(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      
      {/* Lightbox Overlay */}
      {previewUrl && (
        <div 
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewUrl(null)}
        >
          <button 
            type="button"
            className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full bg-white/10 z-[70]"
            onClick={(e) => { e.stopPropagation(); setPreviewUrl(null); }}
          >
            <X size={32} />
          </button>
          
          {previewError ? (
              <div className="bg-white p-8 rounded-lg text-center max-w-sm" onClick={(e) => e.stopPropagation()}>
                  <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-gray-800 mb-2">Não foi possível carregar a imagem</h3>
                  <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="bg-primary-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-primary-700 transition-colors inline-block">Abrir no Navegador</a>
              </div>
          ) : (
            <img 
                src={previewUrl} 
                referrerPolicy="no-referrer"
                alt="Preview Full" 
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()} 
                onError={() => setPreviewError(true)}
            />
          )}
        </div>
      )}

      {/* Confirmation Dialog Overlay */}
      {showConfirmResolve && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center p-4 bg-black/20 backdrop-blur-[1px] rounded-xl">
             <div className="bg-white p-6 rounded-xl shadow-2xl border border-gray-200 w-full max-w-sm animate-in zoom-in-95 duration-200">
                 <div className="flex flex-col items-center text-center">
                     <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-4">
                         <Check size={28} />
                     </div>
                     <h3 className="text-lg font-bold text-gray-800 mb-2">Gravar como Localizada?</h3>
                     <p className="text-sm text-gray-600 mb-6">
                         A mercadoria será marcada como encontrada e removida da lista de busca. O status mudará para <strong className="text-green-600">RESOLVIDO</strong>.
                     </p>
                     <div className="flex gap-3 w-full">
                         <button 
                             onClick={cancelResolveAction}
                             className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition-colors"
                         >
                             Não
                         </button>
                         <button 
                             onClick={confirmResolveAction}
                             className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg shadow-green-500/30 transition-colors"
                         >
                             Sim, Gravar
                         </button>
                     </div>
                 </div>
             </div>
        </div>
      )}

      <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-gray-200 relative z-50">
        {/* Header */}
        <div className="bg-primary-900 p-4 text-white flex justify-between items-center shadow-md shrink-0">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              CTE {cte.CTE}
              <span className="bg-primary-700 text-[10px] px-2 py-0.5 rounded-full font-mono">{cte.SERIE}</span>
            </h3>
            <span className="text-xs text-primary-200">Justificativas e Histórico</span>
          </div>
          <button onClick={onClose} className="hover:bg-primary-700 p-1.5 rounded-full transition-colors"><X size={20}/></button>
        </div>
        
        {/* Banner */}
        {showGreenBanner ? (
             <div className="bg-green-100 p-3 border-b border-green-300 flex items-center justify-center shrink-0 animate-in slide-in-from-top-2 shadow-inner">
                 <span className="text-sm font-black text-green-800 flex items-center gap-2 uppercase tracking-wide">
                    <CheckCircle2 size={18} fill="currentColor" className="text-green-600" />
                    MERCADORIA LOCALIZADA
                 </span>
             </div>
        ) : showEmBuscaBanner && (
             <div className="bg-red-50 p-2 border-b border-red-100 flex items-center justify-center shrink-0">
                 <span className="text-xs font-bold text-red-700 flex items-center gap-2 px-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    MERCADORIA EM BUSCA
                 </span>
             </div>
        )}

        {/* Chat Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 scroll-smooth">
          {currentNotes.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
               <div className="bg-gray-100 p-3 rounded-full">
                 <ImageIcon size={24} className="opacity-20" />
               </div>
               <span className="text-sm">Nenhuma nota registrada.</span>
            </div>
          )}
          {currentNotes.map((note, idx) => {
            const imageSource = note.LINK_IMAGEM || (note as any).base64Image;
            const isPending = note.pending;
            
            return (
              <div 
                key={idx} 
                className={clsx(
                    "flex flex-col p-3 rounded-lg shadow-sm border relative group transition-all",
                    isPending 
                        ? "bg-orange-100/60 border-orange-200 opacity-80" 
                        : "bg-white border-gray-100 hover:shadow-md"
                )}
              >
                 <div className="flex justify-between items-center text-xs text-gray-500 mb-2 pb-2 border-b border-gray-50">
                   <div className="flex items-center gap-1.5">
                      <div className={clsx(
                          "w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px]",
                          isPending ? "bg-orange-200 text-orange-800" : "bg-primary-100 text-primary-700"
                      )}>
                          {(note.USUARIO || '?').charAt(0).toUpperCase()}
                      </div>
                      <span className={clsx("font-bold", isPending ? "text-orange-800" : "text-primary-700")}>{note.USUARIO || 'Desconhecido'}</span>
                   </div>
                   <div className="flex items-center gap-2">
                       <span className="font-mono text-[10px]">{note.DATA}</span>
                       {isPending ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={12} className="text-green-500" />}
                   </div>
                 </div>
                 <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">{note.TEXTO}</p>
                 {imageSource && <NoteAttachment url={imageSource} onPreview={handleOpenPreview} />}
                 {note.STATUS_BUSCA === 'EM BUSCA' && (
                   <span className="mt-2 inline-flex items-center gap-1 bg-red-50 text-red-700 text-[10px] px-2 py-1 rounded font-bold border border-red-100 w-fit">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      MERCADORIA EM BUSCA
                   </span>
                 )}
              </div>
            );
          })}
        </div>

        {/* Input Form */}
        {selectedImage && (
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 overflow-hidden">
                    <div className="w-8 h-8 rounded bg-gray-200 overflow-hidden shrink-0 border border-gray-300">
                        <img src={selectedImage} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                    <span className="text-xs text-gray-600 truncate max-w-[150px]">{imageName}</span>
                </div>
                <button type="button" onClick={removeImage} className="text-gray-400 hover:text-red-500 p-1"><X size={16} /></button>
            </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10 shrink-0">
          <div className="flex items-center gap-2 mb-3">
             {showEmBuscaBanner || showGreenBanner ? (
                 <label className="flex items-center gap-2 text-xs text-gray-700 font-medium cursor-pointer hover:bg-green-50 p-1.5 rounded transition-colors select-none">
                    <div className={clsx(
                        "w-4 h-4 rounded border flex items-center justify-center transition-colors shadow-sm",
                        resolveChecked ? "bg-green-600 border-green-600" : "bg-white border-gray-300"
                    )}>
                        {resolveChecked && <Check size={12} className="text-white" />}
                    </div>
                    <input 
                        type="checkbox" 
                        checked={resolveChecked}
                        onChange={handleResolveCheckbox}
                        className="hidden"
                        disabled={isResolvido} // Disable if already confirmed resolved via backend
                    />
                    <span>Marcar como <span className="font-bold text-green-600">LOCALIZADA</span></span>
                </label>
             ) : (
                <label className="flex items-center gap-2 text-xs text-gray-700 font-medium cursor-pointer hover:bg-gray-50 p-1.5 rounded transition-colors select-none">
                  <div className={clsx(
                      "w-4 h-4 rounded border flex items-center justify-center transition-colors shadow-sm",
                      isSearch ? "bg-red-600 border-red-600" : "bg-white border-gray-300"
                  )}>
                      {isSearch && <X size={10} className="text-white" />}
                  </div>
                  <input 
                    type="checkbox" 
                    checked={isSearch} 
                    onChange={e => setIsSearch(e.target.checked)}
                    className="hidden"
                  />
                  <span>Marcar como <span className="font-bold text-red-600">EM BUSCA</span></span>
                </label>
             )}
          </div>
          
          <div className="flex gap-2 items-end">
            <textarea 
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Digite uma observação..."
              rows={1}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none resize-none min-h-[42px] max-h-[100px] text-gray-900 placeholder-gray-400"
              style={{ fieldSizing: 'content' } as any}
            />
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            <button type="button" onClick={handleCameraClick} className={clsx("p-2.5 rounded-full transition-colors shrink-0", selectedImage ? "text-primary-600 bg-primary-50" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100")} title="Anexar foto">
               <Camera size={20} />
            </button>
            <button type="submit" disabled={isSending || (!text.trim() && !selectedImage)} className="bg-primary-600 text-white p-2.5 rounded-full hover:bg-primary-700 active:scale-95 transition-all shadow-lg shadow-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none shrink-0">
              {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NoteModal;