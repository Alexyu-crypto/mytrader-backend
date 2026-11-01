/*
+------------------------------------------------------------------+
|                     MT5LiveBridge.mq5  v3.0                      |
|              MT5 to Supabase Live Bridge EA                      |
|                                                                  |
|  SETUP GUIDE:                                                    |
|  1. Tools -> Options -> Expert Advisors                          |
|  2. Check "Allow WebRequest for listed URL"                      |
|  3. Add the SupabaseUrl shown below to the list                  |
|  4. Attach this EA to ONE chart only (one EA per account)        |
|  5. AccountLabel must EXACTLY match the website account name     |
|  6. Enable Algo Trading                                          |
|  NOTE: Use a HEDGING account for followers (netting merges       |
|        positions per symbol and cannot track copies 1:1).        |
|                                                                  |
|  HOW IT WORKS:                                                   |
|  - Upserts open positions (no delete/re-insert gap)              |
|  - Uploads newly closed trades in one batched request            |
|  - Uploads deposits/withdrawals; full history once on start      |
|  - Master: pushes every trade change the instant it happens      |
|    (trade events) plus a fast safety loop (FastPollMs)           |
|  - Follower: waits on an open request (WaitForSignalMs) and gets |
|    each copy signal the moment the server creates it             |
|  - Claims copy signals atomically (no double execution)          |
|  - Backs off automatically on HTTP 429 / 5xx / network errors    |
|  - Follows master SL/TP changes on already-copied trades         |
|  - Uploads the broker's symbol list (on start, then hourly)      |
|  - Reports broker ping + cloud round trip every 15s (EA Health)  |
|  - Uses only GET/POST/DELETE (PATCH fails with error 4029)       |
|  - Master: Trading Desk orders from the website + live prices    |
+------------------------------------------------------------------+
*/
#property copyright "CopyTrade Bridge"
#property version   "3.00"

#include <Trade\Trade.mqh>

input string AccountLabel    = "CHANGE_ME";          // MUST match website account_name
input string SupabaseUrl     = "https://YOUR_PROJECT.supabase.co";
input string SupabaseKey     = "YOUR_ANON_KEY";       // Supabase anon key
input string BridgeKey       = "CHANGE_ME";          // Per-account secret from the website (Accounts > EA)
input int    UpdateSeconds   = 10;                    // Heartbeat interval (profit, balance) in seconds, min 10; trades still push instantly
input int    FastPollMs      = 200;                   // Safety loop: detect trade changes every N ms
input int    WaitForSignalMs = 1500;                  // Follower: keep request open up to N ms waiting for a signal (0 = poll)
input double MaxLotPerTrade  = 10.0;                  // Safety cap: signals above this lot size are rejected
input int    SlippagePoints  = 30;                    // Max slippage for market orders (points)
input string SymbolPrefix    = "";                    // Follower symbol prefix if broker differs
input string SymbolSuffix    = "";                    // Follower symbol suffix if broker differs (e.g. ".m")

CTrade   g_trade;
string   g_restUrl;
string   g_baseHeaders;
datetime g_backoffUntil  = 0;
int      g_failStreak    = 0;
datetime g_historyCursor = 0;
bool     g_warnedLabel   = false;
string   g_lastSig       = "";
ulong    g_lastFullMs    = 0;
bool     g_backfilled    = false;
ulong    g_symbolsSentMs = 0;
bool     g_symbolsSent   = false;
int      g_tradeAccess   = -1;
ulong    g_tradeAccessMs = 0;
ulong    g_latencySentMs = 0;
ulong    g_rttSum        = 0;
int      g_rttCount      = 0;
ulong    g_deskPolledMs  = 0;
bool     g_deskActive    = false;
bool     g_deskMaster    = true;
string   g_deskWatch[];
bool     g_accountReady  = false;
bool     g_warnedAccount = false;

