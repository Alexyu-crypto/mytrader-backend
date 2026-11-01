/*
+------------------------------------------------------------------+
|                     MT4LiveBridge.mq4  v3.0                      |
|              MT4 to Supabase Live Bridge EA                      |
|                                                                  |
|  SETUP GUIDE:                                                    |
|  1. Tools -> Options -> Expert Advisors                          |
|  2. Check "Allow WebRequest for listed URL"                      |
|  3. Add the SupabaseUrl shown below to the list                  |
|  4. Attach this EA to ONE chart only (one EA per account)        |
|  5. AccountLabel must EXACTLY match the website account name     |
|  6. Enable AutoTrading                                           |
|                                                                  |
|  HOW IT WORKS:                                                   |
|  - Upserts open positions (no delete/re-insert gap)              |
|  - Uploads newly closed trades in one batched request            |
|  - Uploads deposits/withdrawals; full history once on start      |
|    (set History tab to "All History" so older records are sent)  |
|  - Master: pushes trade changes on every tick + fast safety loop |
|  - Follower: waits on an open request (WaitForSignalMs) and gets |
|    each copy signal the moment the server creates it             |
|  - Claims copy signals atomically (no double execution)          |
|  - Backs off automatically on HTTP 429 / 5xx / network errors    |
|  - Follows master SL/TP changes on already-copied trades         |
|  - Uploads the broker's symbol list (on start, then hourly)      |
|  - Reports broker ping + cloud round trip every 15s (EA Health)  |
|  - Uses only GET/POST (some MT4 builds reject PATCH/DELETE: 4029)|
|  - Master: Trading Desk orders from the website + live prices    |
|                                                                  |
|  TROUBLESHOOTING:                                                |
|  - HTTP 401: Check SupabaseKey, BridgeKey and AccountLabel       |
|  - err 4060: SupabaseUrl not in WebRequest allow list            |
+------------------------------------------------------------------+
*/
#property copyright "CopyTrade Bridge"
#property version   "3.00"
#property strict

input string AccountLabel    = "CHANGE_ME";          // MUST match website account_name
input string SupabaseUrl     = "https://YOUR_PROJECT.supabase.co";
input string SupabaseKey     = "YOUR_ANON_KEY";       // Supabase anon key
input string BridgeKey       = "CHANGE_ME";          // Per-account secret from the website (Accounts > EA)
input int    UpdateSeconds   = 10;                    // Heartbeat interval (profit, balance) in seconds, min 10; trades still push instantly
input int    FastPollMs      = 100;                   // Safety loop: detect trade changes every N ms
input int    WaitForSignalMs = 1500;                  // Follower: keep request open up to N ms waiting for a signal (0 = poll)
input double MaxLotPerTrade  = 10.0;                  // Safety cap: signals above this lot size are rejected
input int    SlippagePoints  = 30;                    // Max slippage for market orders (points)
input string SymbolPrefix    = "";                    // Follower symbol prefix if broker differs (e.g. "")
input string SymbolSuffix    = "";                    // Follower symbol suffix if broker differs (e.g. ".m")

string   g_restUrl;
string   g_baseHeaders;
datetime g_backoffUntil = 0;
int      g_failStreak   = 0;
datetime g_historyCursor = 0;
bool     g_warnedLabel  = false;
string   g_lastSig      = "";
uint     g_lastFullMs   = 0;
bool     g_backfilled   = false;
uint     g_symbolsSentMs = 0;
bool     g_symbolsSent  = false;
int      g_tradeAccess  = -1;
uint     g_tradeAccessMs = 0;
uint     g_latencySentMs = 0;
uint     g_rttSum       = 0;
int      g_rttCount     = 0;
uint     g_deskPolledMs = 0;
uint     g_timerMs      = 0;
bool     g_deskActive   = false;
bool     g_deskMaster   = true;
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

   g_timerMs = GetTickCount();
   if(!EventSetMillisecondTimer(MathMax(100, FastPollMs)))
      Print("LiveBridge: timer could not start (err=", GetLastError(), ") - will retry on next tick");
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
   g_timerMs = GetTickCount();
   RunCycle();
}

