import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Star, Plus, X, Search, Trash2, Loader2, AlertCircle, Palette, RefreshCcw, Grid3X3, Layers, ChevronUp, ChevronDown, Settings, Cloud, CheckCircle, Activity, Save, Edit2, Upload, Download, Check, Crown, Lock, CreditCard, Globe, SlidersHorizontal, Minus, MousePointer2, PencilLine, Undo2, Eraser, Bell, LineChart } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { Capacitor } from '@capacitor/core';
import { Purchases } from '@revenuecat/purchases-capacitor';

import { TRANSLATIONS, EXCHANGES, PRESET_COLORS, INTERVALS } from './constants';
import { THEMES } from './theme';
import { fetchAvailableMarkets } from './api';
import { CoinData, SaveSlot } from './types';
import NativeChartSlot from './components/NativeChartSlot';

const t = (key: string, lang: string = 'ko') => {
  return (TRANSLATIONS as any)[lang]?.[key] || (TRANSLATIONS as any)['en'][key] || key;
};

const DEFAULT_SLOTS: SaveSlot[] = Array(5).fill(null).map((_, i) => ({ id: i + 1, name: `저장 슬롯 ${i + 1}`, data: null }));

export default function App() {
  const [lwLoaded, setLwLoaded] = useState(false);
  
  const [language, setLanguage] = useState(() => localStorage.getItem('myDashLang') || 'ko');
  const [isPremium, setIsPremium] = useState(() => localStorage.getItem('myDashPremium') === 'true');
  const [isPaywallModalOpen, setIsPaywallModalOpen] = useState(false);
  const [isLoadingPayment, setIsLoadingPayment] = useState(false);

  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('myDashTheme') || 'blue');
  const [gridCols, setGridCols] = useState(() => Number(localStorage.getItem('myDashCols')) || 4);
  const [gridRows, setGridRows] = useState(() => Number(localStorage.getItem('myDashRows')) || 2);
  const [totalCount, setTotalCount] = useState(() => Number(localStorage.getItem('myDashTotalCount')) || 8);
  
  const [showHeader, setShowHeader] = useState(() => {
    const saved = localStorage.getItem('myDashShowHeader');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [favorites, setFavorites] = useState<CoinData[]>(() => {
    const saved = localStorage.getItem('myDashFavs');
    return saved ? JSON.parse(saved) : [
      { id: 'UPBIT-BTC-KRW', exchange: 'UPBIT', symbol: 'BTC', quote: 'KRW' }, 
      { id: 'BINANCE-BTC-USDT', exchange: 'BINANCE', symbol: 'BTC', quote: 'USDT' }, 
      { id: 'OKX-BTC-USDT', exchange: 'OKX', symbol: 'BTC', quote: 'USDT' }, 
      { id: 'BYBIT-BTC-USDT', exchange: 'BYBIT', symbol: 'BTC', quote: 'USDT' }
    ];
  });
  
  const [layouts, setLayouts] = useState<(CoinData | null)[]>(() => {
    const saved = localStorage.getItem('myDashLayoutsNativeGrid');
    return saved ? JSON.parse(saved) : Array(20).fill(null);
  });
  
  const [formExchange, setFormExchange] = useState(EXCHANGES[0].id);
  const [formSymbol, setFormSymbol] = useState('');
  const [formQuote, setFormQuote] = useState(EXCHANGES[0].defaultQuote);
  const [isAdding, setIsAdding] = useState(false);
  const [targetSlot, setTargetSlot] = useState<number | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isFavModalOpen, setIsFavModalOpen] = useState(false);
  
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [availableMarkets, setAvailableMarkets] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const c = (THEMES as any)[themeMode];

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isCloudSynced, setIsCloudSynced] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isLoadingLogin, setIsLoadingLogin] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const isInitialMount = useRef(true);

  const [isSavesModalOpen, setIsSavesModalOpen] = useState(false);
  const [saveSlots, setSaveSlots] = useState<SaveSlot[]>(() => {
    const saved = localStorage.getItem('myDashSaveSlots');
    return saved ? JSON.parse(saved) : DEFAULT_SLOTS;
  });
  const [editingSlotId, setEditingSlotId] = useState<number | null>(null);
  const [editSlotName, setEditSlotName] = useState('');

  const [showGlobalDrawMenu, setShowGlobalDrawMenu] = useState(false);
  const [globalDrawTool, setGlobalDrawTool] = useState<'trend' | 'horizontal' | 'vertical' | 'eraser' | 'alarm' | null>(null);
  const [globalDrawColor, setGlobalDrawColor] = useState('#eab308');
  const [globalDrawWidth, setGlobalDrawWidth] = useState(2);
  const [globalClearSignal, setGlobalClearSignal] = useState(0);
  const [globalUndoSignal, setGlobalUndoSignal] = useState(0);

  useEffect(() => {
    const initPurchases = async () => {
      if (Capacitor.isNativePlatform()) {
        // TODO: Replace with your actual RevenueCat Google Play API Key
        // await Purchases.configure({ apiKey: "goog_YOUR_REVENUECAT_API_KEY" });
      }
    };
    initPurchases();
  }, []);

  useEffect(() => {
    if ((window as any).LightweightCharts) { setLwLoaded(true); return; }
    const script = document.createElement('script'); script.src = 'https://unpkg.com/lightweight-charts@4.1.1/dist/lightweight-charts.standalone.production.js'; script.async = true; script.onload = () => setLwLoaded(true); document.head.appendChild(script);
  }, []);

  useEffect(() => {
    const handleToast = (e: Event) => {
        const customEvent = e as CustomEvent;
        if (customEvent.detail) {
            setToastMessage(customEvent.detail);
            setTimeout(() => setToastMessage(null), 3000);
        }
    };
    window.addEventListener('show-toast', handleToast);
    return () => window.removeEventListener('show-toast', handleToast);
  }, []);

  useEffect(() => {
    localStorage.setItem('myDashTheme', themeMode); 
    localStorage.setItem('myDashCols', gridCols.toString()); 
    localStorage.setItem('myDashRows', gridRows.toString()); 
    localStorage.setItem('myDashTotalCount', totalCount.toString()); 
    localStorage.setItem('myDashFavs', JSON.stringify(favorites)); 
    localStorage.setItem('myDashLayoutsNativeGrid', JSON.stringify(layouts));
    localStorage.setItem('myDashShowHeader', JSON.stringify(showHeader));
    localStorage.setItem('myDashSaveSlots', JSON.stringify(saveSlots));
    localStorage.setItem('myDashPremium', isPremium.toString()); 
    localStorage.setItem('myDashLang', language);
  }, [themeMode, gridCols, gridRows, totalCount, favorites, layouts, showHeader, saveSlots, isPremium, language]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user: any) => {
      if (user) {
        setCurrentUser(user);
        setIsCloudSynced(true);
        // Fetch user data from Firestore
        try {
          const isSpecialAdmin = user.email === 'siwiwhwb@gmail.com';
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          
          if (userDoc.exists()) {
            const currentPremium = userDoc.data().isPremium || false;
            setIsPremium(isSpecialAdmin || currentPremium);
            
            if (isSpecialAdmin && !currentPremium) {
              await setDoc(doc(db, 'users', user.uid), { isPremium: true }, { merge: true });
            }
          } else {
            // Create user doc if it doesn't exist
            await setDoc(doc(db, 'users', user.uid), {
              uid: user.uid,
              email: user.email,
              isPremium: isSpecialAdmin,
              createdAt: new Date().toISOString()
            });
            setIsPremium(isSpecialAdmin);
          }

          const configDoc = await getDoc(doc(db, 'users', user.uid, 'settings', 'config'));
          if (configDoc.exists()) {
            const d = configDoc.data();
            if (d.themeMode) setThemeMode(d.themeMode);
            if (d.gridCols) setGridCols(d.gridCols);
            if (d.gridRows) setGridRows(d.gridRows);
            if (d.totalCount) setTotalCount(d.totalCount);
            if (d.favorites) setFavorites(d.favorites);
            if (d.layouts) setLayouts(d.layouts);
            if (d.showHeader !== undefined) setShowHeader(d.showHeader);
            if (d.language) setLanguage(d.language);
          }

          const slotsDoc = await getDoc(doc(db, 'users', user.uid, 'settings', 'slots'));
          if (slotsDoc.exists()) {
            const d = slotsDoc.data();
            if (d.slots) setSaveSlots(d.slots);
          }
        } catch (e) {
          console.error("Error fetching user data:", e);
          handleFirestoreError(e, OperationType.GET, `users/${user.uid}`);
        }
      } else {
        setCurrentUser(null);
        setIsCloudSynced(false);
        setIsPremium(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current = false; return; }
    if (!currentUser || !db || !isCloudSynced) return;

    const saveTimeout = setTimeout(async () => {
        try {
            const docRef = doc(db, 'users', currentUser.uid, 'settings', 'config');
            await setDoc(docRef, {
                themeMode, gridCols, gridRows, totalCount, favorites, layouts, showHeader, isPremium, language,
                updatedAt: new Date().toISOString()
            });
        } catch (e) {
            console.error("Cloud save failed:", e);
            handleFirestoreError(e, OperationType.WRITE, `users/${currentUser.uid}/settings/config`);
        }
    }, 1500); 

    return () => clearTimeout(saveTimeout);
  }, [themeMode, gridCols, gridRows, totalCount, favorites, layouts, showHeader, isPremium, language, currentUser, isCloudSynced]);

  const showToast = (msg: string) => {
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 3000);
  };

  const handleLogin = async () => {
      setIsLoadingLogin(true);
      try {
         const provider = new GoogleAuthProvider();
         await signInWithPopup(auth, provider);
         setIsLoginModalOpen(false);
         showToast(t('toast_sync_success', language));
      } catch (e: any) {
         if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
             console.log("Login cancelled by user.");
             showToast("로그인이 취소되었습니다.");
         } else {
             console.error("Login failed:", e);
             showToast("로그인에 실패했습니다.");
         }
      } finally {
         setIsLoadingLogin(false);
      }
  };

  const handleUpgrade = async () => {
    if (!currentUser) {
      setIsPaywallModalOpen(false);
      setIsLoginModalOpen(true);
      showToast("로그인이 필요합니다.");
      return;
    }
    setIsLoadingPayment(true);

    if (Capacitor.isNativePlatform()) {
      // Native App (Google Play Billing via RevenueCat)
      try {
        const offerings = await Purchases.getOfferings();
        if (offerings.current !== null && offerings.current.availablePackages.length !== 0) {
          const { customerInfo } = await Purchases.purchasePackage({ aPackage: offerings.current.availablePackages[0] });
          if (typeof customerInfo.entitlements.active['premium'] !== "undefined") {
            await setDoc(doc(db, 'users', currentUser.uid), { isPremium: true }, { merge: true });
            setIsPremium(true);
            setIsPaywallModalOpen(false);
            showToast(t('toast_upgrade_success', language));
          }
        } else {
          showToast("결제 상품을 불러올 수 없습니다. (RevenueCat 설정 필요)");
        }
      } catch (e: any) {
        if (e.userCancelled) {
          console.log("Purchase cancelled by user.");
        } else {
          console.error("Purchase failed:", e);
          showToast("결제 중 오류가 발생했습니다.");
        }
      } finally {
        setIsLoadingPayment(false);
      }
    } else {
      // Web Mock (For testing in browser)
      setTimeout(async () => {
          try {
            await setDoc(doc(db, 'users', currentUser.uid), { isPremium: true }, { merge: true });
            setIsPremium(true);
            setIsLoadingPayment(false);
            setIsPaywallModalOpen(false);
            showToast(t('toast_upgrade_success', language));
          } catch (e: any) {
            console.error("Upgrade failed:", e);
            setIsLoadingPayment(false);
            if (e.message && e.message.includes('permission')) {
               showToast("보안 정책: 결제 서버(RevenueCat 등)를 통해서만 프로 권한을 얻을 수 있습니다.");
            } else {
               showToast("결제 처리 중 오류가 발생했습니다.");
            }
            handleFirestoreError(e, OperationType.UPDATE, `users/${currentUser.uid}`);
          }
      }, 1500); 
    }
  };

  const updateCloudSlots = async (newSlots: SaveSlot[]) => {
    setSaveSlots(newSlots);
    if (!currentUser || !db) return;
    try {
        const slotsRef = doc(db, 'users', currentUser.uid, 'settings', 'slots');
        await setDoc(slotsRef, { slots: newSlots, updatedAt: new Date().toISOString() });
    } catch (e) {
        console.error("Save slots failed", e);
        handleFirestoreError(e, OperationType.WRITE, `users/${currentUser.uid}/settings/slots`);
    }
  };

  const handleSaveToSlot = (id: number) => {
      const currentData = { themeMode, gridCols, gridRows, totalCount, favorites, layouts, showHeader };
      const newSlots = saveSlots.map(s => s.id === id ? { ...s, data: currentData } : s);
      updateCloudSlots(newSlots);
      const targetName = newSlots.find(s => s.id === id)?.name || '';
      showToast(t('toast_save_slot', language).replace('{name}', targetName));
  };

  const handleLoadFromSlot = (id: number) => {
      const slot = saveSlots.find(s => s.id === id);
      if (!slot || !slot.data) return;
      const d = slot.data;
      setThemeMode(d.themeMode || 'blue');
      setGridCols(d.gridCols || 4);
      setGridRows(d.gridRows || 2);
      setTotalCount(d.totalCount || 8);
      if (d.favorites) setFavorites(d.favorites);
      if (d.layouts) setLayouts(d.layouts);
      if (d.showHeader !== undefined) setShowHeader(d.showHeader);
      
      showToast(t('toast_load_slot', language).replace('{name}', slot.name));
      setIsSavesModalOpen(false);
  };

  const handleRenameSlot = (id: number) => {
      if (!editSlotName.trim()) { setEditingSlotId(null); return; }
      const newSlots = saveSlots.map(s => s.id === id ? { ...s, name: editSlotName.trim() } : s);
      updateCloudSlots(newSlots);
      setEditingSlotId(null);
  };

  useEffect(() => {
    const exchange = EXCHANGES.find(e => e.id === formExchange); 
    if (exchange) setFormQuote(exchange.defaultQuote); 
    fetchAvailableMarkets(formExchange).then(setAvailableMarkets);
  }, [formExchange]);

  const filteredMarkets = useMemo(() => {
    if (formSymbol.trim() === '') return availableMarkets.slice(0, 50);
    const lower = formSymbol.toLowerCase().replace(/[^a-z0-9]/g, '');
    return availableMarkets.filter(m => {
      const s = m.symbol.toLowerCase();
      const d = m.display.toLowerCase().replace(/[^a-z0-9]/g, '');
      const id = m.id ? m.id.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
      return s.includes(lower) || d.includes(lower) || id.includes(lower);
    }).slice(0, 50);
  }, [availableMarkets, formSymbol]);

  const processCoin = async (e: React.FormEvent | null, applyToChart: boolean, addToFav: boolean) => {
    if (e) e.preventDefault(); if (!formSymbol) return;
    const base = formSymbol.toUpperCase().trim(), quote = formQuote.toUpperCase().trim(), coinId = `${formExchange}-${base}-${quote}`, coinData = { exchange: formExchange, symbol: base, quote: quote, id: coinId };
    if (addToFav && favorites.find(f => f.id === coinId)) return;
    setIsAdding(true); try { if (addToFav) setFavorites(prev => [...prev, coinData]); if (applyToChart) setLayouts(prev => { const next = [...prev]; if (targetSlot !== null) next[targetSlot] = coinData; else { const firstEmpty = next.findIndex((val, i) => val === null && i < totalCount); next[firstEmpty === -1 ? 0 : firstEmpty] = coinData; } return next; }); setFormSymbol(''); setIsAddModalOpen(false); setTargetSlot(null); } catch (error) {} finally { setIsAdding(false); }
  };

  const handleColsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCols = Number(e.target.value);
    setGridCols(newCols);
    setTotalCount(newCols * gridRows);
  };

  const handleRowsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRows = Number(e.target.value);
    setGridRows(newRows);
    setTotalCount(gridCols * newRows);
  };

  return (
    <div className={`min-h-screen ${c.appBg} ${c.text} flex flex-col font-sans transition-colors duration-500 relative`}>
      <style>{`
        .custom-resizable { resize: both; overflow: hidden; position: relative; min-width: 0; min-height: 150px; flex-shrink: 0; flex-grow: 0; } 
        .custom-resizable::-webkit-resizer { background-image: linear-gradient(135deg, transparent 50%, ${c.resizerColor} 50%); width: 12px; height: 12px; cursor: nwse-resize; } 
        select option { background-color: ${c.optionBgHex}; color: ${c.optionTextHex}; }
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
      `}</style>

      {isPaywallModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className={`bg-slate-900 border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl relative flex flex-col items-center text-center overflow-hidden`}>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-gradient-to-b from-orange-500/20 to-transparent blur-2xl" />
            <button onClick={() => setIsPaywallModalOpen(false)} className="absolute top-4 right-4 text-white/50 hover:text-white"><X className="w-6 h-6" /></button>
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-yellow-400 to-orange-500 flex items-center justify-center mb-6 shadow-xl shadow-orange-500/20 mt-4 relative z-10">
              <Crown className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-black text-white mb-2 relative z-10">MVT <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">PRO</span></h2>
            <p className="text-sm text-slate-400 mb-8 relative z-10">{t('paywall_desc', language)}</p>
            <div className="w-full space-y-4 mb-8 text-left relative z-10">
              <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                <span className="text-sm text-slate-200 font-bold">{t('paywall_f1', language)}</span>
              </div>
              <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                <span className="text-sm text-slate-200 font-bold">{t('paywall_f2', language)}</span>
              </div>
              <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                <span className="text-sm text-slate-200 font-bold">{t('paywall_f3', language)}</span>
              </div>
            </div>
            <button disabled={isLoadingPayment} onClick={handleUpgrade} className="w-full bg-gradient-to-r from-yellow-500 to-orange-600 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-orange-500/25 relative z-10">
              {isLoadingPayment ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <><CreditCard className="w-5 h-5" /> {t('paywall_btn', language)}</>}
            </button>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-6 py-3 rounded-full shadow-2xl font-bold text-sm z-[100] animate-bounce">
            {toastMessage}
        </div>
      )}

      {showGlobalDrawMenu && (
        <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-1.5 px-3 py-2 rounded-2xl ${c.infoBg} backdrop-blur-2xl border ${c.infoBorder} shadow-2xl transition-all duration-300`}>
          
          <button 
            onClick={() => setGlobalDrawTool(null)} 
            className={`p-2.5 rounded-xl transition-colors ${!globalDrawTool ? c.accentBg + ' text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/10'}`} 
            title="기본 이동 모드"
          >
            <MousePointer2 className="w-4 h-4"/>
          </button>
          
          <div className="w-px h-6 bg-white/10 mx-1"/>
          
          <button 
            onClick={() => setGlobalDrawTool('trend')} 
            className={`p-2.5 rounded-xl transition-colors ${globalDrawTool==='trend' ? c.accentBg + ' text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/10'}`} 
            title={t('draw_trend', language)}
          >
            <Minus className="w-4 h-4 -rotate-45"/>
          </button>
          
          <button 
            onClick={() => setGlobalDrawTool('horizontal')} 
            className={`p-2.5 rounded-xl transition-colors ${globalDrawTool==='horizontal' ? c.accentBg + ' text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/10'}`} 
            title={t('draw_horiz', language)}
          >
            <Minus className="w-4 h-4"/>
          </button>
          
          <button 
            onClick={() => setGlobalDrawTool('vertical')} 
            className={`p-2.5 rounded-xl transition-colors ${globalDrawTool==='vertical' ? c.accentBg + ' text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/10'}`} 
            title={t('draw_vert', language)}
          >
            <Minus className="w-4 h-4 rotate-90"/>
          </button>

          <button 
            onClick={() => setGlobalDrawTool('alarm')} 
            className={`p-2.5 rounded-xl transition-colors ${globalDrawTool==='alarm' ? c.accentBg + ' text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/10'}`} 
            title="알람선 긋기"
          >
            <Bell className="w-4 h-4"/>
          </button>

          <button 
            onClick={() => setGlobalDrawTool('eraser')} 
            className={`p-2.5 rounded-xl transition-colors ${globalDrawTool==='eraser' ? c.accentBg + ' text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/10'}`} 
            title={t('eraser', language)}
          >
            <Eraser className="w-4 h-4"/>
          </button>
          
          <div className="w-px h-6 bg-white/10 mx-2"/>
          
          <div className="flex gap-1.5 items-center mr-2">
            {PRESET_COLORS.map(color => (
                <button
                    key={color}
                    onClick={() => setGlobalDrawColor(color)}
                    className={`w-5 h-5 rounded-full transition-all ${globalDrawColor === color ? 'scale-125 ring-2 ring-white shadow-md' : 'opacity-50 hover:scale-110 hover:opacity-100'}`}
                    style={{ backgroundColor: color }}
                    title="색상 변경"
                />
            ))}
          </div>
          
          <div className="w-px h-6 bg-white/10 mx-1"/>

          <div className={`flex items-center bg-black/20 rounded-lg px-2 py-1 mx-1 border ${c.borderColor}`} title={t('thickness', language)}>
              <button onClick={() => setGlobalDrawWidth(Math.max(1, globalDrawWidth - 1))} className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors">-</button>
              <span className={`w-4 text-center text-xs font-bold ${c.text}`}>{globalDrawWidth}</span>
              <button onClick={() => setGlobalDrawWidth(Math.min(5, globalDrawWidth + 1))} className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors">+</button>
          </div>
          
          <div className="w-px h-6 bg-white/10 mx-1"/>
          
          <button 
            onClick={() => setGlobalUndoSignal(Date.now())} 
            className="p-2.5 rounded-xl transition-colors text-slate-300 hover:text-white hover:bg-white/10" 
            title={t('undo', language)}
          >
            <Undo2 className="w-4 h-4"/>
          </button>

          <button 
            onClick={() => { setGlobalClearSignal(Date.now()); showToast(t('clear_all', language)); }} 
            className="p-2.5 rounded-xl transition-colors text-red-400 hover:text-white hover:bg-red-500/50" 
            title={t('clear_all', language)}
          >
            <Trash2 className="w-4 h-4"/>
          </button>
        </div>
      )}

      <div 
        className="fixed top-0 left-1/2 -translate-x-1/2 z-[60] flex justify-center group cursor-pointer"
        onClick={() => setShowHeader(!showHeader)}
        title={showHeader ? t('hide_menu', language) : t('show_menu', language)}
      >
        <div className={`${c.headerBg} border-x border-b ${c.borderColor} w-32 h-5 rounded-b-xl shadow-md transition-all duration-300 flex items-center justify-center ${!showHeader ? 'opacity-0 -translate-y-2 group-hover:opacity-100 group-hover:translate-y-0' : 'opacity-100 hover:opacity-80'}`}>
          {showHeader ? <ChevronUp className={`w-4 h-4 ${c.accentTextLight}`} /> : <ChevronDown className={`w-4 h-4 ${c.accentTextLight}`} />}
        </div>
        {!showHeader && <div className="absolute top-0 w-64 h-8 bg-transparent" />}
      </div>

      {showHeader && (
        <header className={`${c.headerBg} border-b ${c.borderColor} p-4 sticky top-0 z-50 shadow-sm pt-6`}>
          <div className="max-w-[2400px] w-full mx-auto flex flex-col xl:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3 select-none group cursor-pointer">
              <div className="relative">
                <div className={`absolute inset-0 blur-lg opacity-40 bg-gradient-to-tr ${c.logoGrad} group-hover:opacity-70 transition-opacity duration-500`} />
                <div className={`relative flex items-center justify-center w-10 h-10 md:w-11 md:h-11 rounded-xl bg-gradient-to-br ${c.logoGrad} shadow-lg ring-1 ring-white/20`}>
                  <Activity className="w-5 h-5 md:w-6 md:h-6 text-white drop-shadow-md" strokeWidth={2.5} />
                </div>
              </div>
              <div className="flex flex-col justify-center">
                <h1 className={`text-2xl md:text-3xl font-black tracking-tighter bg-gradient-to-r ${c.logoGrad} bg-clip-text text-transparent leading-none`}>MVT</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <button onClick={() => { setTargetSlot(null); setIsAddModalOpen(true); }} className={`flex items-center gap-1.5 ${c.buttonBg} px-3 py-2 rounded-xl text-sm font-medium border ${c.borderColor} shadow-sm active:scale-95 transition-transform`}><Search className="w-4 h-4" /> {t('search', language)}</button>
              
              <button 
                onClick={() => {
                  if (!isPremium) {
                    setIsPaywallModalOpen(true);
                    return;
                  }
                  setShowGlobalDrawMenu(!showGlobalDrawMenu);
                  if (!showGlobalDrawMenu && !globalDrawTool) setGlobalDrawTool('trend'); 
                }} 
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border ${c.borderColor} shadow-sm active:scale-95 transition-transform ${showGlobalDrawMenu ? c.accentBg + ' text-white' : c.buttonBg}`}
              >
                <PencilLine className="w-4 h-4" /> {t('draw_btn', language)}
                {!isPremium && <Lock className="w-3 h-3 text-orange-400" />}
              </button>

              <button onClick={() => setIsFavModalOpen(true)} className={`flex items-center gap-1.5 ${c.buttonBg} px-3 py-2 rounded-xl text-sm font-medium border ${c.borderColor} shadow-sm active:scale-95 transition-transform`}><Star className="w-4 h-4 text-yellow-500" /> {t('fav', language)}</button>
              
              <div className={`flex flex-wrap items-center justify-center gap-2 sm:gap-3 ${c.inputBg} px-3 py-2 rounded-xl border ${c.borderColor}`}>
                <Grid3X3 className={`w-4 h-4 ${c.accentText} hidden sm:block`} />
                <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-medium opacity-70`}>{t('cols', language)}</span>
                    <select className={`bg-transparent border-none outline-none text-sm font-bold cursor-pointer ${c.text}`} value={gridCols} onChange={handleColsChange}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n}{t('slots', language)}</option>)}
                    </select>
                  </div>
                  <div className="hidden sm:block w-px h-3 bg-white/10" />
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-medium opacity-70`}>{t('rows', language)}</span>
                    <select className={`bg-transparent border-none outline-none text-sm font-bold cursor-pointer ${c.text}`} value={gridRows} onChange={handleRowsChange}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n}{t('slots', language)}</option>)}
                    </select>
                  </div>
                  <div className="hidden sm:block w-px h-3 bg-white/10" />
                  <div className="flex items-center gap-1.5">
                    <Layers className={`w-3.5 h-3.5 ${c.accentTextLight} hidden sm:block`} />
                    <span className={`text-xs font-bold ${c.accentTextLight}`}>{t('total', language)}</span>
                    <select className={`bg-transparent border-none outline-none text-sm font-bold cursor-pointer ${c.accentTextLight}`} value={totalCount} onChange={(e) => setTotalCount(Number(e.target.value))}>
                      {[...Array(20)].map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}{t('slots', language)}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <button onClick={() => setIsSettingsModalOpen(true)} className={`flex items-center gap-1.5 ${c.buttonBg} px-3 py-2 rounded-xl text-sm font-medium border ${c.borderColor} shadow-sm active:scale-95 transition-transform`}>
                <Settings className={`w-4 h-4 ${c.accentTextLight}`} /> {t('settings', language)}
              </button>

              <button onClick={() => { localStorage.clear(); window.location.reload(); }} className={`${c.accentBg} hover:opacity-80 text-white px-3 py-2 rounded-xl text-sm font-medium transition-transform active:scale-95 shadow-md`}><RefreshCcw className="w-4 h-4" /></button>

              <div className="w-px h-6 bg-white/10 mx-1" />

              <button onClick={() => setIsLoginModalOpen(true)} className={`flex items-center gap-1.5 ${c.buttonBg} px-3 py-2 rounded-xl text-sm font-medium border ${isCloudSynced ? 'border-green-500/50' : c.borderColor} shadow-sm active:scale-95 transition-transform`}>
                <Cloud className={`w-4 h-4 ${isCloudSynced ? 'text-green-500' : c.accentTextLight}`} /> 
                {isCloudSynced ? t('synced', language) : t('login', language)}
              </button>

              {isCloudSynced && (
                <button onClick={() => isPremium ? setIsSavesModalOpen(true) : setIsPaywallModalOpen(true)} className={`flex items-center gap-1.5 ${c.buttonBg} px-3 py-2 rounded-xl text-sm font-medium border ${isPremium ? 'border-indigo-500/50 hover:bg-indigo-500/20' : c.borderColor} shadow-sm active:scale-95 transition-all`}>
                  <Save className={`w-4 h-4 ${isPremium ? 'text-indigo-400' : c.textMuted}`} /> {t('save_store', language)}
                </button>
              )}
            </div>
          </div>
        </header>
      )}

      <div className={`flex-1 w-full p-2 md:p-4 overflow-y-auto overflow-x-hidden transition-all duration-300 ${!showHeader ? 'pt-8' : ''}`}>
        <main className="w-full max-w-[3200px] mx-auto min-h-full">
            <div className="flex flex-wrap gap-4 w-full items-start">
              {[...Array(totalCount)].map((_, index) => {
                if (!isPremium && index >= 2) {
                  const descLines = t('pro_desc', language).split('\n');
                  return (
                    <div 
                      key={`locked-${index}`} onClick={() => setIsPaywallModalOpen(true)}
                      className={`custom-resizable flex flex-col items-center justify-center p-2 sm:p-6 ${c.cardBg} border ${c.borderColor} rounded-2xl shadow-lg cursor-pointer group transition-transform hover:-translate-y-1 overflow-hidden`}
                      style={{ width: gridCols === 1 ? '100%' : `calc((100% - ${(gridCols - 1) * 16}px) / ${gridCols})`, height: '350px' }}
                    >
                      <div className="w-8 h-8 sm:w-14 sm:h-14 rounded-full bg-gradient-to-tr from-yellow-400 to-orange-500 flex items-center justify-center mb-2 sm:mb-4 group-hover:scale-110 transition-transform shadow-lg shadow-orange-500/20 shrink-0">
                        <Lock className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                      </div>
                      <h3 className={`text-xs sm:text-[15px] font-bold mb-1 ${c.text} truncate w-full text-center`}>{t('pro_slot', language)}</h3>
                      <p className={`text-[9px] sm:text-[11px] text-center ${c.textMuted} max-w-[90%] sm:max-w-[80%] leading-relaxed truncate w-full`}>{descLines[0]}<br/>{descLines[1]}</p>
                    </div>
                  );
                }
                return (
                  <NativeChartSlot 
                    key={`slot-${index}`} index={index} coinData={layouts[index]} lwLoaded={lwLoaded} gridCols={gridCols} 
                    onClear={() => setLayouts(prev => { const n = [...prev]; n[index] = null; return n; })} 
                    onOpenSearch={() => { setTargetSlot(index); setIsAddModalOpen(true); }} 
                    favorites={favorites} 
                    onAssignDirect={(favId) => { setLayouts(prev => { const n = [...prev]; while (n.length <= index) n.push(null); n[index] = favorites.find(x => x.id === favId) || null; return n; }); }} 
                    themeColors={c} language={language}
                    
                    globalDrawTool={globalDrawTool}
                    globalDrawColor={globalDrawColor}
                    globalDrawWidth={globalDrawWidth}
                    globalClearSignal={globalClearSignal}
                    globalUndoSignal={globalUndoSignal}
                  />
                );
              })}
            </div>
        </main>
      </div>

      {isSavesModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`${c.modalBg} border ${c.borderColor} rounded-3xl p-6 w-full max-w-lg shadow-2xl relative transition-colors`}>
            <button onClick={() => { setIsSavesModalOpen(false); setEditingSlotId(null); }} className="absolute top-4 right-4"><X className="w-6 h-6" /></button>
            <h2 className={`text-xl font-black mb-2 flex items-center gap-2 ${c.text}`}><Save className={`w-6 h-6 ${c.accentText}`} /> {t('save_title', language)}</h2>
            <p className={`text-xs ${c.textMuted} mb-6 leading-relaxed`}>{t('save_desc', language)}</p>
            
            <div className="space-y-3">
              {saveSlots.map(slot => (
                <div key={slot.id} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border ${slot.data ? c.borderColor : 'border-dashed border-white/20'} ${c.inputBg}`}>
                  <div className="flex items-center gap-2 flex-1">
                    {editingSlotId === slot.id ? (
                      <div className="flex items-center gap-2 w-full">
                        <input 
                          type="text" autoFocus value={editSlotName} onChange={(e) => setEditSlotName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRenameSlot(slot.id)}
                          className={`flex-1 bg-transparent border-b ${c.borderColor} ${c.text} text-sm font-bold outline-none px-1 py-0.5`}
                        />
                        <button onClick={() => handleRenameSlot(slot.id)} className="p-1.5 rounded-lg bg-green-500/20 text-green-500 hover:bg-green-500/40 transition-colors"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingSlotId(null)} className="p-1.5 rounded-lg bg-red-500/20 text-red-500 hover:bg-red-500/40 transition-colors"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <>
                        <span className={`text-sm font-bold ${slot.data ? c.text : c.textMuted}`}>{slot.name}</span>
                        <button onClick={() => { setEditingSlotId(slot.id); setEditSlotName(slot.name); }} className={`p-1 opacity-50 hover:opacity-100 ${c.accentText}`}><Edit2 className="w-3.5 h-3.5" /></button>
                        {!slot.data && <span className={`text-[10px] px-2 py-0.5 rounded-full border ${c.borderColor} ${c.textMuted}`}>{t('empty', language)}</span>}
                      </>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleSaveToSlot(slot.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${slot.data ? c.buttonBg + ' hover:opacity-80' : c.accentBg + ' text-white hover:opacity-90'} border ${c.borderColor} transition-all`}>
                      <Upload className="w-3.5 h-3.5" /> {slot.data ? t('overwrite', language) : t('save_here', language)}
                    </button>
                    <button onClick={() => handleLoadFromSlot(slot.id)} disabled={!slot.data} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${slot.data ? 'bg-green-500/10 text-green-500 border border-green-500/30 hover:bg-green-500/20 cursor-pointer' : 'opacity-30 cursor-not-allowed border ' + c.borderColor}`}>
                      <Download className="w-3.5 h-3.5" /> {t('load', language)}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isLoginModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`${c.modalBg} border ${c.borderColor} rounded-3xl p-8 w-full max-sm shadow-2xl relative transition-colors`}>
            <button onClick={() => setIsLoginModalOpen(false)} className="absolute top-4 right-4"><X className="w-6 h-6" /></button>
            <h2 className={`text-xl font-black mb-2 flex items-center gap-2 ${c.text}`}><Cloud className={`w-6 h-6 ${c.accentText}`} /> {t('cloud_title', language)}</h2>
            <p className={`text-xs ${c.textMuted} mb-6 leading-relaxed`}>{t('cloud_desc', language)}</p>
            
            {isCloudSynced ? (
                <div className="space-y-4">
                    <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl flex flex-col items-center justify-center">
                        <CheckCircle className="w-10 h-10 text-green-500 mb-2" />
                        <span className="text-sm font-bold text-green-400 text-center leading-snug">{t('cloud_on', language)}</span>
                    </div>
                    <button 
                        onClick={async () => { await signOut(auth); setIsLoginModalOpen(false); showToast(t('toast_unsync', language)); }}
                        className={`w-full ${c.inputBg} ${c.text} font-bold py-3 rounded-xl border border-red-500/50 hover:bg-red-500/10 transition-colors`}
                    >
                        {t('logout', language)}
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                  <button onClick={() => handleLogin()} disabled={isLoadingLogin} className="w-full bg-white text-slate-800 font-bold py-3 rounded-xl flex items-center justify-center gap-3 hover:bg-slate-100 transition-colors shadow-sm">
                    {isLoadingLogin ? <Loader2 className="w-5 h-5 animate-spin text-slate-800" /> : (
                        <>
                            <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                            {t('login_google', language)}
                        </>
                    )}
                  </button>
                </div>
            )}
          </div>
        </div>
      )}

      {isSettingsModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`${c.modalBg} border ${c.borderColor} rounded-2xl p-6 w-full max-w-sm shadow-2xl relative transition-colors`}>
            <button onClick={() => setIsSettingsModalOpen(false)} className="absolute top-4 right-4"><X className="w-6 h-6" /></button>
            <h2 className={`text-lg font-bold mb-6 flex items-center gap-2 ${c.text}`}><Settings className={`w-5 h-5 ${c.accentText}`} /> {t('settings', language)}</h2>
            
            <div className="space-y-6">
              <div>
                <label className={`flex items-center gap-2 text-sm font-bold mb-3 opacity-80 ${c.text}`}>
                  <Palette className={`w-4 h-4 ${c.accentTextLight}`} /> {t('theme_sel', language)}
                </label>
                <select className={`w-full ${c.inputBg} border ${c.borderColor} ${c.text} rounded-lg p-3 text-sm outline-none cursor-pointer font-bold`} value={themeMode} onChange={(e) => setThemeMode(e.target.value)}>
                  <option value="blue">{t('theme_blue', language)}</option>
                  <option value="dark">{t('theme_dark', language)}</option>
                  <option value="light">{t('theme_light', language)}</option>
                  <option value="sunset">{t('theme_sunset', language)}</option>
                  <option value="glass">{t('theme_glass', language)}</option>
                </select>
              </div>

              <div>
                <label className={`flex items-center gap-2 text-sm font-bold mb-3 opacity-80 ${c.text}`}>
                  <Globe className={`w-4 h-4 ${c.accentTextLight}`} /> {t('lang_sel', language)}
                </label>
                <select className={`w-full ${c.inputBg} border ${c.borderColor} ${c.text} rounded-lg p-3 text-sm outline-none cursor-pointer font-bold`} value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="ko">한국어 (Korean)</option>
                  <option value="en">English (English)</option>
                  <option value="zh">中文 (Chinese)</option>
                  <option value="ru">Русский (Russian)</option>
                </select>
              </div>
            </div>
            
            <div className="mt-8">
              <button onClick={() => setIsSettingsModalOpen(false)} className={`w-full ${c.accentBg} text-white font-bold py-2.5 rounded-lg flex items-center justify-center transition-transform active:scale-95`}>{t('confirm', language)}</button>
            </div>

            {isPremium && (
              <div className="mt-6 pt-4 border-t border-white/10 text-center">
                <button onClick={() => { setIsPremium(false); localStorage.setItem('myDashPremium', 'false'); showToast(t('toast_downgrade', language)); }} className="text-[10px] text-red-400/70 hover:text-red-400 underline">{t('dev_downgrade', language)}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`${c.modalBg} border ${c.borderColor} rounded-2xl p-6 w-full max-w-md shadow-2xl relative transition-colors`}>
            <button onClick={() => setIsAddModalOpen(false)} className="absolute top-4 right-4"><X className="w-6 h-6" /></button>
            <h2 className={`text-lg font-bold mb-6 flex items-center gap-2 ${c.text}`}><Search className={`w-5 h-5 ${c.accentText}`} /> {t('add_coin', language)}</h2>
            <form onSubmit={(e) => processCoin(e, true, false)} className="space-y-4">
              <select className={`w-full ${c.inputBg} border ${c.borderColor} ${c.text} rounded-lg p-2.5 text-sm outline-none cursor-pointer font-bold`} value={formExchange} onChange={(e) => setFormExchange(e.target.value)}>{EXCHANGES.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}</select>
              <div className="flex gap-2"><div className="flex-1 relative"><input type="text" placeholder={t('ex_btc', language)} className={`w-full ${c.inputBg} border ${c.borderColor} ${c.text} rounded-lg p-2.5 text-sm outline-none uppercase font-bold`} value={formSymbol} onChange={(e) => { setFormSymbol(e.target.value); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} />{showSuggestions && (<ul className={`absolute z-50 w-full mt-1 max-h-48 overflow-y-auto ${c.headerBg} border ${c.borderColor} rounded-lg shadow-2xl`}>{availableMarkets.length === 0 ? (<li className={`px-3 py-2 text-sm ${c.textMuted}`}>Loading...</li>) : filteredMarkets.length > 0 ? (filteredMarkets.map((m, i) => (<li key={i} onMouseDown={() => { setFormSymbol(m.symbol); setFormQuote(m.quote); setShowSuggestions(false); }} className={`px-3 py-2 cursor-pointer text-sm ${c.hoverBg} hover:text-white flex justify-between items-center ${c.text}`}><div className="flex items-center gap-2"><img src={`https://assets.coincap.io/assets/icons/${m.symbol.toLowerCase()}@2x.png`} alt={m.symbol} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} className="w-5 h-5 rounded-full" /><span className="font-bold">{m.display}</span></div><span className="text-xs opacity-70">{m.name}</span></li>))) : formSymbol.trim() !== '' ? (<li className={`px-3 py-2 text-sm ${c.textMuted}`}>No results</li>) : null}</ul>)}</div><input type="text" className={`w-24 ${c.inputBg} border ${c.borderColor} ${c.text} rounded-lg p-2.5 text-sm outline-none uppercase font-bold`} value={formQuote} onChange={(e) => setFormQuote(e.target.value)} /></div>
              <button type="submit" disabled={isAdding} className={`w-full ${c.accentBg} text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-transform active:scale-95`}>{isAdding ? <Loader2 className={`w-4 h-4 animate-spin ${c.accentText}`} /> : t('show_chart', language)}</button>
              <button type="button" onClick={(e) => processCoin(null, false, true)} className={`w-full ${c.buttonBg} ${c.text} font-bold py-2.5 rounded-lg border ${c.borderColor}`}>{t('save_fav_btn', language)}</button>
            </form>
          </div>
        </div>
      )}
      {isFavModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`${c.modalBg} border ${c.borderColor} rounded-2xl p-6 w-full max-w-md shadow-2xl relative flex flex-col max-h-[80vh]`}>
            <button onClick={() => setIsFavModalOpen(false)} className="absolute top-4 right-4"><X className="w-6 h-6" /></button>
            <h2 className={`text-lg font-bold mb-4 ${c.text}`}>{t('my_favs', language)}</h2>
            <div className="overflow-y-auto flex-1">{favorites.length === 0 ? <div className={`text-center py-10 opacity-50 font-bold ${c.text}`}>{t('no_favs', language)}</div> : (
              <ul className="space-y-2">{favorites.map((fav) => (
                <li key={fav.id} className={`${c.inputBg} border ${c.borderColor} rounded-lg p-3 flex justify-between items-center group`}>
                  <div><span className={`font-bold ${c.text}`}>{fav.symbol}</span> <span className={`text-xs opacity-60 uppercase font-bold ml-1 ${c.accentTextLight}`}>{fav.exchange}</span></div>
                  <button onClick={() => setFavorites(f => f.filter(x => x.id !== fav.id))} className="text-red-500 p-1 hover:bg-red-500/10 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
                </li>))}
              </ul>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