int OnInit()
{
   if(AccountLabel == "CHANGE_ME" || StringLen(AccountLabel) == 0)
   {
      Print("LiveBridge: ERROR - AccountLabel is still CHANGE_ME! Set it to match your website account_name.");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(StringFind(SupabaseUrl, "YOUR_PROJECT") >= 0)
   {
      Print("LiveBridge: ERROR - SupabaseUrl not configured.");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(SupabaseKey == "YOUR_ANON_KEY")
   {
      Print("LiveBridge: ERROR - SupabaseKey not configured.");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(BridgeKey == "CHANGE_ME" || StringLen(BridgeKey) < 32)
   {
      Print("LiveBridge: ERROR - BridgeKey not configured. Copy it from the website account page.");
      return INIT_PARAMETERS_INCORRECT;
   }
   g_restUrl = SupabaseUrl + "/rest/v1/";
   g_baseHeaders = "apikey: " + SupabaseKey + "\r\n" +
                   "Authorization: Bearer " + SupabaseKey + "\r\n" +
                   "x-bridge-key: " + BridgeKey + "\r\n" +
                   "Content-Type: application/json\r\n";
   g_historyCursor = TimeCurrent() - 86400;
   g_trade.SetDeviationInPoints(SlippagePoints);

   EventSetMillisecondTimer(MathMax(100, FastPollMs));
   Print("LiveBridge: v3.0 initialized for [", AccountLabel, "] fast loop ", MathMax(100, FastPollMs), "ms, signal wait ", WaitForSignalMs, "ms, heartbeat ", MathMax(10, UpdateSeconds), "s");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("LiveBridge: Stopped for [", AccountLabel, "] reason=", reason);
}

void OnTimer()
{
   if(TimeLocal() < g_backoffUntil)
      return;
   if(!SyncIfNeeded()) return;
   if(PollCopySignals() > 0)
      SyncIfNeeded();
   if(PollDesk() > 0)
      SyncIfNeeded();
}

// Fires the moment a trade opens/closes/changes on this terminal: no polling delay.
void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
{
   if(TimeLocal() < g_backoffUntil)
      return;
   SyncIfNeeded();
}

// Push when a trade opens/closes/changes; otherwise only every UpdateSeconds.
// Floor of 10s also overrides an older "2" still saved in the chart settings.
bool SyncIfNeeded()
{
   if(TerminalInfoInteger(TERMINAL_CONNECTED) == 0) return false;   // no heartbeat while cut off from the broker, so the PC watchdog can restart MT
   if(!AccountReady()) return false;
   string sig = LocalSignature();
   bool due = GetTickCount64() - g_lastFullMs >= (ulong)MathMax(10, UpdateSeconds) * 1000;
   if(sig == g_lastSig && !due) return true;
   if(!SyncPositions()) return false;
   g_lastSig = sig;
   if(!PushClosedTrades()) return false;
   if(!g_backfilled) g_backfilled = BackfillHistory();
   if(!PushAccountInfo()) return false;   // heartbeat last: last_seen means "positions are in sync"
   g_lastFullMs = GetTickCount64();
   if(!g_symbolsSent || GetTickCount64() - g_symbolsSentMs >= 3600000) PushSymbols();
   if(g_latencySentMs == 0 || GetTickCount64() - g_latencySentMs >= 15000) PushLatency();
   PushTradeAccess();
   return true;
}

// Investor (read-only) logins report ACCOUNT_TRADE_ALLOWED = false; sent on change and every 5 minutes
void PushTradeAccess()
{
   int allowed = AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) != 0 ? 1 : 0;
   if(allowed == g_tradeAccess && GetTickCount64() - g_tradeAccessMs < 300000) return;
   string json = "{\"p_account_name\":\"" + JsonEscape(AccountLabel) + "\",\"p_allowed\":" + (allowed == 1 ? "true" : "false") + "}";
   string resp;
   if(!Ok(Http("POST", g_restUrl + "rpc/ea_report_trade_access", json, "", resp))) return;
   if(allowed == 0 && g_tradeAccess != 0)
      Print("LiveBridge: This terminal is logged in READ-ONLY (investor password). Orders from the website will be refused.");
   g_tradeAccess = allowed;
   g_tradeAccessMs = GetTickCount64();
}

// Broker ping comes from the terminal (microseconds); cloud time is the average heartbeat round trip.
void PushLatency()
{
   g_latencySentMs = GetTickCount64();
   long pingUs = TerminalInfoInteger(TERMINAL_PING_LAST);
   bool connected = TerminalInfoInteger(TERMINAL_CONNECTED) != 0;
   int brokerMs = (connected && pingUs > 0) ? (int)MathMax(1, MathRound(pingUs / 1000.0)) : -1;
   int cloudMs = g_rttCount > 0 ? (int)(g_rttSum / (ulong)g_rttCount) : -1;
   g_rttSum = 0;
   g_rttCount = 0;
   string json = "{\"p_account_name\":\"" + JsonEscape(AccountLabel) + "\"" +
                 ",\"p_broker_ping_ms\":" + IntegerToString(brokerMs) +
                 ",\"p_cloud_ms\":" + IntegerToString(cloudMs) + "}";
   string resp;
   Http("POST", g_restUrl + "rpc/ea_report_latency", json, "", resp);
}

// Uploads every symbol the broker offers so the website can preload names for symbol mapping
void PushSymbols()
{
   g_symbolsSentMs = GetTickCount64();
   int total = SymbolsTotal(false);
   string arr = "";
   for(int i = 0; i < total; i++)
   {
      string name = SymbolName(i, false);
      if(StringLen(name) == 0) continue;
      if(StringLen(arr) > 0) arr += ",";
      arr += "\"" + JsonEscape(name) + "\"";
   }
   string json = "{\"p_account_name\":\"" + JsonEscape(AccountLabel) + "\",\"p_symbols\":[" + arr + "]}";
   string resp;
   if(Ok(Http("POST", g_restUrl + "rpc/ea_push_symbols", json, "", resp)))
   {
      g_symbolsSent = true;
      Print("LiveBridge: Uploaded ", total, " symbol names for mapping");
   }
   PushHolderName();
}

// Reports the holder name registered with the broker so staff can compare it with the name they entered
void PushHolderName()
{
   string holder = AccountInfoString(ACCOUNT_NAME);
   if(StringLen(holder) == 0) return;
   string json = "{\"p_account_name\":\"" + JsonEscape(AccountLabel) + "\",\"p_holder\":\"" + JsonEscape(holder) + "\"}";
   string resp;
   Http("POST", g_restUrl + "rpc/ea_report_holder", json, "", resp);
}

string LocalSignature()
{
   string s = "";
   for(int i = 0; i < PositionsTotal(); i++)
   {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      s += IntegerToString((long)t) + ":" + DoubleToString(PositionGetDouble(POSITION_VOLUME), 2) + ":" +
           DoubleToString(PositionGetDouble(POSITION_SL), 5) + ":" + DoubleToString(PositionGetDouble(POSITION_TP), 5) + ";";
   }
   for(int j = 0; j < OrdersTotal(); j++)
   {
      ulong t = OrderGetTicket(j);
      if(t == 0) continue;
      s += "o" + IntegerToString((long)t) + ":" + DoubleToString(OrderGetDouble(ORDER_PRICE_OPEN), 5) + ":" +
           DoubleToString(OrderGetDouble(ORDER_SL), 5) + ":" + DoubleToString(OrderGetDouble(ORDER_TP), 5) + ";";
   }
   return s;
}

//+------------------------------------------------------------------+
//| HTTP helper with backoff on 429 / 5xx / network failure          |
//+------------------------------------------------------------------+
int Http(string method, string url, string body, string prefer, string &resp)
{
   char post[];
   char result[];
   string resultHeaders;
   string headers = g_baseHeaders;
   if(StringLen(prefer) > 0) headers += "Prefer: " + prefer + "\r\n";

   if(StringLen(body) > 0)
   {
      int n = StringToCharArray(body, post, 0, WHOLE_ARRAY, CP_UTF8);
      ArrayResize(post, n - 1);
   }

   ResetLastError();
   int status = WebRequest(method, url, headers, 5000, post, result, resultHeaders);
   resp = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);

   if(status == -1 || status == 429 || status >= 500)
   {
      g_failStreak++;
      int waitSec = (int)MathMin(60, MathPow(2, MathMin(g_failStreak, 6)));
      g_backoffUntil = TimeLocal() + waitSec;
      if(status == -1)
      {
         int err = GetLastError();
         if(err == 4014 || err == 4060)
            Print("LiveBridge: err ", err, " - add ", SupabaseUrl, " to Tools->Options->Expert Advisors->Allow WebRequest");
         else
            Print("LiveBridge: network error ", err, " on ", method, " - backing off ", waitSec, "s");
      }
      else
         Print("LiveBridge: HTTP ", status, " on ", method, " - backing off ", waitSec, "s");
   }
   else if(StringFind(resp, "bridge key rejected") >= 0)
      Print("LiveBridge: HTTP ", status, " - BridgeKey is wrong for [", AccountLabel, "]. Copy the current key from the website account page.");
   else if(status == 401 && StringFind(resp, "42501") >= 0)
      Print("LiveBridge: HTTP 401 - AccountLabel [", AccountLabel, "] does not match any website account, or BridgeKey is wrong");
   else if(status == 401)
      Print("LiveBridge: HTTP 401 - invalid SupabaseKey");
   else if(status >= 400)
      Print("LiveBridge: HTTP ", status, " on ", method, " ", StringSubstr(resp, 0, 200));
   else
      g_failStreak = 0;

   return status;
}

bool Ok(int status) { return status >= 200 && status < 300; }

//+------------------------------------------------------------------+
//| Heartbeat (server stamps last_seen with its own clock)           |
//+------------------------------------------------------------------+
bool PushAccountInfo()
{
   string json = "{\"p_account_name\":\"" + JsonEscape(AccountLabel) + "\"" +
                 ",\"p_balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) +
                 ",\"p_equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + "}";
   string resp;
   ulong started = GetTickCount64();
   int status = Http("POST", g_restUrl + "rpc/ea_heartbeat", json, "", resp);
   if(Ok(status))
   {
      g_rttSum += GetTickCount64() - started;
      g_rttCount++;
   }
   if(Ok(status) && StringFind(resp, "true") < 0 && !g_warnedLabel)
   {
      g_warnedLabel = true;
      Print("LiveBridge: WARNING - no website account named [", AccountLabel, "]. Check AccountLabel spelling.");
   }
   return Ok(status);
}