void RunCycle()
{
   if(TimeLocal() < g_backoffUntil)
      return;
   if(!SyncIfNeeded()) return;
   if(PollCopySignals() > 0)
      SyncIfNeeded();
   if(PollDesk() > 0)
      SyncIfNeeded();
}

// Ticks often arrive faster than the timer: catch a new master trade sooner.
void OnTick()
{
   if(TimeLocal() < g_backoffUntil)
      return;
   // MT4 can silently stop timer events while ticks keep arriving; ticks alone would keep the
   // heartbeat alive but never collect copy/close orders, so re-arm the timer and run a full cycle.
   if(GetTickCount() - g_timerMs > 5000)
   {
      EventKillTimer();
      if(EventSetMillisecondTimer(MathMax(100, FastPollMs)))
         Print("LiveBridge: timer had stopped - restarted");
      g_timerMs = GetTickCount();
      RunCycle();
      return;
   }
   SyncIfNeeded();
}

// Push when a trade opens/closes/changes; otherwise only every UpdateSeconds.
// Floor of 10s also overrides an older "2" still saved in the chart settings.
bool SyncIfNeeded()
{
   if(!IsConnected()) return false;   // no heartbeat while cut off from the broker, so the PC watchdog can restart MT
   if(!AccountReady()) return false;
   string sig = LocalSignature();
   bool due = GetTickCount() - g_lastFullMs >= (uint)MathMax(10, UpdateSeconds) * 1000;
   if(sig == g_lastSig && !due) return true;
   if(!SyncPositions()) return false;
   g_lastSig = sig;
   if(!PushClosedTrades()) return false;
   if(!g_backfilled) g_backfilled = BackfillHistory();
   if(!PushAccountInfo()) return false;   // heartbeat last: last_seen means "positions are in sync"
   g_lastFullMs = GetTickCount();
   if(!g_symbolsSent || GetTickCount() - g_symbolsSentMs >= 3600000) PushSymbols();
   if(g_latencySentMs == 0 || GetTickCount() - g_latencySentMs >= 15000) PushLatency();
   PushTradeAccess();
   return true;
}

// Investor (read-only) logins report ACCOUNT_TRADE_ALLOWED = false; sent on change and every 5 minutes
void PushTradeAccess()
{
   int allowed = AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) != 0 ? 1 : 0;
   if(allowed == g_tradeAccess && GetTickCount() - g_tradeAccessMs < 300000) return;
   string json = "{\"p_account_name\":\"" + JsonEscape(AccountLabel) + "\",\"p_allowed\":" + (allowed == 1 ? "true" : "false") + "}";
   string resp;
   if(!Ok(Http("POST", g_restUrl + "rpc/ea_report_trade_access", json, "", resp))) return;
   if(allowed == 0 && g_tradeAccess != 0)
      Print("LiveBridge: This terminal is logged in READ-ONLY (investor password). Orders from the website will be refused.");
   g_tradeAccess = allowed;
   g_tradeAccessMs = GetTickCount();
}

// Broker ping comes from the terminal (microseconds); cloud time is the average heartbeat round trip.
void PushLatency()
{
   g_latencySentMs = GetTickCount();
   long pingUs = TerminalInfoInteger(TERMINAL_PING_LAST);
   int brokerMs = (IsConnected() && pingUs > 0) ? (int)MathMax(1, MathRound(pingUs / 1000.0)) : -1;
   int cloudMs = g_rttCount > 0 ? (int)(g_rttSum / (uint)g_rttCount) : -1;
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
   g_symbolsSentMs = GetTickCount();
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
   string holder = AccountName();
   if(StringLen(holder) == 0) return;
   string json = "{\"p_account_name\":\"" + JsonEscape(AccountLabel) + "\",\"p_holder\":\"" + JsonEscape(holder) + "\"}";
   string resp;
   Http("POST", g_restUrl + "rpc/ea_report_holder", json, "", resp);
}

