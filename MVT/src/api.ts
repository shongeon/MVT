import { INTERVALS } from './constants';

let preferredProxy: string | null = null;

export const smartFetch = async (url: string, exchange: string, retryCount = 0): Promise<any> => {
  const finalUrl = exchange === 'UPBIT' || exchange === 'BITHUMB' ? `${url}${url.includes('?') ? '&' : '?'}cb=${Date.now()}` : url;
  let strategies = [
    { name: 'direct', url: finalUrl },
    { name: 'allorigins', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(finalUrl)}` },
    { name: 'corsproxy', url: `https://corsproxy.io/?${encodeURIComponent(finalUrl)}` },
    { name: 'codetabs', url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(finalUrl)}` }
  ];
  
  if (preferredProxy) {
      const pref = strategies.find(s => s.name === preferredProxy);
      if (pref) {
          strategies = [pref, ...strategies.filter(s => s.name !== preferredProxy)];
      }
  }
  
  for (const s of strategies) {
    let id: any;
    try {
      const controller = new AbortController();
      id = setTimeout(() => controller.abort(), (exchange === 'UPBIT' || exchange === 'BITHUMB') ? 4000 : 7000);
      const res = await fetch(s.url, { signal: controller.signal });
      if (res.ok) {
          const json = await res.json();
          clearTimeout(id);
          if (s.name !== 'direct') preferredProxy = s.name;
          return json;
      }
      clearTimeout(id);
    } catch (e) {
      if (id) clearTimeout(id);
    }
  }
  
  if (retryCount < 2) {
    await new Promise(r => setTimeout(r, 2000 + (retryCount * 1000)));
    return smartFetch(url, exchange, retryCount + 1);
  }
  throw new Error('Connection failed');
};

export const fetchTicker = async (exchange: string, symbol: string, quote: string) => {
  try {
    const q = quote.replace('.P', '');
    const fetchFromUrl = async (url: string) => {
        return await smartFetch(url, exchange);
    };

    if (exchange === 'UPBIT') {
      const data = await fetchFromUrl(`https://api.upbit.com/v1/ticker?markets=${q}-${symbol}`);
      if (Array.isArray(data) && data.length > 0) return { price: data[0].trade_price, change: data[0].signed_change_rate * 100 };
    
    } else if (exchange === 'BITHUMB') {
      const data = await fetchFromUrl(`https://api.bithumb.com/public/ticker/${symbol}_${q}`);
      if (data.status === "0000") return { price: parseFloat(data.data.closing_price), change: parseFloat(data.data.fluctate_rate_24H) };
    
    } else if (exchange === 'BINANCE') {
      try {
          const data = await fetchFromUrl(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}${q}`);
          if (data.lastPrice || data.price) return { price: parseFloat(data.lastPrice || data.price), change: parseFloat(data.priceChangePercent || 0) };
      } catch(e) {}
      try {
          const data = await fetchFromUrl(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}${q}`);
          if (data.lastPrice || data.price) return { price: parseFloat(data.lastPrice || data.price), change: parseFloat(data.priceChangePercent || 0) };
      } catch(e) {}
    
    } else if (exchange === 'OKX') {
      try {
          const data = await fetchFromUrl(`https://www.okx.com/api/v5/market/ticker?instId=${symbol}-${q}`);
          if (data.data?.[0]) return { price: parseFloat(data.data[0].last), change: parseFloat(data.data[0].open24h) ? ((parseFloat(data.data[0].last) - parseFloat(data.data[0].open24h)) / parseFloat(data.data[0].open24h)) * 100 : 0 };
      } catch(e) {}
      try {
          const data = await fetchFromUrl(`https://www.okx.com/api/v5/market/ticker?instId=${symbol}-${q}-SWAP`);
          if (data.data?.[0]) return { price: parseFloat(data.data[0].last), change: parseFloat(data.data[0].open24h) ? ((parseFloat(data.data[0].last) - parseFloat(data.data[0].open24h)) / parseFloat(data.data[0].open24h)) * 100 : 0 };
      } catch(e) {}
    
    } else if (exchange === 'BYBIT') {
      try {
          const data = await fetchFromUrl(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}${q}`);
          if (data.result?.list?.[0]) return { price: parseFloat(data.result.list[0].lastPrice), change: parseFloat(data.result.list[0].price24hPcnt) * 100 };
      } catch(e) {}
      try {
          const data = await fetchFromUrl(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}${q}`);
          if (data.result?.list?.[0]) return { price: parseFloat(data.result.list[0].lastPrice), change: parseFloat(data.result.list[0].price24hPcnt) * 100 };
      } catch(e) {}
    }
    return null;
  } catch (err) { return null; }
};