//+------------------------------------------------------------------+
//| Upsert positions + pending orders, delete only vanished tickets  |
//+------------------------------------------------------------------+
string PositionJson(ulong ticket, string symbol, string type, double lots, double openPrice, double sl, double tp,
                    double profit, double swap, long magic, long openMsc)
{
   return "{\"account_name\":\"" + JsonEscape(AccountLabel) + "\"" +
          ",\"ticket\":" + IntegerToString((long)ticket) +
          ",\"symbol\":\"" + JsonEscape(symbol) + "\"" +
          ",\"order_type\":\"" + type + "\"" +
          ",\"lots\":" + DoubleToString(lots, 2) +
          ",\"open_price\":" + DoubleToString(openPrice, 5) +
          ",\"sl\":" + DoubleToString(sl, 5) +
          ",\"tp\":" + DoubleToString(tp, 5) +
          ",\"profit\":" + DoubleToString(profit, 2) +
          ",\"swap\":" + DoubleToString(swap, 2) +
          ",\"magic\":" + IntegerToString(magic) +
          ",\"open_time\":\"" + GetISOTimeMsc(openMsc) + "\"}";
}

bool SyncPositions()
{
   string arr = "";
   string tickets = "";
   int count = 0;

   for(int i = 0; i < PositionsTotal(); i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      string type = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? "BUY" : "SELL";
      string json = PositionJson(ticket, PositionGetString(POSITION_SYMBOL), type,
         PositionGetDouble(POSITION_VOLUME), PositionGetDouble(POSITION_PRICE_OPEN),
         PositionGetDouble(POSITION_SL), PositionGetDouble(POSITION_TP),
         PositionGetDouble(POSITION_PROFIT), PositionGetDouble(POSITION_SWAP),
         PositionGetInteger(POSITION_MAGIC), PositionGetInteger(POSITION_TIME_MSC));
      arr += (count > 0 ? "," : "") + json;
      tickets += (count > 0 ? "," : "") + IntegerToString((long)ticket);
      count++;
   }

   for(int j = 0; j < OrdersTotal(); j++)
   {
      ulong ticket = OrderGetTicket(j);
      if(ticket == 0) continue;
      string type = PendingTypeName((ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE));
      if(type == "") continue;
      string json = PositionJson(ticket, OrderGetString(ORDER_SYMBOL), type,
         OrderGetDouble(ORDER_VOLUME_CURRENT), OrderGetDouble(ORDER_PRICE_OPEN),
         OrderGetDouble(ORDER_SL), OrderGetDouble(ORDER_TP), 0, 0,
         OrderGetInteger(ORDER_MAGIC), OrderGetInteger(ORDER_TIME_SETUP_MSC));
      arr += (count > 0 ? "," : "") + json;
      tickets += (count > 0 ? "," : "") + IntegerToString((long)ticket);
      count++;
   }

   string resp;
   if(count > 0)
   {
      int up = Http("POST", g_restUrl + "live_positions?on_conflict=account_name,ticket", "[" + arr + "]",
                    "resolution=merge-duplicates,return=minimal", resp);
      if(!Ok(up)) return false;
   }

   string delUrl = g_restUrl + "live_positions?account_name=eq." + UrlEncode(AccountLabel);
   if(count > 0) delUrl += "&ticket=not.in.(" + tickets + ")";
   int del = Http("DELETE", delUrl, "", "return=minimal", resp);
   return Ok(del);
}

//+------------------------------------------------------------------+
//| Upload positions closed since last cursor (one batched request)  |
//+------------------------------------------------------------------+
string ClosedDealJson(ulong deal, long dtype, double openPrice, long openMsc)
{
   return "{\"account_name\":\"" + JsonEscape(AccountLabel) + "\"" +
      ",\"ticket\":" + IntegerToString(HistoryDealGetInteger(deal, DEAL_POSITION_ID)) +
      ",\"symbol\":\"" + JsonEscape(HistoryDealGetString(deal, DEAL_SYMBOL)) + "\"" +
      ",\"order_type\":\"" + (dtype == DEAL_TYPE_SELL ? "BUY" : "SELL") + "\"" +
      ",\"lots\":" + DoubleToString(HistoryDealGetDouble(deal, DEAL_VOLUME), 2) +
      ",\"open_price\":" + DoubleToString(openPrice, 5) +
      ",\"close_price\":" + DoubleToString(HistoryDealGetDouble(deal, DEAL_PRICE), 5) +
      ",\"profit\":" + DoubleToString(HistoryDealGetDouble(deal, DEAL_PROFIT), 2) +
      ",\"commission\":" + DoubleToString(HistoryDealGetDouble(deal, DEAL_COMMISSION), 2) +
      ",\"swap\":" + DoubleToString(HistoryDealGetDouble(deal, DEAL_SWAP), 2) +
      ",\"open_time\":\"" + GetISOTimeMsc(openMsc) + "\"" +
      ",\"close_time\":\"" + GetISOTimeMsc(HistoryDealGetInteger(deal, DEAL_TIME_MSC)) + "\"}";
}

// Deposit / withdrawal / credit deal
string BalanceDealJson(ulong deal, long dtype)
{
   double amount = HistoryDealGetDouble(deal, DEAL_PROFIT);
   string kind = dtype == DEAL_TYPE_CREDIT ? "credit" : (amount >= 0 ? "deposit" : "withdrawal");
   return "{\"account_name\":\"" + JsonEscape(AccountLabel) + "\"" +
      ",\"ticket\":" + IntegerToString((long)deal) +
      ",\"op_type\":\"" + kind + "\"" +
      ",\"amount\":" + DoubleToString(amount, 2) +
      ",\"comment\":\"" + JsonEscape(HistoryDealGetString(deal, DEAL_COMMENT)) + "\"" +
      ",\"op_time\":\"" + GetISOTimeMsc(HistoryDealGetInteger(deal, DEAL_TIME_MSC)) + "\"}";
}

bool IsMoneyDeal(long dtype) { return dtype == DEAL_TYPE_BALANCE || dtype == DEAL_TYPE_CREDIT; }

bool IsClosingDeal(ulong deal, long dtype)
{
   if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL) return false;
   long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
   return entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_INOUT;
}

bool PostHistoryRows(string table, string arr)
{
   if(StringLen(arr) == 0) return true;
   string resp;
   int status = Http("POST", g_restUrl + table + "?on_conflict=account_name,ticket", "[" + arr + "]",
                     "resolution=ignore-duplicates,return=minimal", resp);
   return Ok(status);
}