string LocalSignature()
{
   string s = "";
   for(int i = 0; i < OrdersTotal(); i++)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      s += IntegerToString(OrderTicket()) + ":" + DoubleToString(OrderLots(), 2) + ":" +
           DoubleToString(OrderOpenPrice(), 5) + ":" + DoubleToString(OrderStopLoss(), 5) + ":" +
           DoubleToString(OrderTakeProfit(), 5) + ";";
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
         if(err == 4060 || err == 4029)
            Print("LiveBridge: err ", err, " - add ", SupabaseUrl, " to Tools->Options->Expert Advisors->Allow WebRequest, then restart MT4");
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
                 ",\"p_balance\":" + DoubleToString(AccountBalance(), 2) +
                 ",\"p_equity\":" + DoubleToString(AccountEquity(), 2) + "}";
   string resp;
   uint started = GetTickCount();
   int status = Http("POST", g_restUrl + "rpc/ea_heartbeat", json, "", resp);
   if(Ok(status))
   {
      g_rttSum += GetTickCount() - started;
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
//| Upsert all open orders, then delete only tickets no longer open  |
//+------------------------------------------------------------------+
bool SyncPositions()
{
   string arr = "";
   string tickets = "";
   int count = 0;

   for(int i = 0; i < OrdersTotal(); i++)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;

      string json = "{\"account_name\":\"" + JsonEscape(AccountLabel) + "\"" +
         ",\"ticket\":" + IntegerToString(OrderTicket()) +
         ",\"symbol\":\"" + JsonEscape(OrderSymbol()) + "\"" +
         ",\"order_type\":\"" + OrderTypeName(OrderType()) + "\"" +
         ",\"lots\":" + DoubleToString(OrderLots(), 2) +
         ",\"open_price\":" + DoubleToString(OrderOpenPrice(), 5) +
         ",\"sl\":" + DoubleToString(OrderStopLoss(), 5) +
         ",\"tp\":" + DoubleToString(OrderTakeProfit(), 5) +
         ",\"profit\":" + DoubleToString(OrderProfit(), 2) +
         ",\"swap\":" + DoubleToString(OrderSwap(), 2) +
         ",\"magic\":" + IntegerToString(OrderMagicNumber()) +
         ",\"open_time\":\"" + GetISOTime(OrderOpenTime(), true) + "\"}";
      arr += (count > 0 ? "," : "") + json;
      tickets += (count > 0 ? "," : "") + IntegerToString(OrderTicket());
      count++;
   }

   string resp;
   if(count > 0)
   {
      int up = Http("POST", g_restUrl + "live_positions?on_conflict=account_name,ticket", "[" + arr + "]",
                    "resolution=merge-duplicates,return=minimal", resp);
      if(!Ok(up)) return false;
   }

   string prune = "{\"p_account_name\":\"" + JsonEscape(AccountLabel) + "\",\"p_open_tickets\":[" + tickets + "]}";
   int del = Http("POST", g_restUrl + "rpc/ea_prune_positions", prune, "", resp);
   return Ok(del);
}

//+------------------------------------------------------------------+
//| Upload trades closed since last cursor (single batched request)  |
//+------------------------------------------------------------------+
#define OP_BALANCE_OP 6
#define OP_CREDIT_OP  7

// Closed trade JSON for the currently selected history order
string ClosedTradeJson()
{
   return "{\"account_name\":\"" + JsonEscape(AccountLabel) + "\"" +
      ",\"ticket\":" + IntegerToString(OrderTicket()) +
      ",\"symbol\":\"" + JsonEscape(OrderSymbol()) + "\"" +
      ",\"order_type\":\"" + OrderTypeName(OrderType()) + "\"" +
      ",\"lots\":" + DoubleToString(OrderLots(), 2) +
      ",\"open_price\":" + DoubleToString(OrderOpenPrice(), 5) +
      ",\"close_price\":" + DoubleToString(OrderClosePrice(), 5) +
      ",\"profit\":" + DoubleToString(OrderProfit(), 2) +
      ",\"commission\":" + DoubleToString(OrderCommission(), 2) +
      ",\"swap\":" + DoubleToString(OrderSwap(), 2) +
      ",\"open_time\":\"" + GetISOTime(OrderOpenTime(), true) + "\"" +
      ",\"close_time\":\"" + GetISOTime(OrderCloseTime(), true) + "\"}";
}

// Deposit / withdrawal / credit JSON for the currently selected history order
string BalanceOpJson()
{
   double amount = OrderProfit();
   string kind = OrderType() == OP_CREDIT_OP ? "credit" : (amount >= 0 ? "deposit" : "withdrawal");
   return "{\"account_name\":\"" + JsonEscape(AccountLabel) + "\"" +
      ",\"ticket\":" + IntegerToString(OrderTicket()) +
      ",\"op_type\":\"" + kind + "\"" +
      ",\"amount\":" + DoubleToString(amount, 2) +
      ",\"comment\":\"" + JsonEscape(OrderComment()) + "\"" +
      ",\"op_time\":\"" + GetISOTime(OrderOpenTime(), true) + "\"}";
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
   string trades = "", ops = "";
   int nt = 0, no = 0;
   datetime newest = g_historyCursor;

   for(int i = OrdersHistoryTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY)) continue;
      int type = OrderType();
      bool isTrade = type <= OP_SELL;
      bool isMoney = type == OP_BALANCE_OP || type == OP_CREDIT_OP;
      if(!isTrade && !isMoney) continue;                // skip cancelled pendings
      datetime t = isTrade ? OrderCloseTime() : OrderOpenTime();
      if(t == 0 || t < g_historyCursor - 60) continue;

      if(isTrade && nt < 200)      { trades += (nt > 0 ? "," : "") + ClosedTradeJson(); nt++; }
      else if(isMoney && no < 200) { ops += (no > 0 ? "," : "") + BalanceOpJson(); no++; }
      else continue;
      if(t > newest) newest = t;
   }

   if(!PostHistoryRows("trade_history", trades)) return false;
   if(!PostHistoryRows("balance_operations", ops)) return false;
   g_historyCursor = newest;
   return true;
}