export const fetchCandles = async (exchange: string, symbol: string, quote: string, intervalValue: string) => {
  try {
    const q = quote.replace('.P', '');
    const intv = INTERVALS.find(i => i.value === intervalValue) || INTERVALS[2];
    let parsed: any[] = [];
    
    const fetchFromUrl = async (url: string) => {
        return await smartFetch(url, exchange);
    };

    if (exchange === 'UPBIT') {
      const toStr = new Date(Date.now() - 60000).toISOString().slice(0, 19).replace('T', ' ');
      const data1 = await fetchFromUrl(`https://api.upbit.com/v1/candles/${intv.upbit}?market=${q}-${symbol}&count=200&to=${encodeURIComponent(toStr)}`);
      if (Array.isArray(data1)) {
        parsed = [...data1];
        if (data1.length === 200) {
          const lastTime = new Date(data1[199].candle_date_time_utc + 'Z').toISOString().replace('T', ' ').slice(0, 19);
          try {
            const data2 = await fetchFromUrl(`https://api.upbit.com/v1/candles/${intv.upbit}?market=${q}-${symbol}&count=200&to=${encodeURIComponent(lastTime)}`);
            if (Array.isArray(data2)) parsed = [...parsed, ...data2];
          } catch(e) {}
        }
      }
      parsed = parsed.map(item => ({ time: Math.floor(new Date(item.candle_date_time_utc + 'Z').getTime() / 1000), open: item.opening_price, high: item.high_price, low: item.low_price, close: item.trade_price, volume: item.candle_acc_trade_volume })).reverse();
    
    } else if (exchange === 'BITHUMB') {
      const data = await fetchFromUrl(`https://api.bithumb.com/public/candlestick/${symbol}_${q}/${intv.bithumb}`);
      if (data.status === "0000" && Array.isArray(data.data)) {
        parsed = data.data.map(i => ({
            time: Math.floor(parseInt(i[0]) / 1000),
            open: parseFloat(i[1]),
            close: parseFloat(i[2]),
            high: parseFloat(i[3]),
            low: parseFloat(i[4]),
            volume: parseFloat(i[5])
        }));
      }

    } else if (exchange === 'BINANCE') {
      let data = null;
      try { data = await fetchFromUrl(`https://api.binance.com/api/v3/klines?symbol=${symbol}${q}&interval=${intv.binance}&limit=1000`); } catch (e) {}
      if (!Array.isArray(data) || data.length === 0 || (data as any).code) {
          try { data = await fetchFromUrl(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}${q}&interval=${intv.binance}&limit=1000`); } catch(e) {}
      }
      if (Array.isArray(data)) parsed = data.map(i => ({ time: Math.floor(i[0] / 1000), open: parseFloat(i[1]), high: parseFloat(i[2]), low: parseFloat(i[3]), close: parseFloat(i[4]), volume: parseFloat(i[5]) }));
    
    } else if (exchange === 'OKX') {
      let data = null;
      try { data = await fetchFromUrl(`https://www.okx.com/api/v5/market/candles?instId=${symbol}-${q}&bar=${intv.okx}&limit=300`); } catch(e) {}
      if (!data?.data || data.data.length === 0) {
          try { data = await fetchFromUrl(`https://www.okx.com/api/v5/market/candles?instId=${symbol}-${q}-SWAP&bar=${intv.okx}&limit=300`); } catch(e) {}
      }
      if (data?.data) parsed = data.data.map(i => ({ time: Math.floor(parseInt(i[0]) / 1000), open: parseFloat(i[1]), high: parseFloat(i[2]), low: parseFloat(i[3]), close: parseFloat(i[4]), volume: parseFloat(i[5]) })).reverse();
    
    } else if (exchange === 'BYBIT') {
      let data = null;
      try { data = await fetchFromUrl(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}${q}&interval=${intv.bybit}&limit=1000`); } catch(e) {}
      if (!data?.result?.list || data.result.list.length === 0) {
          try { data = await fetchFromUrl(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}${q}&interval=${intv.bybit}&limit=1000`); } catch(e) {}
      }
      if (data?.result?.list) parsed = data.result.list.map(i => ({ time: Math.floor(parseInt(i[0]) / 1000), open: parseFloat(i[1]), high: parseFloat(i[2]), low: parseFloat(i[3]), close: parseFloat(i[4]), volume: parseFloat(i[5]) })).reverse();
    }
    
    return parsed.filter(d => d && d.time && !isNaN(d.time)).sort((a, b) => a.time - b.time).filter((v, i, a) => i === 0 || v.time > a[i - 1].time);
  } catch (err) { return []; }
};