bool PushClosedTrades()
{
   datetime from = g_historyCursor - 60;
   if(!HistorySelect(from, TimeCurrent() + 86400)) return true;

   string trades = "", ops = "";
   int nt = 0, no = 0;
   datetime newest = g_historyCursor;
   int total = HistoryDealsTotal();

   for(int i = total - 1; i >= 0; i--)
   {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0) continue;
      long dtype = HistoryDealGetInteger(deal, DEAL_TYPE);

      if(IsMoneyDeal(dtype))
      {
         if(no >= 200) continue;
         ops += (no > 0 ? "," : "") + BalanceDealJson(deal, dtype);
         no++;
      }
      else if(IsClosingDeal(deal, dtype))
      {
         if(nt >= 200) continue;
         double openPrice = 0;
         long openMsc = 0;
         FindEntryDeal(HistoryDealGetInteger(deal, DEAL_POSITION_ID), openPrice, openMsc);
         trades += (nt > 0 ? "," : "") + ClosedDealJson(deal, dtype, openPrice, openMsc);
         nt++;
      }
      else continue;

      datetime t = (datetime)HistoryDealGetInteger(deal, DEAL_TIME);
      if(t > newest) newest = t;
   }

   if(!PostHistoryRows("trade_history", trades)) return false;
   if(!PostHistoryRows("balance_operations", ops)) return false;
   g_historyCursor = newest;
   return true;
}

// One-time upload of the whole account history
bool BackfillHistory()
{
   if(!HistorySelect(0, TimeCurrent() + 86400)) return false;
   int total = HistoryDealsTotal();

   long   inPos[];
   double inPrice[];
   long   inMsc[];
   ArrayResize(inPos, total);
   ArrayResize(inPrice, total);
   ArrayResize(inMsc, total);
   int nIn = 0;
   for(int i = 0; i < total; i++)
   {
      ulong d = HistoryDealGetTicket(i);
      if(d == 0 || HistoryDealGetInteger(d, DEAL_ENTRY) != DEAL_ENTRY_IN) continue;
      long t = HistoryDealGetInteger(d, DEAL_TYPE);
      if(t != DEAL_TYPE_BUY && t != DEAL_TYPE_SELL) continue;
      inPos[nIn] = HistoryDealGetInteger(d, DEAL_POSITION_ID);
      inPrice[nIn] = HistoryDealGetDouble(d, DEAL_PRICE);
      inMsc[nIn] = HistoryDealGetInteger(d, DEAL_TIME_MSC);
      nIn++;
   }

   string trades = "", ops = "";
   int nt = 0, no = 0, sentTrades = 0, sentOps = 0;
   for(int i = 0; i < total; i++)
   {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0) continue;
      long dtype = HistoryDealGetInteger(deal, DEAL_TYPE);

      if(IsMoneyDeal(dtype))
      {
         ops += (no > 0 ? "," : "") + BalanceDealJson(deal, dtype);
         no++;
      }
      else if(IsClosingDeal(deal, dtype))
      {
         long posId = HistoryDealGetInteger(deal, DEAL_POSITION_ID);
         double openPrice = 0;
         long openMsc = 0;
         for(int k = nIn - 1; k >= 0; k--)
            if(inPos[k] == posId) { openPrice = inPrice[k]; openMsc = inMsc[k]; break; }
         trades += (nt > 0 ? "," : "") + ClosedDealJson(deal, dtype, openPrice, openMsc);
         nt++;
      }

      if(nt >= 200) { if(!PostHistoryRows("trade_history", trades)) return false; sentTrades += nt; trades = ""; nt = 0; }
      if(no >= 200) { if(!PostHistoryRows("balance_operations", ops)) return false; sentOps += no; ops = ""; no = 0; }
   }
   if(!PostHistoryRows("trade_history", trades)) return false;
   if(!PostHistoryRows("balance_operations", ops)) return false;
   Print("LiveBridge: history backfill done - ", sentTrades + nt, " trades, ", sentOps + no, " deposits/withdrawals");
   return true;
}

// Opening deal of a position. Re-selects the cursor window afterwards.
void FindEntryDeal(long posId, double &openPrice, long &openMsc)
{
   if(HistorySelectByPosition(posId))
   {
      for(int k = 0; k < HistoryDealsTotal(); k++)
      {
         ulong d = HistoryDealGetTicket(k);
         if(d > 0 && HistoryDealGetInteger(d, DEAL_ENTRY) == DEAL_ENTRY_IN)
         {
            openPrice = HistoryDealGetDouble(d, DEAL_PRICE);
            openMsc = HistoryDealGetInteger(d, DEAL_TIME_MSC);
            break;
         }
      }
   }
   HistorySelect(g_historyCursor - 60, TimeCurrent() + 86400);
}

//+------------------------------------------------------------------+
//| Claim + execute copy signals in ONE request (server pre-validates)|
//+------------------------------------------------------------------+
// Followers wait server-side (up to WaitForSignalMs) so a signal is received the instant it exists.
int PollCopySignals()
{
   string resp;
   string body = "{\"p_follower\":\"" + JsonEscape(AccountLabel) + "\",\"p_limit\":10";
   string rpc = "rpc/ea_take_signals";
   if(WaitForSignalMs > 0)
   {
      rpc = "rpc/ea_wait_signals";
      body += ",\"p_wait_ms\":" + IntegerToString(MathMin(WaitForSignalMs, 2000));
   }
   body += "}";
   if(!Ok(Http("POST", g_restUrl + rpc, body, "", resp))) return 0;
   if(StringLen(resp) < 5) return 0;

   int handled = 0;
   int pos = 0;
   while(true)
   {
      int objStart = StringFind(resp, "{", pos);
      if(objStart < 0) break;
      int objEnd = StringFind(resp, "}", objStart);
      if(objEnd < 0) break;
      string obj = StringSubstr(resp, objStart, objEnd - objStart + 1);
      pos = objEnd + 1;

      string signalId = ExtractJsonField(obj, "id");
      if(StringLen(signalId) == 0) continue;

      string action = ExtractJsonField(obj, "action");
      if(action == "close")
         HandleClose(obj, signalId);
      else if(action == "modify")
         HandleModify(obj, signalId);
      else
         HandleOpen(obj, signalId);
      handled++;
   }
   return handled;
}

void SetSignalStatus(string signalId, string newStatus)
{
   string resp;
   string body = "{\"p_id\":\"" + JsonEscape(signalId) + "\",\"p_status\":\"" + newStatus + "\"}";
   Http("POST", g_restUrl + "rpc/ea_set_signal_status", body, "", resp);
}