// One-time upload of the whole account history (whatever the terminal's History tab holds)
bool BackfillHistory()
{
   string trades = "", ops = "";
   int nt = 0, no = 0, sentTrades = 0, sentOps = 0;
   int total = OrdersHistoryTotal();

   for(int i = 0; i < total; i++)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY)) continue;
      int type = OrderType();
      if(type <= OP_SELL && OrderCloseTime() > 0) { trades += (nt > 0 ? "," : "") + ClosedTradeJson(); nt++; }
      else if(type == OP_BALANCE_OP || type == OP_CREDIT_OP) { ops += (no > 0 ? "," : "") + BalanceOpJson(); no++; }

      if(nt >= 200) { if(!PostHistoryRows("trade_history", trades)) return false; sentTrades += nt; trades = ""; nt = 0; }
      if(no >= 200) { if(!PostHistoryRows("balance_operations", ops)) return false; sentOps += no; ops = ""; no = 0; }
   }
   if(!PostHistoryRows("trade_history", trades)) return false;
   if(!PostHistoryRows("balance_operations", ops)) return false;
   Print("LiveBridge: history backfill done - ", sentTrades + nt, " trades, ", sentOps + no, " deposits/withdrawals");
   return true;
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

//+------------------------------------------------------------------+
//| Trading Desk (master only): stream watched prices, run web orders |
//+------------------------------------------------------------------+
int PollDesk()
{
   uint interval = !g_deskMaster ? 60000 : (g_deskActive ? 300 : 2000);
   if(g_deskPolledMs != 0 && GetTickCount() - g_deskPolledMs < interval) return 0;
   g_deskPolledMs = GetTickCount();

   string quotes = "";
   RefreshRates();
   for(int i = 0; i < ArraySize(g_deskWatch); i++)
   {
      string sym = g_deskWatch[i];
      if(!SymbolSelect(sym, true)) continue;
      double bid = MarketInfo(sym, MODE_BID);
      double ask = MarketInfo(sym, MODE_ASK);
      if(bid <= 0 || ask <= 0) continue;
      int d = (int)MarketInfo(sym, MODE_DIGITS);
      if(StringLen(quotes) > 0) quotes += ",";
      quotes += "{\"s\":\"" + JsonEscape(sym) + "\",\"b\":" + DoubleToString(bid, d) + ",\"a\":" + DoubleToString(ask, d) +
                ",\"d\":" + IntegerToString(d) + ",\"mn\":" + DoubleToString(MarketInfo(sym, MODE_MINLOT), 3) +
                ",\"st\":" + DoubleToString(MarketInfo(sym, MODE_LOTSTEP), 3) + ",\"mx\":" + DoubleToString(MarketInfo(sym, MODE_MAXLOT), 2) + "}";
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

   if(!SymbolSelect(symbol, true) || MarketInfo(symbol, MODE_POINT) <= 0)
   {
      FinishDeskOrder(id, "failed", 0, "Symbol not available: " + symbol);
      return;
   }
   RefreshRates();
   double ask = MarketInfo(symbol, MODE_ASK);
   double bid = MarketInfo(symbol, MODE_BID);
   if(ask <= 0 || bid <= 0)
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

   int digits = (int)MarketInfo(symbol, MODE_DIGITS);
   double slVal = sl > 0 ? NormalizeDouble(sl, digits) : 0;
   double tpVal = tp > 0 ? NormalizeDouble(tp, digits) : 0;
   double px = NormalizeDouble(reqPrice, digits);
   int cmd = -1;
   double price = 0;
   color clr = clrBlue;
   if(orderType == "BUY")             { cmd = OP_BUY;       price = ask; }
   else if(orderType == "SELL")       { cmd = OP_SELL;      price = bid; clr = clrRed; }
   else if(orderType == "BUY_LIMIT")  { cmd = OP_BUYLIMIT;  price = px; }
   else if(orderType == "SELL_LIMIT") { cmd = OP_SELLLIMIT; price = px; clr = clrRed; }
   else if(orderType == "BUY_STOP")   { cmd = OP_BUYSTOP;   price = px; }
   else if(orderType == "SELL_STOP")  { cmd = OP_SELLSTOP;  price = px; clr = clrRed; }
   if(cmd < 0)
   {
      FinishDeskOrder(id, "failed", 0, "Unknown order type " + orderType);
      return;
   }

   int ticket = OrderSend(symbol, cmd, vol, price, SlippagePoints, slVal, tpVal, comment, 0, 0, clr);
   int err = ticket < 0 ? GetLastError() : 0;
   if(ticket < 0 && err == 130 && cmd <= OP_SELL && (slVal > 0 || tpVal > 0))
   {
      RefreshRates();
      price = cmd == OP_BUY ? MarketInfo(symbol, MODE_ASK) : MarketInfo(symbol, MODE_BID);
      ticket = OrderSend(symbol, cmd, vol, price, SlippagePoints, 0, 0, comment, 0, 0, clr);
      err = ticket < 0 ? GetLastError() : 0;
      if(ticket > 0 && OrderSelect(ticket, SELECT_BY_TICKET) && !OrderModify(ticket, OrderOpenPrice(), slVal, tpVal, 0))
      {
         FinishDeskOrder(id, "filled", ticket, "Opened, but SL/TP rejected by broker");
         return;
      }
   }

   if(ticket > 0)
   {
      FinishDeskOrder(id, "filled", ticket, "");
      Print("LiveBridge: Desk order ", orderType, " ", DoubleToString(vol, 2), " ", symbol, " #", ticket);
   }
   else
      FinishDeskOrder(id, "failed", 0, TradeErrorText(err));
}

void FinishDeskOrder(string id, string status, int ticket, string error)
{
   string resp;
   string body = "{\"p_id\":\"" + JsonEscape(id) + "\",\"p_account\":\"" + JsonEscape(AccountLabel) + "\",\"p_status\":\"" + status + "\"" +
                 ",\"p_ticket\":" + (ticket > 0 ? IntegerToString(ticket) : "null") +
                 ",\"p_error\":" + (StringLen(error) > 0 ? "\"" + JsonEscape(error) + "\"" : "null") + "}";
   Http("POST", g_restUrl + "rpc/ea_finish_desk_order", body, "", resp);
}

string TradeErrorText(int err)
{
   switch(err)
   {
      case 129: return "Invalid price (129)";
      case 130: return "Invalid stops (130)";
      case 131: return "Invalid volume (131)";
      case 132: return "Market is closed (132)";
      case 133: return "Trading disabled (133)";
      case 134: return "Not enough money (134)";
      case 135: return "Price changed (135)";
      case 136: return "Off quotes (136)";
      case 138: return "Requote (138)";
      case 145: return "Too close to market (145)";
      case 148: return "Too many orders (148)";
      case 4109: return "AutoTrading is off in MT4 (4109)";
      case 4110: return "Long trades not allowed (4110)";
      case 4111: return "Short trades not allowed (4111)";
   }
   return "OrderSend error " + IntegerToString(err);
}

void SetSignalStatus(string signalId, string newStatus)
{
   string resp;
   string body = "{\"p_id\":\"" + JsonEscape(signalId) + "\",\"p_status\":\"" + newStatus + "\"}";
   Http("POST", g_restUrl + "rpc/ea_set_signal_status", body, "", resp);
}

// Server stamps opened_at / closed_at. 0 / "" means "leave unchanged".
void UpdateCopyTrade(string copyId, string newStatus, int followerTicket = 0, string cancelReason = "", double lots = 0)
{
   string resp;
   string body = "{\"p_copy_id\":\"" + JsonEscape(copyId) + "\",\"p_status\":\"" + newStatus + "\"" +
                 ",\"p_follower_ticket\":" + (followerTicket > 0 ? IntegerToString(followerTicket) : "null") +
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
   int    magic         = (int)StringToInteger(ExtractJsonField(obj, "magic"));
   string tag           = MakeTag(masterAccount, masterTicket);

   // Local dedup: an order with this tag already exists (e.g. previous report failed)
   int existing = FindOrderByTag(tag, true);
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

   RefreshRates();
   double ask = MarketInfo(symbol, MODE_ASK);
   double bid = MarketInfo(symbol, MODE_BID);
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

   int digits = (int)MarketInfo(symbol, MODE_DIGITS);
   double slVal = sl > 0 ? NormalizeDouble(sl, digits) : 0;
   double tpVal = tp > 0 ? NormalizeDouble(tp, digits) : 0;
   double px = NormalizeDouble(openPrice, digits);
   int cmd = -1;
   double price = 0;
   color clr = clrBlue;

   if(orderType == "BUY")             { cmd = OP_BUY;       price = ask; }
   else if(orderType == "SELL")       { cmd = OP_SELL;      price = bid; clr = clrRed; }
   else if(orderType == "BUY_LIMIT")  { cmd = OP_BUYLIMIT;  price = px; }
   else if(orderType == "SELL_LIMIT") { cmd = OP_SELLLIMIT; price = px; clr = clrRed; }
   else if(orderType == "BUY_STOP")   { cmd = OP_BUYSTOP;   price = px; }
   else if(orderType == "SELL_STOP")  { cmd = OP_SELLSTOP;  price = px; clr = clrRed; }

   if(cmd < 0)
   {
      FailOpen(signalId, copyId, "unknown order type " + orderType);
      return;
   }

   int ticket = OrderSend(symbol, cmd, vol, price, SlippagePoints, slVal, tpVal, tag, magic, 0, clr);
   int err = ticket < 0 ? GetLastError() : 0;
   if(ticket < 0 && (slVal > 0 || tpVal > 0) && err == 130 && cmd <= OP_SELL)
   {
      // Master stops invalid on this broker's feed: open, then attach stops
      RefreshRates();
      if(cmd == OP_BUY) price = MarketInfo(symbol, MODE_ASK);
      if(cmd == OP_SELL) price = MarketInfo(symbol, MODE_BID);
      ticket = OrderSend(symbol, cmd, vol, price, SlippagePoints, 0, 0, tag, magic, 0, clr);
      err = ticket < 0 ? GetLastError() : 0;
      if(ticket > 0 && OrderSelect(ticket, SELECT_BY_TICKET))
         if(!OrderModify(ticket, OrderOpenPrice(), slVal, tpVal, 0))
            Print("LiveBridge: WARNING - #", ticket, " opened without SL/TP (stops rejected by broker)");
   }

   if(ticket > 0)
   {
      UpdateCopyTrade(copyId, "open", ticket, "", vol);
      SetSignalStatus(signalId, "executed");
      Print("LiveBridge: Opened ", orderType, " ", DoubleToString(vol, 2), " ", symbol, " #", ticket, " copy_id=", copyId);
   }
   else
      FailOpen(signalId, copyId, "OrderSend err=" + IntegerToString(err));
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
   int ticket    = (int)StringToInteger(ExtractJsonField(obj, "follower_ticket"));
   if(ticket <= 0 || !OrderSelect(ticket, SELECT_BY_TICKET) || OrderCloseTime() != 0)
   {
      SetSignalStatus(signalId, "cancelled");
      return;
   }

   string sym = OrderSymbol();
   if(MarketInfo(sym, MODE_BID) == 0)
   {
      SetSignalStatus(signalId, "pending");   // market closed: retry next cycle
      return;
   }

   int digits = (int)MarketInfo(sym, MODE_DIGITS);
   double slVal = sl > 0 ? NormalizeDouble(sl, digits) : 0;
   double tpVal = tp > 0 ? NormalizeDouble(tp, digits) : 0;
   if(MathAbs(OrderStopLoss() - slVal) < Point && MathAbs(OrderTakeProfit() - tpVal) < Point)
   {
      SetSignalStatus(signalId, "executed");
      return;
   }

   if(OrderModify(ticket, OrderOpenPrice(), slVal, tpVal, OrderExpiration(), clrDodgerBlue))
   {
      SetSignalStatus(signalId, "executed");
      Print("LiveBridge: Updated #", ticket, " SL=", DoubleToString(slVal, digits), " TP=", DoubleToString(tpVal, digits));
      return;
   }
   Print("LiveBridge: SL/TP update failed for #", ticket, " err=", GetLastError());

   // Broker rejects the whole request if either level is invalid: apply each one on its own so the other still lands.
   double curSl = OrderStopLoss();
   double curTp = OrderTakeProfit();
   bool slOk = MathAbs(curSl - slVal) < Point || OrderModify(ticket, OrderOpenPrice(), slVal, curTp, OrderExpiration(), clrDodgerBlue);
   if(slOk) curSl = slVal;
   bool tpOk = MathAbs(curTp - tpVal) < Point || OrderModify(ticket, OrderOpenPrice(), curSl, tpVal, OrderExpiration(), clrDodgerBlue);
   if(slOk) Print("LiveBridge: Updated #", ticket, " SL=", DoubleToString(slVal, digits));
   if(tpOk) Print("LiveBridge: Updated #", ticket, " TP=", DoubleToString(tpVal, digits));
   if(!tpOk || !slOk)
      Print("LiveBridge: ", (slOk ? "TP" : (tpOk ? "SL" : "SL and TP")), " rejected by broker for #", ticket, " err=", GetLastError(), " - will retry");
   SetSignalStatus(signalId, slOk && tpOk ? "executed" : "failed");
}

void HandleClose(string obj, string signalId)
{
   string copyId        = ExtractJsonField(obj, "copy_id");
   string masterAccount = ExtractJsonField(obj, "master_account");
   string masterTicket  = ExtractJsonField(obj, "master_ticket");
   int ticket           = (int)StringToInteger(ExtractJsonField(obj, "follower_ticket"));
   if(ticket <= 0)
      ticket = FindOrderByTag(MakeTag(masterAccount, masterTicket), false);

   bool isOpen = ticket > 0 && OrderSelect(ticket, SELECT_BY_TICKET) && OrderCloseTime() == 0;
   if(!isOpen)
   {
      MarkClosed(signalId, copyId);
      Print("LiveBridge: copy_id ", copyId, " has no open follower order - marked closed");
      return;
   }

   bool done = false;
   if(OrderType() <= OP_SELL)
   {
      RefreshRates();
      double price = OrderType() == OP_BUY ? MarketInfo(OrderSymbol(), MODE_BID) : MarketInfo(OrderSymbol(), MODE_ASK);
      if(price == 0)
      {
         SetSignalStatus(signalId, "pending");   // market closed: retry next cycle
         return;
      }
      done = OrderClose(ticket, OrderLots(), price, SlippagePoints, clrYellow);
   }
   else
      done = OrderDelete(ticket);

   if(done)
   {
      MarkClosed(signalId, copyId);
      Print("LiveBridge: Closed #", ticket, " copy_id=", copyId);
   }
   else
   {
      Print("LiveBridge: Close #", ticket, " failed err=", GetLastError(), " - retrying next cycle");
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
// Order comment tag: "CT" + master ticket + "-" + 4-hex hash of master account. Max 26 chars (< 31 MT4 limit).
string MakeTag(string masterAccount, string masterTicket)
{
   uint h = 5381;
   for(int i = 0; i < StringLen(masterAccount); i++)
      h = ((h << 5) + h) + (uint)StringGetCharacter(masterAccount, i);
   return "CT" + masterTicket + "-" + StringFormat("%04X", h & 0xFFFF);
}

int FindOrderByTag(string tag, bool includeHistory)
{
   for(int i = OrdersTotal() - 1; i >= 0; i--)
      if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES) && StringFind(OrderComment(), tag) == 0)
         return OrderTicket();
   if(includeHistory)
      for(int j = OrdersHistoryTotal() - 1; j >= MathMax(0, OrdersHistoryTotal() - 200); j--)
         if(OrderSelect(j, SELECT_BY_POS, MODE_HISTORY) && StringFind(OrderComment(), tag) == 0)
            return OrderTicket();
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
   long login = AccountNumber();
   if(login <= 0) return false;
   if(!LabelMatchesLogin(login))
   {
      if(!g_warnedAccount) Print("LiveBridge: terminal is logged in to ", login, ", waiting for the account in [", AccountLabel, "]");
      g_warnedAccount = true;
      return false;
   }
   g_accountReady = true;
   FixChartSymbol();
   return true;
}

// A chart opened on "EURUSD" goes dead on a broker that only lists "EURUSD@"; move it to the broker's name.
void FixChartSymbol()
{
   if(MarketInfo(_Symbol, MODE_POINT) > 0) return;
   string broker = FindBrokerSymbol(_Symbol);
   if(broker == "" || broker == _Symbol) return;
   Print("LiveBridge: moving chart from ", _Symbol, " to ", broker);
   ChartSetSymbolPeriod(0, broker, _Period);
}

string ResolveSymbol(string masterSymbol)
{
   if(SymbolSelect(masterSymbol, true) && MarketInfo(masterSymbol, MODE_POINT) > 0)
      return masterSymbol;
   string alt = SymbolPrefix + masterSymbol + SymbolSuffix;
   if(alt != masterSymbol && SymbolSelect(alt, true) && MarketInfo(alt, MODE_POINT) > 0)
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
   if(best == "" || !SymbolSelect(best, true) || MarketInfo(best, MODE_POINT) <= 0) return "";
   if(best != masterSymbol) Print("LiveBridge: ", masterSymbol, " not found, using broker symbol ", best);
   return best;
}

double NormalizeLots(string symbol, double lots)
{
   double step = MarketInfo(symbol, MODE_LOTSTEP);
   double minL = MarketInfo(symbol, MODE_MINLOT);
   double maxL = MarketInfo(symbol, MODE_MAXLOT);
   if(step <= 0 || minL <= 0) return 0;
   double v = MathFloor(lots / step + 1e-9) * step;
   if(v < minL) v = minL;
   if(v > maxL) v = maxL;
   return NormalizeDouble(v, 2);
}

string OrderTypeName(int type)
{
   if(type == OP_BUY) return "BUY";
   if(type == OP_SELL) return "SELL";
   if(type == OP_BUYLIMIT) return "BUY_LIMIT";
   if(type == OP_SELLLIMIT) return "SELL_LIMIT";
   if(type == OP_BUYSTOP) return "BUY_STOP";
   if(type == OP_SELLSTOP) return "SELL_STOP";
   return "OTHER";
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
   string v = StringTrimRight(StringSubstr(json, start, e - start));
   return v == "null" ? "" : v;
}

string JsonEscape(string value)
{
   string s = value;
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   return s;
}

// Broker server time -> UTC (used for display timestamps only).
string GetISOTime(datetime t, bool isServerTime)
{
   if(t == 0) return "1970-01-01T00:00:00Z";
   if(isServerTime)
   {
      int offset = (int)(MathRound((double)(TimeCurrent() - TimeGMT()) / 1800.0) * 1800);
      t -= offset;
   }
   string s = TimeToString(t, TIME_DATE | TIME_SECONDS);
   return StringSubstr(s, 0, 4) + "-" + StringSubstr(s, 5, 2) + "-" + StringSubstr(s, 8, 2) +
          "T" + StringSubstr(s, 11, 8) + "Z";
}
