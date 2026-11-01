//+------------------------------------------------------------------+
//| TwoCandleMartingaleEA.mq4                                        |
//| Current chart timeframe, trend-following.                        |
//| 2 bullish candles in a row -> BUY, 2 bearish in a row -> SELL    |
//| Only opens when the symbol has no open position.                 |
//| After a losing trade (SL) next lots x1.5, after a win reset.     |
//| SL 500 points, TP 250 points.                                    |
//+------------------------------------------------------------------+
#property copyright "Two candle martingale"
#property version   "1.00"
#property strict

input double Lots              = 0.01;     // Starting lot size 初始手數
input double LossMultiplier    = 1.5;      // Lot multiplier after a loss 止損後手數倍數
input double MaxLots           = 1.00;     // Max lot size cap 最大手數上限
input int    MaxLossStreak     = 8;        // Reset after this many losses in a row 連續止損次數上限
input int    TakeProfitPoints  = 250;      // Take profit (points) 止賺
input int    StopLossPoints    = 500;      // Stop loss (points) 止損
input int    MagicNumber       = 20261015; // Magic number
input int    SlippagePoints    = 30;       // Max slippage (points)
input string TradeComment      = "TwoCandle";

datetime g_lastBar = 0;

int OnInit()
{
   if(Lots <= 0 || LossMultiplier < 1 || MaxLots < Lots || TakeProfitPoints <= 0 || StopLossPoints <= 0 || MaxLossStreak < 1)
   {
      Print("TwoCandleEA: check inputs (Lots > 0, multiplier >= 1, MaxLots >= Lots, TP/SL > 0)");
      return INIT_PARAMETERS_INCORRECT;
   }
   g_lastBar = Time[0];
   Print("TwoCandleEA started on ", Symbol(), " ", PeriodName(), " | lots ", DoubleToString(Lots, 2),
         " x", DoubleToString(LossMultiplier, 2), " after loss | TP ", TakeProfitPoints, " SL ", StopLossPoints, " points");
   return INIT_SUCCEEDED;
}

void OnTick()
{
   if(Time[0] == g_lastBar) return;
   g_lastBar = Time[0];

   if(Bars < 4) return;
   if(HasOpenPosition()) return;
   if(!IsTradeAllowed()) { Print("TwoCandleEA: AutoTrading is off"); return; }

   int signal = TwoCandleSignal();
   if(signal == OP_BUY || signal == OP_SELL) Open(signal);
}

// Last two closed candles (shift 1 and 2) of the current chart.
int TwoCandleSignal()
{
   bool up1 = Close[1] > Open[1], up2 = Close[2] > Open[2];
   bool dn1 = Close[1] < Open[1], dn2 = Close[2] < Open[2];
   if(up1 && up2) return OP_BUY;
   if(dn1 && dn2) return OP_SELL;
   return -1;
}

// Any open BUY/SELL on this symbol, from this EA or anything else.
bool HasOpenPosition()
{
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() == Symbol() && OrderType() <= OP_SELL) return true;
   }
   return false;
}

// Number of losing trades in a row, newest first, for this EA and symbol.
int LossStreak()
{
   int total = OrdersHistoryTotal();
   datetime times[];
   double results[];
   ArrayResize(times, 0);
   ArrayResize(results, 0);
   for(int i = 0; i < total; i++)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY)) continue;
      if(OrderSymbol() != Symbol() || OrderMagicNumber() != MagicNumber || OrderType() > OP_SELL) continue;
      int n = ArraySize(times);
      ArrayResize(times, n + 1);
      ArrayResize(results, n + 1);
      times[n] = OrderCloseTime();
      results[n] = OrderProfit() + OrderSwap() + OrderCommission();
   }

   int count = ArraySize(times);
   int streak = 0;
   bool used[];
   ArrayResize(used, count);
   ArrayInitialize(used, false);
   for(int k = 0; k < count; k++)
   {
      int newest = -1;
      for(int j = 0; j < count; j++)
         if(!used[j] && (newest < 0 || times[j] > times[newest])) newest = j;
      used[newest] = true;
      if(results[newest] >= 0) break;
      streak++;
   }
   return streak;
}

double NextLots()
{
   int streak = LossStreak();
   if(streak >= MaxLossStreak)
   {
      Print("TwoCandleEA: ", streak, " losses in a row, back to starting lots");
      streak = 0;
   }
   double lots = Lots * MathPow(LossMultiplier, streak);
   return NormalizeLots(MathMin(lots, MaxLots));
}

double NormalizeLots(double lots)
{
   double minLot = MarketInfo(Symbol(), MODE_MINLOT);
   double maxLot = MarketInfo(Symbol(), MODE_MAXLOT);
   double step   = MarketInfo(Symbol(), MODE_LOTSTEP);
   if(step <= 0) step = 0.01;
   lots = MathRound(lots / step) * step;
   return NormalizeDouble(MathMax(minLot, MathMin(maxLot, lots)), 2);
}

void Open(int type)
{
   int stopLevel = (int)MarketInfo(Symbol(), MODE_STOPLEVEL);
   int tpPts = MathMax(TakeProfitPoints, stopLevel + 1);
   int slPts = MathMax(StopLossPoints, stopLevel + 1);
   double lots = NextLots();

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
         Print("TwoCandleEA: ", (type == OP_BUY ? "BUY" : "SELL"), " #", ticket, " ", DoubleToString(lots, 2),
               " lots @ ", DoubleToString(price, Digits), " SL ", DoubleToString(sl, Digits), " TP ", DoubleToString(tp, Digits));
         return;
      }
      Print("TwoCandleEA: open failed (attempt ", attempt, "), error ", GetLastError());
      Sleep(500);
   }
}

string PeriodName()
{
   switch(Period())
   {
      case PERIOD_M1:  return "M1";
      case PERIOD_M5:  return "M5";
      case PERIOD_M15: return "M15";
      case PERIOD_M30: return "M30";
      case PERIOD_H1:  return "H1";
      case PERIOD_H4:  return "H4";
      case PERIOD_D1:  return "D1";
      case PERIOD_W1:  return "W1";
      case PERIOD_MN1: return "MN1";
   }
   return IntegerToString(Period());
}
//+------------------------------------------------------------------+
