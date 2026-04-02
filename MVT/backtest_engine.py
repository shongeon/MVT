import sys
import json
import pandas as pd
import numpy as np

def run_backtest(data):
    try:
        # JSON 데이터를 DataFrame으로 변환
        df = pd.DataFrame(data)
        
        # 데이터가 비어있는지 확인
        if df.empty:
            return {"error": "No data available for backtesting"}
            
        # --- 전략 로직: 단순 이동평균 전략 ---
        df['sma'] = df['close'].rolling(window=20).mean()
        df['signal'] = 0
        df.loc[df['close'] > df['sma'], 'signal'] = 1
        
        # 거래 계산 (signal이 0에서 1로 바뀔 때 매수, 1에서 0으로 바뀔 때 매도)
        df['position'] = df['signal'].diff()
        
        # 수익률 계산 (간단하게 종가 기준)
        df['returns'] = df['close'].pct_change()
        df['strategy_returns'] = df['signal'].shift(1) * df['returns']
        
        # 지표 계산
        total_return = float(df['strategy_returns'].cumsum().iloc[-1])
        
        # 거래 횟수 (매수/매도 전환 횟수)
        total_trades = int(df['position'].abs().sum())
        
        # 승률 계산 (전략 수익이 0보다 큰 거래의 비율)
        win_rate = float((df['strategy_returns'] > 0).sum() / (df['strategy_returns'] != 0).sum()) if (df['strategy_returns'] != 0).sum() > 0 else 0.0
        
        results = {
            "total_return": round(total_return * 100, 2), # % 단위
            "win_rate": round(win_rate * 100, 2),         # % 단위
            "total_trades": total_trades
        }
        return results
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    try:
        # Node.js에서 전달받은 데이터
        data = json.loads(sys.argv[1])
        result = run_backtest(data)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