// Server stamps opened_at / closed_at. 0 / "" means "leave unchanged".
void UpdateCopyTrade(string copyId, string newStatus, ulong followerTicket = 0, string cancelReason = "", double lots = 0)
{
   string resp;
   string body = "{\"p_copy_id\":\"" + JsonEscape(copyId) + "\",\"p_status\":\"" + newStatus + "\"" +
                 ",\"p_follower_ticket\":" + (followerTicket > 0 ? IntegerToString((long)followerTicket) : "null") +
                 ",\"p_cancel_reason\":" + (StringLen(cancelReason) > 0 ? "\"" + JsonEscape(cancelReason) + "\"" : "null") +
                 ",\"p_lots\":" + (lots > 0 ? DoubleToString(lots, 2) : "null") + "}";
   Http("POST", g_restUrl + "rpc/ea_update_copy_trade", body, "", resp);
}

void HandleOpen(string obj, string signalId)
{
   string copyId        = ExtractJsonField(obj, "copy_id");
   string masterAccount = ExtractJsonField(obj, "master_account");
   string masterTicket  = ExtractJsonField(obj, "master_ticket");
   string orderType     = ExtractJsonField(obj, "order_type");
   double lots          = StringToDouble(ExtractJsonField(obj, "lots"));
   double sl            = StringToDouble(ExtractJsonField(obj, "sl"));
   double tp            = StringToDouble(ExtractJsonField(obj, "tp"));
   double openPrice     = StringToDouble(ExtractJsonField(obj, "open_price"));
   long   magic         = StringToInteger(ExtractJsonField(obj, "magic"));
   string tag           = MakeTag(masterAccount, masterTicket);

   // Local dedup: an order/position with this tag already exists (e.g. previous report failed)
   ulong existing = FindByTag(tag, true);
   if(existing > 0)
   {
      UpdateCopyTrade(copyId, "open", existing);
      SetSignalStatus(signalId, "executed");
      Print("LiveBridge: copy_id ", copyId, " already open locally as #", existing);
      return;
   }

   string symbol = ResolveSymbol(ExtractJsonField(obj, "symbol"));
   if(symbol == "")
   {
      FailOpen(signalId, copyId, "symbol not available on this broker: " + ExtractJsonField(obj, "symbol"));
      return;
   }

   double ask = SymbolInfoDouble(symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(symbol, SYMBOL_BID);
   if(ask == 0 || bid == 0)
   {
      SetSignalStatus(signalId, "pending");   // market closed: retry until engine expires it
      return;
   }

   double vol = NormalizeLots(symbol, lots);
   if(vol <= 0 || lots > MaxLotPerTrade)
   {
      FailOpen(signalId, copyId, "lot size " + DoubleToString(lots, 2) + " rejected (MaxLotPerTrade=" + DoubleToString(MaxLotPerTrade, 2) + ")");
      return;
   }

   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double slVal = sl > 0 ? NormalizeDouble(sl, digits) : 0;
   double tpVal = tp > 0 ? NormalizeDouble(tp, digits) : 0;
   double px = NormalizeDouble(openPrice, digits);
   bool isMarket = (orderType == "BUY" || orderType == "SELL");

   g_trade.SetExpertMagicNumber((ulong)magic);
   g_trade.SetTypeFillingBySymbol(symbol);

   bool ok = SendOrder(orderType, symbol, vol, px, slVal, tpVal, tag);
   if(!ok && isMarket && (slVal > 0 || tpVal > 0) && g_trade.ResultRetcode() == TRADE_RETCODE_INVALID_STOPS)
   {
      // Master stops invalid on this broker's feed: open, then attach stops
      ok = SendOrder(orderType, symbol, vol, px, 0, 0, tag);
      if(ok)
      {
         ulong pid = ResolvePositionTicket();
         if(pid > 0 && !g_trade.PositionModify(pid, slVal, tpVal))
            Print("LiveBridge: WARNING - #", pid, " opened without SL/TP (stops rejected by broker)");
      }
   }

   if(ok)
   {
      ulong ticket = isMarket ? ResolvePositionTicket() : g_trade.ResultOrder();
      UpdateCopyTrade(copyId, "open", ticket, "", vol);
      SetSignalStatus(signalId, "executed");
      Print("LiveBridge: Opened ", orderType, " ", DoubleToString(vol, 2), " ", symbol, " #", ticket, " copy_id=", copyId);
   }
   else
      FailOpen(signalId, copyId, "retcode=" + IntegerToString((int)g_trade.ResultRetcode()) + " " + g_trade.ResultRetcodeDescription());
}

bool SendOrder(string orderType, string symbol, double vol, double px, double sl, double tp, string tag)
{
   if(orderType == "BUY")        return g_trade.Buy(vol, symbol, SymbolInfoDouble(symbol, SYMBOL_ASK), sl, tp, tag) && TradeDone();
   if(orderType == "SELL")       return g_trade.Sell(vol, symbol, SymbolInfoDouble(symbol, SYMBOL_BID), sl, tp, tag) && TradeDone();
   if(orderType == "BUY_LIMIT")  return g_trade.BuyLimit(vol, px, symbol, sl, tp, ORDER_TIME_GTC, 0, tag) && TradeDone();
   if(orderType == "SELL_LIMIT") return g_trade.SellLimit(vol, px, symbol, sl, tp, ORDER_TIME_GTC, 0, tag) && TradeDone();
   if(orderType == "BUY_STOP")   return g_trade.BuyStop(vol, px, symbol, sl, tp, ORDER_TIME_GTC, 0, tag) && TradeDone();
   if(orderType == "SELL_STOP")  return g_trade.SellStop(vol, px, symbol, sl, tp, ORDER_TIME_GTC, 0, tag) && TradeDone();
   return false;
}

bool TradeDone()
{
   uint rc = g_trade.ResultRetcode();
   return rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_DONE_PARTIAL || rc == TRADE_RETCODE_PLACED;
}

// Position id from the executed deal (hedging: equals the opening order ticket).
ulong ResolvePositionTicket()
{
   ulong deal = g_trade.ResultDeal();
   if(deal > 0 && HistoryDealSelect(deal))
   {
      long pid = HistoryDealGetInteger(deal, DEAL_POSITION_ID);
      if(pid > 0) return (ulong)pid;
   }
   return g_trade.ResultOrder();
}

//+------------------------------------------------------------------+
//| Trading Desk (master only): stream watched prices, run web orders |
//+------------------------------------------------------------------+
int PollDesk()
{
   ulong interval = !g_deskMaster ? 60000 : (g_deskActive ? 300 : 2000);
   if(g_deskPolledMs != 0 && GetTickCount64() - g_deskPolledMs < interval) return 0;
   g_deskPolledMs = GetTickCount64();

   string quotes = "";
   for(int i = 0; i < ArraySize(g_deskWatch); i++)
   {
      string sym = g_deskWatch[i];
      if(!SymbolSelect(sym, true)) continue;
      double bid = SymbolInfoDouble(sym, SYMBOL_BID);
      double ask = SymbolInfoDouble(sym, SYMBOL_ASK);
      if(bid <= 0 || ask <= 0) continue;
      int d = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      if(StringLen(quotes) > 0) quotes += ",";
      quotes += "{\"s\":\"" + JsonEscape(sym) + "\",\"b\":" + DoubleToString(bid, d) + ",\"a\":" + DoubleToString(ask, d) +
                ",\"d\":" + IntegerToString(d) + ",\"mn\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN), 3) +
                ",\"st\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP), 3) + ",\"mx\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX), 2) + "}";
   }

   string resp;
   string body = "{\"p_account\":\"" + JsonEscape(AccountLabel) + "\",\"p_quotes\":[" + quotes + "]}";
   if(!Ok(Http("POST", g_restUrl + "rpc/ea_poll_desk", body, "", resp))) return 0;

   g_deskMaster = ExtractJsonField(resp, "is_master") != "false";
   g_deskActive = ExtractJsonField(resp, "active") == "true";
   ParseDeskWatch(resp);

   int ordersAt = StringFind(resp, "\"orders\":");
   if(ordersAt < 0) return 0;
   int listEnd = StringFind(resp, "]", ordersAt);
   int handled = 0;
   int pos = ordersAt;
   while(true)
   {
      int objStart = StringFind(resp, "{", pos);
      if(objStart < 0 || (listEnd >= 0 && objStart > listEnd)) break;
      int objEnd = StringFind(resp, "}", objStart);
      if(objEnd < 0) break;
      HandleDeskOrder(StringSubstr(resp, objStart, objEnd - objStart + 1));
      pos = objEnd + 1;
      handled++;
   }
   return handled;
}

