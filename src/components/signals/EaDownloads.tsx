import { EaDownloadCard } from '@/components/signals/EaDownloadCard';

export function EaDownloads() {
  return (
    <div className="space-y-4">
      <EaDownloadCard
        file="CopyTestEA.mq4"
        title="Copy test EA (MT4) · 跟單測試 EA"
        description="M5: 3 bullish candles = SELL, 3 bearish = BUY. TP 100 / SL 300 points, closes all before Friday close. Run it on a master account only; its trades are copied to followers."
        descriptionZh="5 分鐘圖連續三支陽燭沽出、三支陰燭買入；止賺 100、止損 300 points；星期五收市前全部平倉。只可放在主帳戶，交易會被跟單。"
      />
      <EaDownloadCard
        file="TwoCandleMartingaleEA.mq4"
        title="Two candle EA (MT4) · 兩燭順勢加倍 EA"
        description="Chart timeframe: 2 bullish candles = BUY, 2 bearish = SELL, only when the symbol has no open position. TP 250 / SL 500 points. After a loss the next lot is x1.5, after a win it resets."
        descriptionZh="按圖表時間框：連續兩支陽燭買入、兩支陰燭沽出，同一產品無持倉先開單；止賺 250、止損 500 points；止損後下一單手數 x1.5，止賺後回到初始手數。"
      />
    </div>
  );
}
