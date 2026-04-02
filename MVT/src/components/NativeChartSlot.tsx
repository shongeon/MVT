import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Loader2, AlertCircle, SlidersHorizontal, Plus, Trash2, Clock, Search } from 'lucide-react';
import { fetchTicker, fetchCandles } from '../api';
import { INTERVALS, PRESET_COLORS, TRANSLATIONS } from '../constants';
import { CoinData, IndicatorSettings, Drawing } from '../types';

const t = (key: string, lang: string = 'ko') => {
  return (TRANSLATIONS as any)[lang]?.[key] || (TRANSLATIONS as any)['en'][key] || key;
};

const calculateSMA = (data: any[], period: number) => {
  const sma = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    sma.push({ time: data[i].time, value: sum / period });
  }
  return sma;
};

const calculateBB = (data: any[], period: number, stdDevMultiplier: number) => {
  const upper = [];
  const middle = [];
  const lower = [];

  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    const sma = sum / period;

    let varianceSum = 0;
    for (let j = 0; j < period; j++) {
      varianceSum += Math.pow(data[i - j].close - sma, 2);
    }
    const variance = varianceSum / period;
    const stdDev = Math.sqrt(variance);

    upper.push({ time: data[i].time, value: sma + stdDevMultiplier * stdDev });
    middle.push({ time: data[i].time, value: sma });
    lower.push({ time: data[i].time, value: sma - stdDevMultiplier * stdDev });
  }
  return { upper, middle, lower };
};

interface Props {
  key?: React.Key;
  index: number;
  coinData: CoinData | null;
  lwLoaded: boolean;
  gridCols: number;
  onClear: () => void;
  onOpenSearch: () => void;
  favorites: CoinData[];
  onAssignDirect: (favId: string) => void;
  themeColors: any;
  language: string;
  globalDrawTool: 'trend' | 'horizontal' | 'vertical' | 'eraser' | 'alarm' | null;
  globalDrawColor: string;
  globalDrawWidth: number;
  globalClearSignal: number;
  globalUndoSignal: number;
}