void ParseDeskWatch(string resp)
{
   ArrayResize(g_deskWatch, 0);
   int at = StringFind(resp, "\"watch\":");
   if(at < 0) return;
   int open = StringFind(resp, "[", at);
   int close = StringFind(resp, "]", open);
   if(open < 0 || close < 0) return;
   int pos = open;
   while(true)
   {
      int q1 = StringFind(resp, "\"", pos);
      if(q1 < 0 || q1 > close) break;
      int q2 = StringFind(resp, "\"", q1 + 1);
      if(q2 < 0 || q2 > close) break;
      int n = ArraySize(g_deskWatch);
      ArrayResize(g_deskWatch, n + 1);
      g_deskWatch[n] = StringSubstr(resp, q1 + 1, q2 - q1 - 1);
      pos = q2 + 1;
   }
}

void HandleDeskOrder(string obj)
{
   string id        = ExtractJsonField(obj, "id");
   string symbol    = ExtractJsonField(obj, "symbol");
   string orderType = ExtractJsonField(obj, "order_type");
   string comment   = ExtractJsonField(obj, "comment");
   double lots      = StringToDouble(ExtractJsonField(obj, "lots"));
   double sl        = StringToDouble(ExtractJsonField(obj, "sl"));
   double tp        = StringToDouble(ExtractJsonField(obj, "tp"));
   double reqPrice  = StringToDouble(ExtractJsonField(obj, "price"));
   if(StringLen(id) == 0) return;

   if(!SymbolSelect(symbol, true) || SymbolInfoDouble(symbol, SYMBOL_POINT) <= 0)
   {
      FinishDeskOrder(id, "failed", 0, "Symbol not available: " + symbol);
      return;
   }
   if(SymbolInfoDouble(symbol, SYMBOL_ASK) <= 0 || SymbolInfoDouble(symbol, SYMBOL_BID) <= 0)
   {
      FinishDeskOrder(id, "failed", 0, "No price - market closed");
      return;
   }
   double vol = NormalizeLots(symbol, lots);
   if(vol <= 0)
   {
      FinishDeskOrder(id, "failed", 0, "Invalid volume " + DoubleToString(lots, 2));
      return;
   }

   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double slVal = sl > 0 ? NormalizeDouble(sl, digits) : 0;
   double tpVal = tp > 0 ? NormalizeDouble(tp, digits) : 0;
   double px = NormalizeDouble(reqPrice, digits);
   bool isMarket = (orderType == "BUY" || orderType == "SELL");

   g_trade.SetExpertMagicNumber(0);
   g_trade.SetTypeFillingBySymbol(symbol);
   bool ok = SendOrder(orderType, symbol, vol, px, slVal, tpVal, comment);
   string warn = "";
   if(!ok && isMarket && (slVal > 0 || tpVal > 0) && g_trade.ResultRetcode() == TRADE_RETCODE_INVALID_STOPS)
   {
      ok = SendOrder(orderType, symbol, vol, px, 0, 0, comment);
      if(ok)
      {
         ulong pid = ResolvePositionTicket();
         if(pid > 0 && !g_trade.PositionModify(pid, slVal, tpVal))
            warn = "Opened, but SL/TP rejected by broker";
      }
   }

   if(ok)
   {
      ulong ticket = isMarket ? ResolvePositionTicket() : g_trade.ResultOrder();
      FinishDeskOrder(id, "filled", ticket, warn);
      Print("LiveBridge: Desk order ", orderType, " ", DoubleToString(vol, 2), " ", symbol, " #", ticket);
   }
   else
      FinishDeskOrder(id, "failed", 0, g_trade.ResultRetcodeDescription() + " (" + IntegerToString((int)g_trade.ResultRetcode()) + ")");
}

void FinishDeskOrder(string id, string status, ulong ticket, string error)
{
   string resp;
   string body = "{\"p_id\":\"" + JsonEscape(id) + "\",\"p_account\":\"" + JsonEscape(AccountLabel) + "\",\"p_status\":\"" + status + "\"" +
                 ",\"p_ticket\":" + (ticket > 0 ? IntegerToString((long)ticket) : "null") +
                 ",\"p_error\":" + (StringLen(error) > 0 ? "\"" + JsonEscape(error) + "\"" : "null") + "}";
   Http("POST", g_restUrl + "rpc/ea_finish_desk_order", body, "", resp);
}

void FailOpen(string signalId, string copyId, string reason)
{
   UpdateCopyTrade(copyId, "cancelled", 0, "open_failed");
   SetSignalStatus(signalId, "failed");
   Print("LiveBridge: Open failed for copy_id ", copyId, " - ", reason);
}