export const fetchAvailableMarkets = async (exchange: string) => {
  try {
    const fetchFromUrl = async (url: string) => {
        return await smartFetch(url, exchange);
    };
    
    let markets: any[] = [];
    if (exchange === 'UPBIT') {
      try {
        const data = await fetchFromUrl('https://api.upbit.com/v1/market/all');
        if (Array.isArray(data)) data.forEach(m => { const [q, s] = m.market.split('-'); markets.push({ symbol: s, quote: q, display: m.market, name: m.korean_name }); });
      } catch(e) {}
    } else if (exchange === 'BITHUMB') {
      try {
        const data = await fetchFromUrl('https://api.bithumb.com/public/ticker/ALL_KRW');
        if (data && data.data) Object.keys(data.data).forEach(s => { if (s !== 'date') markets.push({ symbol: s, quote: 'KRW', display: `KRW-${s}`, name: '' }); });
      } catch(e) {}
      try {
        const dataBTC = await fetchFromUrl('https://api.bithumb.com/public/ticker/ALL_BTC');
        if (dataBTC && dataBTC.data) Object.keys(dataBTC.data).forEach(s => { if (s !== 'date') markets.push({ symbol: s, quote: 'BTC', display: `BTC-${s}`, name: '' }); });
      } catch(e) {}
    } else if (exchange === 'BINANCE') {
      try {
          const spotData = await fetchFromUrl('https://api.binance.com/api/v3/exchangeInfo');
          if (spotData.symbols) spotData.symbols.forEach((s: any) => { markets.push({ symbol: s.baseAsset, quote: s.quoteAsset, display: `${s.baseAsset}/${s.quoteAsset}`, name: '' }); });
      } catch(e) {}
      try {
          const futData = await fetchFromUrl('https://fapi.binance.com/fapi/v1/exchangeInfo');
          if (futData.symbols) futData.symbols.forEach((s: any) => { markets.push({ symbol: s.baseAsset, quote: s.quoteAsset, display: `${s.baseAsset}/${s.quoteAsset} (선물)`, name: '' }); });
      } catch(e) {}
    } else if (exchange === 'OKX') {
      try {
          const spotData = await fetchFromUrl('https://www.okx.com/api/v5/public/instruments?instType=SPOT');
          if (spotData.data) spotData.data.forEach((s: any) => { markets.push({ symbol: s.baseCcy, quote: s.quoteCcy, display: `${s.baseCcy}/${s.quoteCcy}`, name: '' }); });
      } catch(e) {}
      try {
          const swapData = await fetchFromUrl('https://www.okx.com/api/v5/public/instruments?instType=SWAP');
          if (swapData.data) swapData.data.forEach((s: any) => { const [base, quote] = s.instId.split('-'); markets.push({ symbol: base, quote: quote, display: `${base}/${quote} (선물)`, name: '' }); });
      } catch(e) {}
    } else if (exchange === 'BYBIT') {
      try {
          const spotData = await fetchFromUrl('https://api.bybit.com/v5/market/instruments-info?category=spot');
          if (spotData.result?.list) spotData.result.list.forEach((s: any) => { markets.push({ symbol: s.baseCoin, quote: s.quoteCoin, display: `${s.baseCoin}/${s.quoteCoin}`, name: '' }); });
      } catch(e) {}
      try {
          const futData = await fetchFromUrl('https://api.bybit.com/v5/market/instruments-info?category=linear');
          if (futData.result?.list) futData.result.list.forEach((s: any) => { markets.push({ symbol: s.baseCoin, quote: s.quoteCoin, display: `${s.baseCoin}/${s.quoteCoin} (선물)`, name: '' }); });
      } catch(e) {}
    }
    
    const uniqueMarkets: any[] = [];
    const seen = new Set();
    for (const m of markets) {
       if (!seen.has(m.display)) {
          seen.add(m.display);
          uniqueMarkets.push(m);
       }
    }
    return uniqueMarkets;
  } catch (err) { return []; }
};
