//+------------------------------------------------------------------+
//| CopyTestEA.mq4                                                   |
//| Test EA for the copy system (M5 three-candle reversal).          |
//| 3 bullish M5 candles in a row -> SELL                            |
//| 3 bearish M5 candles in a row -> BUY                             |
//| TP 100 points, SL 300 points, all closed before Friday close.    |
//+------------------------------------------------------------------+
#property copyright "Copy system test"
#property version   "1.00"
#property strict

input double Lots               = 0.01;     // Lot size 手數
input int    TakeProfitPoints   = 100;      // Take profit (points) 止賺
input int    StopLossPoints     = 300;      // Stop loss (points) 止損
input int    MaxOpenTrades      = 1;        // Max open trades of this EA 最多同時持倉
input int    FridayCloseHour    = 23;       // Friday close-all hour (server time) 星期五平倉 時
input int    FridayCloseMinute  = 0;        // Friday close-all minute (server time) 星期五平倉 分
input int    MagicNumber        = 20261014; // Magic number
input int    SlippagePoints     = 30;       // Max slippage (points)
input string TradeComment       = "CopyTest";

datetime g_lastBar = 0;

int OnInit()
{
   if(TakeProfitPoints <= 0 || StopLossPoints <= 0 || Lots <= 0)
   {
      Print("CopyTestEA: TP, SL and Lots must be above 0");
      return INIT_PARAMETERS_INCORRECT;
   }
   g_lastBar = iTime(Symbol(), PERIOD_M5, 0);
   Print("CopyTestEA started on ", Symbol(), " | M5 | TP ", TakeProfitPoints, " SL ", StopLossPoints,
         " points | Friday close ", FridayCloseHour, ":", StringFormat("%02d", FridayCloseMinute), " server time");
   return INIT_SUCCEEDED;
}

void OnTick()
{
   if(IsFridayCloseTime())
   {
      CloseAll();
      return;
   }
   if(!IsTradingDay()) return;

   datetime bar = iTime(Symbol(), PERIOD_M5, 0);
   if(bar == 0 || bar == g_lastBar) return;
   g_lastBar = bar;

   if(CountOpen() >= MaxOpenTrades) return;
   if(!IsTradeAllowed()) { Print("CopyTestEA: AutoTrading is off"); return; }

   int signal = ThreeCandleSignal();
   if(signal == OP_SELL) Open(OP_SELL);
   else if(signal == OP_BUY) Open(OP_BUY);
}

// Looks at the last three closed M5 candles (shift 1, 2, 3).
int ThreeCandleSignal()
{
   if(iBars(Symbol(), PERIOD_M5) < 5) return -1;
   int up = 0, down = 0;
   for(int i = 1; i <= 3; i++)
   {
      double o = iOpen(Symbol(), PERIOD_M5, i);
      double c = iClose(Symbol(), PERIOD_M5, i);
      if(c > o) up++;
      else if(c < o) down++;
   }
   if(up == 3) return OP_SELL;
   if(down == 3) return OP_BUY;
   return -1;
}

bool IsTradingDay()
{
   int d = DayOfWeek();
   return d >= 1 && d <= 5;
}

bool IsFridayCloseTime()
{
   datetime now = TimeCurrent();
   int d = TimeDayOfWeek(now);
   if(d == 6 || d == 0) return true;
   if(d != 5) return false;
   return TimeHour(now) * 60 + TimeMinute(now) >= FridayCloseHour * 60 + FridayCloseMinute;
}

int CountOpen()
{
   int n = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() == Symbol() && OrderMagicNumber() == MagicNumber && OrderType() <= OP_SELL) n++;
   }
   return n;
}

double NormalizeLots(double lots)
{
   double minLot = MarketInfo(Symbol(), MODE_MINLOT);
   double maxLot = MarketInfo(Symbol(), MODE_MAXLOT);
   double step   = MarketInfo(Symbol(), MODE_LOTSTEP);
   if(step <= 0) step = 0.01;
   lots = MathFloor(lots / step + 1e-9) * step;
   return NormalizeDouble(MathMax(minLot, MathMin(maxLot, lots)), 2);
}

void Open(int type)
{
   int stopLevel = (int)MarketInfo(Symbol(), MODE_STOPLEVEL);
   int tpPts = MathMax(TakeProfitPoints, stopLevel + 1);
   int slPts = MathMax(StopLossPoints, stopLevel + 1);
   double lots = NormalizeLots(Lots);

   for(int attempt = 1; attempt <= 3; attempt++)
   {
      RefreshRates();
      double price = type == OP_BUY ? Ask : Bid;
      double sl = type == OP_BUY ? price - slPts * Point : price + slPts * Point;
      double tp = type == OP_BUY ? price + tpPts * Point : price - tpPts * Point;
      int ticket = OrderSend(Symbol(), type, lots, NormalizeDouble(price, Digits), SlippagePoints,
                             NormalizeDouble(sl, Digits), NormalizeDouble(tp, Digits),
                             TradeComment, MagicNumber, 0, type == OP_BUY ? clrDodgerBlue : clrOrangeRed);
      if(ticket > 0)
      {
         Print("CopyTestEA: ", (type == OP_BUY ? "BUY" : "SELL"), " #", ticket, " ", DoubleToString(lots, 2),
               " lots @ ", DoubleToString(price, Digits), " SL ", DoubleToString(sl, Digits), " TP ", DoubleToString(tp, Digits));
         return;
      }
      Print("CopyTestEA: open failed (attempt ", attempt, "), error ", GetLastError());
      Sleep(500);
   }
}

void CloseAll()
{
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != Symbol() || OrderMagicNumber() != MagicNumber || OrderType() > OP_SELL) continue;
      for(int attempt = 1; attempt <= 3; attempt++)
      {
         RefreshRates();
         double price = OrderType() == OP_BUY ? Bid : Ask;
         if(OrderClose(OrderTicket(), OrderLots(), NormalizeDouble(price, Digits), SlippagePoints, clrYellow))
         {
            Print("CopyTestEA: Friday close #", OrderTicket());
            break;
         }
         Print("CopyTestEA: close failed #", OrderTicket(), " error ", GetLastError());
         Sleep(500);
      }
   }
}
//+------------------------------------------------------------------+