void HandleModify(string obj, string signalId)
{
   string copyId = ExtractJsonField(obj, "copy_id");
   double sl     = StringToDouble(ExtractJsonField(obj, "sl"));
   double tp     = StringToDouble(ExtractJsonField(obj, "tp"));
   ulong ticket  = (ulong)StringToInteger(ExtractJsonField(obj, "follower_ticket"));
   bool isPosition = ticket > 0 && PositionSelectByTicket(ticket);
   bool isOrder = !isPosition && ticket > 0 && OrderSelect(ticket);
   if(!isPosition && !isOrder)
   {
      SetSignalStatus(signalId, "cancelled");
      return;
   }

   string sym = isPosition ? PositionGetString(POSITION_SYMBOL) : OrderGetString(ORDER_SYMBOL);
   if(SymbolInfoDouble(sym, SYMBOL_BID) == 0)
   {
      SetSignalStatus(signalId, "pending");   // market closed: retry next cycle
      return;
   }

   int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   double pt = SymbolInfoDouble(sym, SYMBOL_POINT);
   double slVal = sl > 0 ? NormalizeDouble(sl, digits) : 0;
   double tpVal = tp > 0 ? NormalizeDouble(tp, digits) : 0;
   double curSl = isPosition ? PositionGetDouble(POSITION_SL) : OrderGetDouble(ORDER_SL);
   double curTp = isPosition ? PositionGetDouble(POSITION_TP) : OrderGetDouble(ORDER_TP);
   if(MathAbs(curSl - slVal) < pt && MathAbs(curTp - tpVal) < pt)
   {
      SetSignalStatus(signalId, "executed");
      return;
   }

   if(ApplyStops(ticket, isPosition, slVal, tpVal))
   {
      SetSignalStatus(signalId, "executed");
      Print("LiveBridge: Updated #", ticket, " SL=", DoubleToString(slVal, digits), " TP=", DoubleToString(tpVal, digits));
      return;
   }
   Print("LiveBridge: SL/TP update failed for #", ticket, " retcode=", g_trade.ResultRetcode(), " ", g_trade.ResultRetcodeDescription());

   // Broker rejects the whole request if either level is invalid: apply each one on its own so the other still lands.
   bool slOk = MathAbs(curSl - slVal) < pt || ApplyStops(ticket, isPosition, slVal, curTp);
   if(slOk) curSl = slVal;
   bool tpOk = MathAbs(curTp - tpVal) < pt || ApplyStops(ticket, isPosition, curSl, tpVal);
   if(slOk) Print("LiveBridge: Updated #", ticket, " SL=", DoubleToString(slVal, digits));
   if(tpOk) Print("LiveBridge: Updated #", ticket, " TP=", DoubleToString(tpVal, digits));
   if(!tpOk || !slOk)
      Print("LiveBridge: ", (slOk ? "TP" : (tpOk ? "SL" : "SL and TP")), " rejected by broker for #", ticket, " retcode=", g_trade.ResultRetcode(), " - will retry");
   SetSignalStatus(signalId, slOk && tpOk ? "executed" : "failed");
}

bool ApplyStops(ulong ticket, bool isPosition, double slVal, double tpVal)
{
   if(isPosition && !PositionSelectByTicket(ticket)) return false;
   if(!isPosition && !OrderSelect(ticket)) return false;
   bool ok = isPosition
      ? g_trade.PositionModify(ticket, slVal, tpVal)
      : g_trade.OrderModify(ticket, OrderGetDouble(ORDER_PRICE_OPEN), slVal, tpVal,
                            (ENUM_ORDER_TYPE_TIME)OrderGetInteger(ORDER_TYPE_TIME), (datetime)OrderGetInteger(ORDER_TIME_EXPIRATION));
   return ok && (TradeDone() || g_trade.ResultRetcode() == TRADE_RETCODE_NO_CHANGES);
}

void HandleClose(string obj, string signalId)
{
   string copyId        = ExtractJsonField(obj, "copy_id");
   string masterAccount = ExtractJsonField(obj, "master_account");
   string masterTicket  = ExtractJsonField(obj, "master_ticket");
   ulong ticket         = (ulong)StringToInteger(ExtractJsonField(obj, "follower_ticket"));
   if(ticket == 0)
      ticket = FindByTag(MakeTag(masterAccount, masterTicket), false);

   bool done = false;
   if(ticket > 0 && PositionSelectByTicket(ticket))
   {
      string sym = PositionGetString(POSITION_SYMBOL);
      if(SymbolInfoDouble(sym, SYMBOL_BID) == 0 || SymbolInfoDouble(sym, SYMBOL_ASK) == 0)
      {
         SetSignalStatus(signalId, "pending");   // market closed: retry next cycle
         return;
      }
      g_trade.SetTypeFillingBySymbol(sym);
      done = g_trade.PositionClose(ticket) && TradeDone();
   }
   else if(ticket > 0 && OrderSelect(ticket))
      done = g_trade.OrderDelete(ticket) && TradeDone();
   else
   {
      MarkClosed(signalId, copyId);
      Print("LiveBridge: copy_id ", copyId, " has no open follower position - marked closed");
      return;
   }

   if(done)
   {
      MarkClosed(signalId, copyId);
      Print("LiveBridge: Closed #", ticket, " copy_id=", copyId);
   }
   else
   {
      Print("LiveBridge: Close #", ticket, " failed retcode=", g_trade.ResultRetcode(), " - retrying next cycle");
      SetSignalStatus(signalId, "pending");
   }
}

void MarkClosed(string signalId, string copyId)
{
   UpdateCopyTrade(copyId, "closed");
   SetSignalStatus(signalId, "executed");
}

//+------------------------------------------------------------------+
//| Helpers                                                          |
//+------------------------------------------------------------------+
// Order comment tag: "CT" + master ticket + "-" + 4-hex hash of master account. Max 26 chars (< 31 limit).
string MakeTag(string masterAccount, string masterTicket)
{
   uint h = 5381;
   for(int i = 0; i < StringLen(masterAccount); i++)
      h = ((h << 5) + h) + (uint)StringGetCharacter(masterAccount, i);
   return "CT" + masterTicket + "-" + StringFormat("%04X", h & 0xFFFF);
}

ulong FindByTag(string tag, bool includeHistory)
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong t = PositionGetTicket(i);
      if(t > 0 && StringFind(PositionGetString(POSITION_COMMENT), tag) == 0)
         return t;
   }
   for(int j = OrdersTotal() - 1; j >= 0; j--)
   {
      ulong t = OrderGetTicket(j);
      if(t > 0 && StringFind(OrderGetString(ORDER_COMMENT), tag) == 0)
         return t;
   }
   if(includeHistory && HistorySelect(TimeCurrent() - 86400, TimeCurrent() + 86400))
   {
      for(int k = HistoryDealsTotal() - 1; k >= 0; k--)
      {
         ulong d = HistoryDealGetTicket(k);
         if(d > 0 && HistoryDealGetInteger(d, DEAL_ENTRY) == DEAL_ENTRY_IN &&
            StringFind(HistoryDealGetString(d, DEAL_COMMENT), tag) == 0)
            return (ulong)HistoryDealGetInteger(d, DEAL_POSITION_ID);
      }
   }
   return 0;
}

// Login numbers (5+ digits) written in AccountLabel, e.g. "F-TTF-20299078-WINDSORDemo" -> 20299078.
bool LabelMatchesLogin(long login)
{
   bool hasNumber = false;
   string run = "";
   int n = StringLen(AccountLabel);
   for(int i = 0; i <= n; i++)
   {
      ushort c = (i < n) ? StringGetCharacter(AccountLabel, i) : 0;
      if(c >= '0' && c <= '9') { run += ShortToString(c); continue; }
      if(StringLen(run) >= 5)
      {
         hasNumber = true;
         if(StringToInteger(run) == login) return true;
      }
      run = "";
   }
   return !hasNumber;
}