export default function NativeChartSlot({ 
  index, coinData, lwLoaded, gridCols, onClear, onOpenSearch, favorites, onAssignDirect, themeColors: c, language, 
  globalDrawTool, globalDrawColor, globalDrawWidth, globalClearSignal, globalUndoSignal 
}: Props) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const lastBarRef = useRef<any>(null);
  
  const seriesListRef = useRef<{ volume: any }>({ volume: null });
  const maSeriesRef = useRef<Record<number, any>>({});
  const bbSeriesRef = useRef<Record<number, any>>({});
  const [chartData, setChartData] = useState<any[]>([]);

  const [indicators, setIndicators] = useState<IndicatorSettings>(() => {
    const saved = localStorage.getItem(`dashInd_${index}`);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch(e) {
            return { volume: true, mas: [{ id: 1, period: 20, color: '#f59e0b', visible: true }], bbs: [] };
        }
    }
    return { volume: true, mas: [{ id: 1, period: 20, color: '#f59e0b', visible: true }], bbs: [] };
  });
  
  const [showIndMenu, setShowIndMenu] = useState(false);
  const [drawings, setDrawings] = useState<Drawing[]>(() => {
      const saved = localStorage.getItem(`dashDraw_${index}`);
      if (saved) {
          try {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed)) {
                  return parsed.filter(d => d && d.p1 && d.p2 && typeof d.id !== 'object');
              }
          } catch(e) {
              return [];
          }
      }
      return [];
  });
  
  const drawingsRef = useRef(drawings);
  useEffect(() => { drawingsRef.current = drawings; }, [drawings]);
  
  const [drawStep, setDrawStep] = useState(0); 
  const activeDrawingRef = useRef<any>(null);

  useEffect(() => {
      setDrawStep(0);
      activeDrawingRef.current = null;
  }, [globalDrawTool]);

  const addMA = () => {
      const nextId = Date.now();
      const color = PRESET_COLORS[(indicators.mas?.length || 0) % PRESET_COLORS.length];
      setIndicators(prev => ({
          ...prev,
          mas: [...(prev.mas || []), { id: nextId, period: 60, color, visible: true }]
      }));
  };

  const updateMA = (id: number, field: string, value: any) => {
      setIndicators(prev => ({
          ...prev,
          mas: (prev.mas || []).map(ma => ma.id === id ? { ...ma, [field]: value } : ma)
      }));
  };

  const removeMA = (id: number) => {
      setIndicators(prev => ({
          ...prev,
          mas: (prev.mas || []).filter(ma => ma.id !== id)
      }));
  };

  const addBB = () => {
      const nextId = Date.now();
      const color = PRESET_COLORS[(indicators.bbs?.length || 0) % PRESET_COLORS.length];
      setIndicators(prev => ({
          ...prev,
          bbs: [...(prev.bbs || []), { id: nextId, period: 20, stdDev: 2, color, visible: true }]
      }));
  };

  const updateBB = (id: number, field: string, value: any) => {
      setIndicators(prev => ({
          ...prev,
          bbs: (prev.bbs || []).map(bb => bb.id === id ? { ...bb, [field]: value } : bb)
      }));
  };

  const removeBB = (id: number) => {
      setIndicators(prev => ({
          ...prev,
          bbs: (prev.bbs || []).filter(bb => bb.id !== id)
      }));
  };

  const [interval, setIntervalState] = useState('15');
  const [isLoading, setIsLoading] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState(false);
  const [slotDims, setSlotDims] = useState({ width: 0, height: 0 });

  const dynamicScale = useMemo(() => {
    const baseW = 180; 
    const baseH = 75;
    const targetW = Math.max(45, slotDims.width * 0.22);
    const targetH = Math.max(22, slotDims.height * 0.07);
    const scale = Math.min(targetW / baseW, targetH / baseH);
    return Math.max(0.32, Math.min(scale, 0.95)); 
  }, [slotDims]);

  const [priceScaleWidth, setPriceScaleWidth] = useState(() => {
    const saved = localStorage.getItem(`dashPriceWidthV10_${index}`);
    return saved ? Number(saved) : 36;
  });

  const [chartFontSize, setChartFontSize] = useState(() => {
    const saved = localStorage.getItem(`dashFontSize_${index}`);
    return saved ? Number(saved) : 10;
  });

  const priceWidthRef = useRef(priceScaleWidth);
  const isResizingPrice = useRef(false);
  const dragStartX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    priceWidthRef.current = priceScaleWidth;
  }, [priceScaleWidth]);

  useEffect(() => {
    localStorage.setItem(`dashInd_${index}`, JSON.stringify(indicators));
    if (seriesListRef.current.volume) seriesListRef.current.volume.applyOptions({ visible: indicators.volume });
  }, [indicators, index]);

  useEffect(() => {
    localStorage.setItem(`dashDraw_${index}`, JSON.stringify(drawings));
  }, [drawings, index]);

  useEffect(() => {
      if (globalClearSignal > 0) setDrawings([]);
  }, [globalClearSignal]);

  useEffect(() => {
      if (globalUndoSignal > 0) {
          setDrawings(prev => prev.slice(0, -1));
      }
  }, [globalUndoSignal]);

  useEffect(() => {
    let rafId: number;
    
    const updateDOM = () => {
        if (chartRef.current && seriesRef.current && (drawings.length > 0 || activeDrawingRef.current)) {
            const ts = chartRef.current.timeScale();
            const ps = seriesRef.current;
            
            const paneWidth = slotDims.width - (priceScaleWidth !== null ? priceScaleWidth : 36);
            const paneHeight = slotDims.height - 26; // Approximate time scale height
            
            const updateLineEl = (d: any, idStr: string) => {
                const el = document.getElementById(idStr) as any;
                if (!el || !d || !d.p1 || !d.p2) return;
                
                const x1 = ts.logicalToCoordinate(d.p1.logical);
                const y1 = ps.priceToCoordinate(d.p1.price);
                const x2 = ts.logicalToCoordinate(d.p2.logical);
                const y2 = ps.priceToCoordinate(d.p2.price);
                
                if(x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
                    if (d.type === 'trend') {
                        el.setAttribute('x1', x1); el.setAttribute('y1', y1);
                        el.setAttribute('x2', x2); el.setAttribute('y2', y2);
                    } else if (d.type === 'horizontal' || d.type === 'alarm') {
                        el.setAttribute('x1', 0); el.setAttribute('y1', y1);
                        el.setAttribute('x2', paneWidth); el.setAttribute('y2', y1);
                    } else if (d.type === 'vertical') {
                        el.setAttribute('x1', x1); el.setAttribute('y1', 0);
                        el.setAttribute('x2', x1); el.setAttribute('y2', paneHeight);
                    }
                    el.style.display = 'block';
                } else {
                    if ((d.type === 'horizontal' || d.type === 'alarm') && y1 !== null) {
                        el.setAttribute('x1', 0); el.setAttribute('y1', y1);
                        el.setAttribute('x2', paneWidth); el.setAttribute('y2', y1);
                        el.style.display = 'block';
                    } else if (d.type === 'vertical' && x1 !== null) {
                        el.setAttribute('x1', x1); el.setAttribute('y1', 0);
                        el.setAttribute('x2', x1); el.setAttribute('y2', paneHeight);
                        el.style.display = 'block';
                    } else {
                        el.style.display = 'none';
                    }
                }
            };

            drawings.forEach(d => updateLineEl(d, `line-${index}-${d.id}`));
            if (activeDrawingRef.current) {
                updateLineEl(activeDrawingRef.current, `line-temp-${index}`);
            } else {
                const tempEl = document.getElementById(`line-temp-${index}`);
                if (tempEl) tempEl.style.display = 'none';
            }
        }
    };

    const loop = () => {
        updateDOM();
        rafId = requestAnimationFrame(loop);
    };
    loop();
    
    // Also subscribe to chart events for immediate sync during interaction
    let unsubTime: any;
    if (chartRef.current) {
        unsubTime = chartRef.current.timeScale().subscribeVisibleLogicalRangeChange(() => {
            // Force a sync when the chart moves without spawning a new loop
            updateDOM();
        });
    }

    return () => {
        cancelAnimationFrame(rafId);
        if (unsubTime && chartRef.current) {
            chartRef.current.timeScale().unsubscribeVisibleLogicalRangeChange(unsubTime);
        }
    };
  }, [drawings, index, slotDims, priceScaleWidth]);

  useEffect(() => {
      if (!chartRef.current || chartData.length === 0) return;

      const currentIds = (indicators.mas || []).map(m => m.id);

      Object.keys(maSeriesRef.current).forEach(idStr => {
          const id = Number(idStr);
          if (!currentIds.includes(id)) {
              chartRef.current.removeSeries(maSeriesRef.current[id]);
              delete maSeriesRef.current[id];
          }
      });

      (indicators.mas || []).forEach(ma => {
          let series = maSeriesRef.current[ma.id];
          
          if (!series) {
              series = chartRef.current.addLineSeries({
                  color: ma.color,
                  lineWidth: 2,
                  crosshairMarkerVisible: false,
                  visible: ma.visible
              });
              maSeriesRef.current[ma.id] = series;
          } else {
              series.applyOptions({ visible: ma.visible, color: ma.color });
          }

          if (ma.period > 0) {
              series.setData(calculateSMA(chartData, ma.period));
          }
      });
  }, [indicators.mas, chartData]);

  useEffect(() => {
      if (!chartRef.current || chartData.length === 0) return;

      const currentBBIds = (indicators.bbs || []).map(b => b.id);

      Object.keys(bbSeriesRef.current).forEach(idStr => {
          const id = Number(idStr);
          if (!currentBBIds.includes(id)) {
              chartRef.current.removeSeries(bbSeriesRef.current[id].upper);
              chartRef.current.removeSeries(bbSeriesRef.current[id].middle);
              chartRef.current.removeSeries(bbSeriesRef.current[id].lower);
              delete bbSeriesRef.current[id];
          }
      });

      (indicators.bbs || []).forEach(bb => {
          let seriesGroup = bbSeriesRef.current[bb.id];
          
          if (!seriesGroup) {
              seriesGroup = {
                  upper: chartRef.current.addLineSeries({ color: bb.color, lineWidth: 1, crosshairMarkerVisible: false, visible: bb.visible, lineStyle: 2 }),
                  middle: chartRef.current.addLineSeries({ color: bb.color, lineWidth: 1, crosshairMarkerVisible: false, visible: bb.visible }),
                  lower: chartRef.current.addLineSeries({ color: bb.color, lineWidth: 1, crosshairMarkerVisible: false, visible: bb.visible, lineStyle: 2 })
              };
              bbSeriesRef.current[bb.id] = seriesGroup;
          } else {
              seriesGroup.upper.applyOptions({ visible: bb.visible, color: bb.color });
              seriesGroup.middle.applyOptions({ visible: bb.visible, color: bb.color });
              seriesGroup.lower.applyOptions({ visible: bb.visible, color: bb.color });
          }

          if (bb.period > 0 && bb.stdDev > 0) {
              const bbData = calculateBB(chartData, bb.period, bb.stdDev);
              seriesGroup.upper.setData(bbData.upper);
              seriesGroup.middle.setData(bbData.middle);
              seriesGroup.lower.setData(bbData.lower);
          }
      });
  }, [indicators.bbs, chartData]);

  const handleMouseDownScale = (e: React.MouseEvent) => {
    isResizingPrice.current = true;
    dragStartX.current = e.clientX;
    startWidth.current = priceWidthRef.current;

    document.addEventListener('mousemove', handleMouseMoveScale);
    document.addEventListener('mouseup', handleMouseUpScale);
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
    e.stopPropagation();
  };

  const handleMouseMoveScale = (e: MouseEvent) => {
    if (!isResizingPrice.current || !slotRef.current) return;
    const deltaX = dragStartX.current - e.clientX;
    const newWidth = Math.max(20, Math.min(150, startWidth.current + deltaX));
    setPriceScaleWidth(newWidth);
    if (chartRef.current) {
        chartRef.current.priceScale('right').applyOptions({ width: newWidth });
    }
  };

  const handleMouseUpScale = () => {
    isResizingPrice.current = false;
    document.removeEventListener('mousemove', handleMouseMoveScale);
    document.removeEventListener('mouseup', handleMouseUpScale);
    document.body.style.cursor = 'default';
    if (priceWidthRef.current !== null) {
      localStorage.setItem(`dashPriceWidthV10_${index}`, priceWidthRef.current.toString());
    }
  };

  useEffect(() => {
    if (slotRef.current) {
      const gap = 16; 
      const newWidth = gridCols === 1 ? '100%' : `calc((100% - ${(gridCols - 1) * gap}px) / ${gridCols})`;
      slotRef.current.style.width = newWidth;
      
      const currentHeight = slotRef.current.style.height || '350px';
      localStorage.setItem(`dashSizeV2_${index}`, JSON.stringify({ width: newWidth, height: currentHeight }));
    }
  }, [gridCols, index]);

  const prevPriceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!coinData) return;
    let isCancelled = false;
    const updateTick = async () => {
      try {
        const ticker = await fetchTicker(coinData.exchange, coinData.symbol, coinData.quote);
        if (isCancelled || !ticker) return;
        
        const currentPrice = ticker.price;
        const prevPrice = prevPriceRef.current;
        
        if (prevPrice !== null && currentPrice !== prevPrice) {
            drawingsRef.current.forEach(d => {
                if (d.type === 'alarm') {
                    const alarmPrice = d.p1.price;
                    if ((prevPrice < alarmPrice && currentPrice >= alarmPrice) ||
                        (prevPrice > alarmPrice && currentPrice <= alarmPrice)) {
                        
                        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                        audio.play().catch(() => {});
                        
                        const toastMsg = t('alarm_toast', language).replace('{symbol}', coinData.symbol).replace('{price}', alarmPrice.toString());
                        const titleMsg = t('alarm_title', language);
                        
                        window.dispatchEvent(new CustomEvent('show-toast', { detail: toastMsg }));
                        
                        if (Notification.permission === 'granted') {
                            new Notification(titleMsg, { body: toastMsg });
                        } else if (Notification.permission !== 'denied') {
                            Notification.requestPermission().then(permission => {
                                if (permission === 'granted') {
                                    new Notification(titleMsg, { body: toastMsg });
                                }
                            });
                        }
                    }
                }
            });
        }
        prevPriceRef.current = currentPrice;
        
        setCurrentPrice(currentPrice); setPriceChange(ticker.change !== null ? ticker.change.toFixed(2) : null);
        if (seriesRef.current && lastBarRef.current) { const last = lastBarRef.current, updated = { ...last, high: Math.max(last.high, currentPrice), low: Math.min(last.low, currentPrice), close: currentPrice }; seriesRef.current.update(updated); }
      } catch (err) {}
    };
    const timer = setInterval(updateTick, coinData.exchange === 'UPBIT' || coinData.exchange === 'BITHUMB' ? 8000 : 3000); 
    updateTick(); return () => { isCancelled = true; clearInterval(timer); };
  }, [coinData]);

  useEffect(() => {
    if (!lwLoaded || !coinData || !chartContainerRef.current) return;
    let chartInstance: any = null; setIsLoading(true); setErrorStatus(false);
    let isMounted = true;
    const init = async () => {
      if (coinData.exchange === 'UPBIT' || coinData.exchange === 'BITHUMB') await new Promise(r => setTimeout(r, (index * 700))); 
      try {
        if (!(window as any).LightweightCharts || !isMounted) return;
        chartInstance = (window as any).LightweightCharts.createChart(chartContainerRef.current, { 
          width: chartContainerRef.current.clientWidth, 
          height: chartContainerRef.current.clientHeight, 
          layout: { 
            background: { type: 'solid', color: c.chartBg === 'transparent' ? 'transparent' : c.chartBg }, 
            textColor: c.chartText,
            fontSize: chartFontSize 
          }, 
          grid: { vertLines: { color: c.chartGrid }, horzLines: { color: c.chartGrid } }, 
          timeScale: { timeVisible: true, secondsVisible: false, borderColor: c.borderColor },
          rightPriceScale: { 
            borderColor: c.borderColor, 
            autoScale: true, 
            visible: true,
            width: priceWidthRef.current
          },
          localization: {
            priceFormatter: (price: number) => {
              if (price >= 1000000) return (price / 1000000).toFixed(1) + 'M'; 
              if (price >= 1000) return (price / 1000).toFixed(1) + 'K'; 
              if (price >= 10) return Math.floor(price).toString();
              if (price >= 0.1) return price.toFixed(2);
              if (price >= 0.00001) return price.toFixed(4);
              return price.toString();
            }
          }
        });
        chartRef.current = chartInstance;
        
        const series = chartInstance.addCandlestickSeries({ 
          upColor: c.upColor, 
          downColor: c.downColor, 
          borderVisible: false, 
          wickUpColor: c.upColor, 
          wickDownColor: c.downColor,
          priceFormat: {
            type: 'custom',
            formatter: (price: number) => {
              if (price >= 1000000) return (price / 1000000).toFixed(1) + 'M'; 
              if (price >= 1000) return (price / 1000).toFixed(1) + 'K'; 
              if (price >= 10) return Math.floor(price).toString();
              if (price >= 0.1) return price.toFixed(2);
              if (price >= 0.00001) return price.toFixed(5);
              return price.toString();
            }
          }
        });
        seriesRef.current = series;
        
        const volumeSeries = chartInstance.addHistogramSeries({
            color: '#26a69a',
            priceFormat: { type: 'volume' },
            priceScaleId: '', 
            visible: indicators.volume,
        });
        volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
        seriesListRef.current.volume = volumeSeries;

        const data = await fetchCandles(coinData.exchange, coinData.symbol, coinData.quote, interval);
        if (isMounted) { 
          if (data && data.length > 0) { 
            series.setData(data); 
            lastBarRef.current = data[data.length - 1]; 
            setCurrentPrice(data[data.length - 1].close); 
            
            if (data[0].volume !== undefined) {
                const volData = data.map((d: any) => ({ time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)' }));
                volumeSeries.setData(volData);
            }

            setChartData(data); 

            chartInstance.priceScale('right').applyOptions({ width: priceWidthRef.current });
          } else { 
            setErrorStatus(true); 
          } 
        }
      } catch (e) { if(isMounted) setErrorStatus(true); } finally { if(isMounted) setIsLoading(false); }
    };
    init(); return () => { isMounted = false; if (chartInstance) { chartInstance.remove(); chartRef.current = null; seriesRef.current = null; lastBarRef.current = null; seriesListRef.current = { volume: null }; maSeriesRef.current = {}; bbSeriesRef.current = {}; } };
  }, [lwLoaded, coinData, c, interval, index]);

  useEffect(() => {
    const el = slotRef.current; if (!el) return;
    
    const saved = localStorage.getItem(`dashSizeV2_${index}`);
    if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.height) el.style.height = parsed.height;
    } else {
        el.style.height = '350px';
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === el) {
          const { width, height } = entry.contentRect;
          setSlotDims({ width, height });
          if (chartRef.current) chartRef.current.applyOptions({ width, height });
          
          if (el.style.width && el.style.height) {
              localStorage.setItem(`dashSizeV2_${index}`, JSON.stringify({ width: el.style.width, height: el.style.height }));
          }
        }
      }
    });
    observer.observe(el); return () => observer.disconnect();
  }, [index]);

  return (
    <div 
      ref={slotRef} 
      className={`custom-resizable ${c.cardBg} border ${c.borderColor} rounded-2xl flex flex-col group shadow-lg transition-colors duration-300 relative`} 
    >
      {coinData && (
        <>
          <div 
            className="absolute top-0 bottom-[26px] z-30 cursor-col-resize flex items-center justify-center group/resizer"
            style={{ 
                right: `${(priceScaleWidth !== null ? priceScaleWidth : 36) - 8}px`, 
                width: '16px'
            }}
            onMouseDown={handleMouseDownScale}
            title={t('drag_resize', language)}
          >
            <div className={`w-1 h-1/4 rounded-full ${c.accentBg} opacity-0 group-hover/resizer:opacity-50 transition-opacity`} />
          </div>

          <div className="absolute top-2 right-2 z-40 flex gap-1 items-center">
            
            <div className="relative">
              <button 
                onClick={() => setShowIndMenu(true)} 
                className="bg-black/60 backdrop-blur-md rounded-lg p-1.5 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                title={t('indicators', language)}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-white" />
              </button>
            </div>

            <div className="flex bg-black/60 backdrop-blur-md rounded-lg p-0.5 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
              <select value={interval} onChange={(e) => setIntervalState(e.target.value)} className="bg-transparent text-[10px] text-white font-bold px-1 outline-none cursor-pointer">
                {INTERVALS.map(i => <option key={i.value} value={i.value}>{t(`int_${i.value}`, language)}</option>)}
              </select>
            </div>
            <button onClick={onClear} className="bg-red-500 text-white p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg active:scale-90"><X className="w-4 h-4" /></button>
          </div>
        </>
      )}
      {coinData ? (
        <div className="relative w-full h-full flex flex-col overflow-hidden rounded-2xl">
          
          <svg 
              className="absolute inset-0 z-30 overflow-hidden"
              style={{ 
                  width: `calc(100% - ${priceScaleWidth !== null ? priceScaleWidth : 36}px)`, 
                  height: '100%',
                  pointerEvents: globalDrawTool ? 'auto' : 'none', 
                  cursor: globalDrawTool === 'eraser' ? 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'white\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21\'/%3E%3Cpath d=\'m22 21-10 0\'/%3E%3Cpath d=\'m5 11 9 9\'/%3E%3C/svg%3E") 12 12, auto' : (globalDrawTool ? 'crosshair' : 'default') 
              }}
              onClick={(e) => {
                  if (!globalDrawTool || !chartRef.current || !seriesRef.current) return;
                  
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;

                  // Eraser logic
                  if (globalDrawTool === 'eraser') {
                      // Find the closest drawing to the click
                      let closestId = null;
                      let minDistance = 20; // Increased threshold for easier erasing
                      
                      const ts = chartRef.current.timeScale();
                      const ps = seriesRef.current;
                      
                      drawings.forEach(d => {
                          const x1 = ts.logicalToCoordinate(d.p1.logical);
                          const y1 = ps.priceToCoordinate(d.p1.price);
                          const x2 = ts.logicalToCoordinate(d.p2.logical);
                          const y2 = ps.priceToCoordinate(d.p2.price);
                          
                          if (x1 === null || y1 === null) return;
                          
                          let dist = 1000;
                          if (d.type === 'trend' && x2 !== null && y2 !== null) {
                              const A = x - x1;
                              const B = y - y1;
                              const C = x2 - x1;
                              const D = y2 - y1;
                              const dot = A * C + B * D;
                              const len_sq = C * C + D * D;
                              let param = -1;
                              if (len_sq !== 0) param = dot / len_sq;
                              let xx, yy;
                              if (param < 0) { xx = x1; yy = y1; }
                              else if (param > 1) { xx = x2; yy = y2; }
                              else { xx = x1 + param * C; yy = y1 + param * D; }
                              const dx = x - xx;
                              const dy = y - yy;
                              dist = Math.sqrt(dx * dx + dy * dy);
                          } else if (d.type === 'horizontal' || d.type === 'alarm') {
                              dist = Math.abs(y - y1);
                          } else if (d.type === 'vertical') {
                              dist = Math.abs(x - x1);
                          }
                          
                          if (dist < minDistance) {
                              minDistance = dist;
                              closestId = d.id;
                          }
                      });
                      
                      if (closestId) {
                          setDrawings(prev => prev.filter(d => d.id !== closestId));
                      }
                      return;
                  }

                  e.stopPropagation();
                  const logical = chartRef.current.timeScale().coordinateToLogical(x);
                  const price = seriesRef.current.coordinateToPrice(y);
                  
                  if (logical === null || price === null) return;

                  if (drawStep === 0) {
                      if (globalDrawTool === 'horizontal' || globalDrawTool === 'vertical' || globalDrawTool === 'alarm') {
                          const newDrawing = {
                              id: Math.random().toString(36).substr(2, 9),
                              type: globalDrawTool,
                              p1: { logical, price },
                              p2: { logical, price },
                              color: globalDrawColor,
                              width: globalDrawWidth
                          };
                          setDrawings(prev => [...prev, newDrawing]);
                      } else {
                          activeDrawingRef.current = { 
                              id: 'temp', 
                              type: globalDrawTool, 
                              p1: { logical, price }, 
                              p2: { logical, price }, 
                              color: globalDrawColor, 
                              width: globalDrawWidth 
                          };
                          setDrawStep(1);
                      }
                  } else if (drawStep === 1) {
                      if (activeDrawingRef.current) {
                          const ts = chartRef.current.timeScale();
                          const ps = seriesRef.current;
                          const p1 = activeDrawingRef.current.p1;
                          // Prevent adding zero-length lines
                          const distPx = Math.sqrt(Math.pow(x - ts.logicalToCoordinate(p1.logical), 2) + Math.pow(y - ps.priceToCoordinate(p1.price), 2));
                          if (distPx < 5) {
                              // If clicked too close to start point, maybe user wants to cancel or it's a double click error
                              return;
                          }
                          
                          const newDrawing = { 
                            ...activeDrawingRef.current, 
                            p2: { logical, price },
                            id: Math.random().toString(36).substr(2, 9) 
                          };
                          setDrawings(prev => [...prev, newDrawing]);
                          activeDrawingRef.current = null;
                          setDrawStep(0);
                      }
                  }
              }}
              onMouseMove={(e) => {
                  if (drawStep === 1 && activeDrawingRef.current && chartRef.current && seriesRef.current) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const y = e.clientY - rect.top;
                      activeDrawingRef.current.p2.logical = chartRef.current.timeScale().coordinateToLogical(x);
                      activeDrawingRef.current.p2.price = seriesRef.current.coordinateToPrice(y);
                  }
              }}
              onContextMenu={(e) => {
                  if (drawStep === 1) {
                      e.preventDefault();
                      setDrawStep(0);
                      activeDrawingRef.current = null;
                  }
              }}
          >
              {drawings.map(d => (
                  <line key={d.id} id={`line-${index}-${d.id}`} stroke={d.color || globalDrawColor} strokeWidth={d.width || globalDrawWidth} strokeDasharray={d.type === 'alarm' ? '6,6' : undefined} style={{ display: 'none' }} />
              ))}
              <line id={`line-temp-${index}`} stroke={globalDrawColor} strokeWidth={globalDrawWidth} strokeDasharray={globalDrawTool === 'alarm' ? '6,6' : undefined} style={{ display: 'none' }} />
          </svg>

          <div 
            className="absolute top-[2%] left-[2%] z-10 pointer-events-none"
            style={{ 
              transform: `scale(${dynamicScale})`, 
              transformOrigin: 'top left',
            }}
          >
            <div className={`${c.infoBg} backdrop-blur-xl rounded-xl border ${c.infoBorder} p-4 shadow-2xl inline-block whitespace-nowrap transition-colors duration-300`}>
              <div className="flex flex-col items-start gap-2">
                <div className="flex items-center gap-3">
                  <span className={`text-[18px] font-bold ${c.infoText} tracking-tight`}>{coinData.symbol}</span>
                  <span className={`opacity-60 text-[14px] uppercase font-bold ${c.accentText}`}>{coinData.exchange}</span>
                  <div className={`${c.accentBg80} text-white text-[12px] px-2 py-0.5 rounded-full flex items-center gap-1 font-black shadow-inner`}>
                    <Clock className="w-3 h-3" /> {t(`int_${interval}`, language)}
                  </div>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className={`text-4xl font-mono font-black leading-none tracking-tighter ${parseFloat(priceChange || '0') >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {currentPrice?.toLocaleString(undefined, { minimumFractionDigits: currentPrice < 10 ? 4 : (currentPrice < 1000 ? 2 : 0) }) || '---'}
                  </span>
                  {priceChange !== null && (
                    <span className={`text-[18px] font-black px-3 py-1 rounded-lg bg-black/5 ${parseFloat(priceChange) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {parseFloat(priceChange) >= 0 ? '+' : ''}{priceChange}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/20 pointer-events-none flex-col gap-2">
              <Loader2 className={`w-8 h-8 animate-spin ${c.accentText}`} />
              <span className={`text-[10px] font-bold ${c.accentTextMuted}`}>{t('loading', language)}</span>
            </div>
          )}
          {errorStatus && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/10 text-center p-4 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2">
                <AlertCircle className="w-8 h-8 text-red-500 opacity-70" />
                <p className="text-xs text-red-500 font-bold">{t('fetch_failed', language)}</p>
              </div>
            </div>
          )}
          
          <div ref={chartContainerRef} className="flex-1 w-full h-full" onClick={() => setShowIndMenu(false)} />
          
          {showIndMenu && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
              <div className={`${c.modalBg} border ${c.borderColor} rounded-3xl p-6 w-full max-w-sm shadow-2xl relative transition-colors`}>
                <button onClick={() => setShowIndMenu(false)} className="absolute top-4 right-4"><X className="w-6 h-6" /></button>
                <h2 className={`text-xl font-black mb-6 flex items-center gap-2 ${c.text}`}><SlidersHorizontal className={`w-6 h-6 ${c.accentText}`} /> {t('indicators', language)}</h2>
                
                <div className="max-h-[50vh] overflow-y-auto pr-1 pb-1">
                  
                  <label className={`flex items-center justify-between gap-4 cursor-pointer p-4 rounded-2xl border ${c.borderColor} ${c.inputBg} hover:border-indigo-500/30 transition-colors mb-2`}>
                    <span className={`text-sm font-bold ${c.text}`}>{t('volume', language)}</span>
                    <div 
                      onClick={(e) => { e.preventDefault(); setIndicators({...indicators, volume: !indicators.volume}); }}
                      className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${indicators.volume ? 'bg-indigo-500' : 'bg-slate-700/50'}`}
                    >
                      <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${indicators.volume ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                  </label>

                  <div className={`flex items-center justify-between gap-4 p-4 rounded-2xl border ${c.borderColor} ${c.inputBg} hover:border-indigo-500/30 transition-colors mb-2`}>
                    <span className={`text-sm font-bold ${c.text}`}>{t('font_size', language)}</span>
                    <div className={`flex items-center bg-black/20 rounded-xl p-1 border ${c.borderColor}`}>
                        <button onClick={() => {
                            const newSize = Math.max(8, chartFontSize - 1);
                            setChartFontSize(newSize);
                            localStorage.setItem(`dashFontSize_${index}`, newSize.toString());
                            if (chartRef.current) {
                                chartRef.current.applyOptions({ layout: { fontSize: newSize } });
                            }
                        }} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">-</button>
                        <span className={`w-8 text-center font-bold text-sm ${c.text}`}>{chartFontSize}</span>
                        <button onClick={() => {
                            const newSize = Math.min(24, chartFontSize + 1);
                            setChartFontSize(newSize);
                            localStorage.setItem(`dashFontSize_${index}`, newSize.toString());
                            if (chartRef.current) {
                                chartRef.current.applyOptions({ layout: { fontSize: newSize } });
                            }
                        }} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">+</button>
                    </div>
                  </div>

                  <div className={`pt-4 pb-2 px-1 text-xs font-bold ${c.textMuted} flex justify-between items-center`}>
                      <span>{t('ma_lines', language)}</span>
                      <button onClick={addMA} className={`text-xs ${c.accentText} hover:underline flex items-center gap-1`}><Plus className="w-3 h-3"/>{t('add', language)}</button>
                  </div>

                  <div className="space-y-3 mb-4">
                    {(indicators.mas || []).map(ma => (
                        <div key={ma.id} className={`flex flex-col gap-3 p-4 rounded-2xl border ${c.borderColor} ${c.inputBg} shadow-sm group hover:border-indigo-500/30 transition-colors`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className={`text-sm font-black ${c.text} w-6 tracking-tighter`}>MA</span>
                                    <div className={`flex items-center bg-black/20 rounded-xl p-1 border ${c.borderColor}`}>
                                        <button onClick={() => updateMA(ma.id, 'period', Math.max(1, (ma.period || 20) - 1))} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">-</button>
                                        <input type="number" min="1" max="500" value={ma.period || ''} onChange={(e) => updateMA(ma.id, 'period', Number(e.target.value))} className={`w-10 bg-transparent ${c.text} text-center font-bold text-sm outline-none`} />
                                        <button onClick={() => updateMA(ma.id, 'period', Math.min(500, (ma.period || 20) + 1))} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">+</button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <div onClick={() => updateMA(ma.id, 'visible', !ma.visible)} className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${ma.visible ? 'bg-indigo-500' : 'bg-slate-700/50'}`}>
                                      <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${ma.visible ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </div>
                                    <button onClick={() => removeMA(ma.id)} className="text-red-400 opacity-50 group-hover:opacity-100 hover:bg-red-500/20 p-2 rounded-xl transition-all"><Trash2 className="w-4 h-4"/></button>
                                </div>
                            </div>
                            
                            <div className="flex items-center justify-between mt-1">
                               <div className="flex gap-2">
                                  {PRESET_COLORS.map(color => (
                                     <button
                                         key={color}
                                         onClick={() => updateMA(ma.id, 'color', color)}
                                         className={`w-6 h-6 rounded-full transition-all ${ma.color === color ? 'scale-125 ring-2 ring-white shadow-md' : 'opacity-40 hover:opacity-100 hover:scale-110'}`}
                                         style={{ backgroundColor: color }}
                                     />
                                  ))}
                               </div>
                            </div>
                        </div>
                    ))}
                  </div>

                  <div className={`pt-2 pb-2 px-1 text-xs font-bold ${c.textMuted} flex justify-between items-center border-t ${c.borderColor}`}>
                      <span>{t('bb_lines', language)}</span>
                      <button onClick={addBB} className={`text-xs ${c.accentText} hover:underline flex items-center gap-1`}><Plus className="w-3 h-3"/>{t('add', language)}</button>
                  </div>

                  <div className="space-y-3">
                    {(indicators.bbs || []).map(bb => (
                        <div key={bb.id} className={`flex flex-col gap-3 p-4 rounded-2xl border ${c.borderColor} ${c.inputBg} shadow-sm group hover:border-indigo-500/30 transition-colors`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className={`text-sm font-black ${c.text} w-6 tracking-tighter`}>BB</span>
                                    <div className={`flex items-center bg-black/20 rounded-xl p-1 border ${c.borderColor}`}>
                                        <button onClick={() => updateBB(bb.id, 'period', Math.max(1, (bb.period || 20) - 1))} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">-</button>
                                        <input type="number" min="1" max="500" value={bb.period || ''} onChange={(e) => updateBB(bb.id, 'period', Number(e.target.value))} className={`w-10 bg-transparent ${c.text} text-center font-bold text-sm outline-none`} />
                                        <button onClick={() => updateBB(bb.id, 'period', Math.min(500, (bb.period || 20) + 1))} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">+</button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <div onClick={() => updateBB(bb.id, 'visible', !bb.visible)} className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${bb.visible ? 'bg-indigo-500' : 'bg-slate-700/50'}`}>
                                      <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${bb.visible ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </div>
                                    <button onClick={() => removeBB(bb.id)} className="text-red-400 opacity-50 group-hover:opacity-100 hover:bg-red-500/20 p-2 rounded-xl transition-all"><Trash2 className="w-4 h-4"/></button>
                                </div>
                            </div>

                            <div className="flex items-center justify-between mt-1">
                               <div className="flex gap-2">
                                  {PRESET_COLORS.map(color => (
                                     <button
                                         key={color}
                                         onClick={() => updateBB(bb.id, 'color', color)}
                                         className={`w-6 h-6 rounded-full transition-all ${bb.color === color ? 'scale-125 ring-2 ring-white shadow-md' : 'opacity-40 hover:opacity-100 hover:scale-110'}`}
                                         style={{ backgroundColor: color }}
                                     />
                                  ))}
                               </div>
                            </div>
                        </div>
                    ))}
                  </div>

                </div>
                
                <div className="mt-8">
                  <button onClick={() => setShowIndMenu(false)} className={`w-full ${c.accentBg} text-white font-bold py-3 rounded-xl flex items-center justify-center transition-transform active:scale-95`}>
                    {t('confirm', language)}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-2 sm:p-4 text-center overflow-hidden">
          <h3 className={`text-xs sm:text-sm font-bold mb-2 sm:mb-3 opacity-50 ${c.text} truncate w-full`}>{t('slot', language)} {index + 1} {t('empty_status', language)}</h3>
          <select className={`w-full max-w-[180px] min-w-0 ${c.inputBg} border ${c.borderColor} ${c.text} rounded-lg p-1.5 sm:p-2.5 text-[10px] sm:text-xs mb-2 sm:mb-3 outline-none cursor-pointer font-bold truncate`} onChange={(e) => onAssignDirect(e.target.value)} defaultValue=""><option value="" disabled className={c.selectOptionBg}>{t('select_fav', language)}</option>{favorites.map(f => <option key={f.id} value={f.id} className={c.selectOptionBg}>{f.symbol} ({f.exchange})</option>)}</select>
          <button onClick={onOpenSearch} className={`${c.accentBg} hover:opacity-80 text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-bold shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-1.5 min-w-0 w-full max-w-[180px] truncate`}><Search className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" /> <span className="truncate">{t('search_new', language)}</span></button>
        </div>
      )}
    </div>
  );
}
