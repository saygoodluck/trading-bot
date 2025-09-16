import sys
import json
import pandas as pd
import numpy as np
import mplfinance as mpf

# Получаем входные данные из аргументов
raw_input = sys.argv[1]
parsed_input = json.loads(raw_input)

# Парсим свечи
data = parsed_input['candles']
cols = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
df = pd.DataFrame(data, columns=cols)
# Конвертируем timestamp в индекс
df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
df.set_index('timestamp', inplace=True)
# Приводим типы
for col in ['open','high','low','close','volume']:
    df[col] = df[col].astype(float)

# Обрабатываем трейды (если есть)
trades = parsed_input.get('trades', [])
addplots = []
if trades:
    tdf = pd.DataFrame(trades)
    tdf['timestamp'] = pd.to_datetime(tdf['timestamp'])
    df['buy_marker'] = np.nan
    df['sell_marker'] = np.nan
    for _, trade in tdf.iterrows():
        ts = pd.to_datetime(trade['timestamp']).tz_localize(None)
        price = float(trade['price'])
        action = trade['action'].lower()
        idx = df.index.get_indexer([ts], method='nearest')[0]
        if action == 'buy':
            df.iloc[idx, df.columns.get_loc('buy_marker')] = price
        elif action == 'sell':
            df.iloc[idx, df.columns.get_loc('sell_marker')] = price
    # Дополнительные точки на графике
    addplots.append(mpf.make_addplot(df['buy_marker'], type='scatter', marker='^', markersize=100, color='green'))
    addplots.append(mpf.make_addplot(df['sell_marker'], type='scatter', marker='v', markersize=100, color='red'))

# Настройка цветов и стиля
mc = mpf.make_marketcolors(up='green', down='red', edge='inherit', wick='inherit', volume='in')
style = mpf.make_mpf_style(
    base_mpf_style='nightclouds',
    marketcolors=mc,
    rc={'font.size':12, 'axes.labelsize':14, 'axes.titleweight':'bold'}
)

# Функция рисования графика
def draw_chart(dataframe):
    mpf.plot(
        dataframe,
        type='candle',
        style=style,
        title='Backtest Chart',
        ylabel='Price, USDT',
        volume=True,
        addplot=addplots if addplots else None,
        mav=(20, 50),
        warn_too_much_data=100000,
        savefig=dict(fname='logs/chart.png', dpi=200, bbox_inches='tight')
    )

if __name__ == '__main__':
    draw_chart(df)