// While MT is still on another login (e.g. right after a restart) nothing is sent, so that account's trades never land under this label.
bool AccountReady()
{
   if(g_accountReady) return true;
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   if(login <= 0) return false;
   if(!LabelMatchesLogin(login))
   {
      if(!g_warnedAccount) Print("LiveBridge: terminal is logged in to ", login, ", waiting for the account in [", AccountLabel, "]");
      g_warnedAccount = true;
      return false;
   }
   g_accountReady = true;
   if(AccountInfoInteger(ACCOUNT_MARGIN_MODE) != ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)
      Print("LiveBridge: WARNING - account is not HEDGING. Copied trades on the same symbol will merge.");
   FixChartSymbol();
   return true;
}

// A chart opened on "EURUSD" goes dead on a broker that only lists "EURUSD@"; move it to the broker's name.
void FixChartSymbol()
{
   if(SymbolInfoInteger(_Symbol, SYMBOL_EXIST) && SymbolInfoDouble(_Symbol, SYMBOL_POINT) > 0) return;
   string broker = FindBrokerSymbol(_Symbol);
   if(broker == "" || broker == _Symbol) return;
   Print("LiveBridge: moving chart from ", _Symbol, " to ", broker);
   ChartSetSymbolPeriod(0, broker, _Period);
}

string ResolveSymbol(string masterSymbol)
{
   if(SymbolSelect(masterSymbol, true) && SymbolInfoDouble(masterSymbol, SYMBOL_POINT) > 0)
      return masterSymbol;
   string alt = SymbolPrefix + masterSymbol + SymbolSuffix;
   if(alt != masterSymbol && SymbolSelect(alt, true) && SymbolInfoDouble(alt, SYMBOL_POINT) > 0)
      return alt;
   return FindBrokerSymbol(masterSymbol);
}

// Longest run of A-Z/0-9, e.g. "EURUSD@" / "m.EURUSD" / "EURUSDpro" -> "EURUSD".
string SymbolCore(string s)
{
   string best = "", run = "";
   int n = StringLen(s);
   for(int i = 0; i <= n; i++)
   {
      ushort c = (i < n) ? StringGetCharacter(s, i) : 0;
      if((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) { run += ShortToString(c); continue; }
      if(StringLen(run) > StringLen(best)) best = run;
      run = "";
   }
   return best;
}

// Broker prefix/suffix such as ".m", "@", "#", "pro", "-ECN"; a bare uppercase word like "EUR" is another instrument.
bool IsAffix(string extra)
{
   int n = StringLen(extra);
   if(n == 0) return true;
   if(n > 5) return false;
   int upper = 0;
   for(int i = 0; i < n; i++)
   {
      ushort c = StringGetCharacter(extra, i);
      if(c >= 'A' && c <= 'Z') upper++;
      else if(!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9'))) return true;
   }
   return upper < 3;
}

string FindBrokerSymbol(string masterSymbol)
{
   string core = SymbolCore(masterSymbol);
   if(StringLen(core) < 3) return "";
   string best = "";
   int bestExtra = 1000;
   int total = SymbolsTotal(false);
   for(int i = 0; i < total; i++)
   {
      string s = SymbolName(i, false);
      int pos = StringFind(s, core);
      if(pos < 0) continue;
      int extra = StringLen(s) - StringLen(core);
      if(extra >= bestExtra) continue;
      if(!IsAffix(StringSubstr(s, 0, pos)) || !IsAffix(StringSubstr(s, pos + StringLen(core)))) continue;
      if(SymbolInfoInteger(s, SYMBOL_TRADE_MODE) == SYMBOL_TRADE_MODE_DISABLED) continue;
      best = s;
      bestExtra = extra;
   }
   if(best == "" || !SymbolSelect(best, true) || SymbolInfoDouble(best, SYMBOL_POINT) <= 0) return "";
   if(best != masterSymbol) Print("LiveBridge: ", masterSymbol, " not found, using broker symbol ", best);
   return best;
}

double NormalizeLots(string symbol, double lots)
{
   double step = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   double minL = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double maxL = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   if(step <= 0 || minL <= 0) return 0;
   double v = MathFloor(lots / step + 1e-9) * step;
   if(v < minL) v = minL;
   if(v > maxL) v = maxL;
   return NormalizeDouble(v, 2);
}

string PendingTypeName(ENUM_ORDER_TYPE type)
{
   if(type == ORDER_TYPE_BUY_LIMIT) return "BUY_LIMIT";
   if(type == ORDER_TYPE_SELL_LIMIT) return "SELL_LIMIT";
   if(type == ORDER_TYPE_BUY_STOP) return "BUY_STOP";
   if(type == ORDER_TYPE_SELL_STOP) return "SELL_STOP";
   return "";
}

string ExtractJsonField(string json, string fieldName)
{
   string needle = "\"" + fieldName + "\":";
   int start = StringFind(json, needle);
   if(start < 0) return "";
   start += StringLen(needle);
   while(start < StringLen(json) && StringGetCharacter(json, start) == ' ') start++;

   if(start < StringLen(json) && StringGetCharacter(json, start) == '"')
   {
      start++;
      int end = StringFind(json, "\"", start);
      if(end < 0) return "";
      return StringSubstr(json, start, end - start);
   }

   int e = start;
   while(e < StringLen(json))
   {
      ushort ch = StringGetCharacter(json, e);
      if(ch == ',' || ch == '}' || ch == ']') break;
      e++;
   }
   string v = StringSubstr(json, start, e - start);
   StringTrimRight(v);
   return v == "null" ? "" : v;
}

string JsonEscape(string value)
{
   string s = value;
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   return s;
}

// Millisecond broker time -> UTC ISO with .mmm (lets the website measure copy delay in ms).
string GetISOTimeMsc(long msc)
{
   if(msc <= 0) return GetISOTime(0, false);
   string base = GetISOTime((datetime)(msc / 1000), true);
   return StringSubstr(base, 0, 19) + "." + StringFormat("%03d", (int)(msc % 1000)) + "Z";
}

// Broker server time -> UTC (used for display timestamps only).
string GetISOTime(datetime t, bool isServerTime)
{
   if(t == 0) return "1970-01-01T00:00:00Z";
   if(isServerTime)
   {
      int offset = (int)(MathRound((double)(TimeTradeServer() - TimeGMT()) / 1800.0) * 1800);
      t -= offset;
   }
   string s = TimeToString(t, TIME_DATE | TIME_SECONDS);
   return StringSubstr(s, 0, 4) + "-" + StringSubstr(s, 5, 2) + "-" + StringSubstr(s, 8, 2) +
          "T" + StringSubstr(s, 11, 8) + "Z";
}

string UrlEncode(string str)
{
   string result = "";
   uchar bytes[];
   int n = StringToCharArray(str, bytes, 0, WHOLE_ARRAY, CP_UTF8) - 1;
   for(int i = 0; i < n; i++)
   {
      uchar ch = bytes[i];
      if((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') ||
         ch == '-' || ch == '_' || ch == '.' || ch == '~')
         result += CharToString(ch);
      else
         result += StringFormat("%%%02X", ch);
   }
   return result;
}
