export interface CoinData {
  exchange: string;
  symbol: string;
  quote: string;
  id: string;
}

export interface IndicatorSettings {
  volume: boolean;
  mas: MASetting[];
  bbs: BBSetting[];
}

export interface MASetting {
  id: number;
  period: number;
  color: string;
  visible: boolean;
}

export interface BBSetting {
  id: number;
  period: number;
  stdDev: number;
  color: string;
  visible: boolean;
}

export interface DrawingPoint {
  logical: number;
  price: number;
}

export interface Drawing {
  id: string;
  type: 'trend' | 'horizontal' | 'vertical';
  p1: DrawingPoint;
  p2: DrawingPoint;
  color: string;
  width: number;
}

export interface SaveSlot {
  id: number;
  name: string;
  data: any | null;
}
