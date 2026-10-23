//+------------------------------------------------------------------+
//| MizanSync.mq5 - sends your MetaTrader 5 trades to Mizan          |
//+------------------------------------------------------------------+
// Read-only: this Expert Advisor never opens, changes or closes a trade. It reads the account history and the
// open positions and sends them to Mizan, where they become the trades of the account the sync key was made for.
//
// Setup (once):
//  1. Tools > Options > Expert Advisors: tick "Allow WebRequest for listed URL" and add
//     https://lfdddmcktywktnrkthbx.supabase.co
//  2. Put this file in File > Open Data Folder > MQL5 > Experts, open it in MetaEditor (F4) and press Compile (F7).
//  3. Drag MizanSync onto any chart and paste the sync key from Mizan (Import page) in its inputs.
// Keep MT5 open: closed trades reach Mizan within a minute. The status shows in the chart's top-left corner.
#property copyright   "Mizan"
#property version     "1.00"
#property description "Sends your trades to your Mizan journal automatically."
#property description "Read-only: it never opens, changes or closes a trade."

input string InpKey   = "";  // Sync key (from Mizan, Import page)
input string InpUrl   = "https://lfdddmcktywktnrkthbx.supabase.co/functions/v1/mt5-sync"; // Mizan sync address
input int    InpDays  = 90;  // First sync: days of history
input int    InpEvery = 60;  // Check every (seconds)

#define BATCH     300   // positions per request (the server takes up to 2000)
#define RECENT    3     // days of history checked after the first sync
#define HEARTBEAT 600   // seconds: resend at least this often, so Mizan shows the link is alive

string   g_key   = "";
bool     g_full  = false;  // the first sync (InpDays of history) is done
bool     g_dirty = true;   // a deal or a position changed since the last check
bool     g_stop  = false;  // the server refused the key: wait until the inputs change
bool     g_told  = false;  // the "allow WebRequest" alert was shown
datetime g_next  = 0;      // local time of the next check
datetime g_sent  = 0;      // local time of the last successful send
string   g_last  = "";     // what was last sent
int      g_err   = 0;      // GetLastError() after a failed WebRequest

//--- text helpers
void Show(const string line)
  {
   Comment("Mizan Sync  |  MT5 account " + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "\n" + line);
  }

string Esc(const string s)
  {
   string r = s;
   StringReplace(r, "\\", "\\\\");
   StringReplace(r, "\"", "\\\"");
   return r;
  }

// A number for JSON: up to 8 decimals, without trailing zeros.
string Num(const double v)
  {
   string s = DoubleToString(v, 8);
   int n = StringLen(s);
   while(n > 0 && StringGetCharacter(s, n - 1) == '0')
      n--;
   if(n > 0 && StringGetCharacter(s, n - 1) == '.')
      n--;
   return n > 0 ? StringSubstr(s, 0, n) : "0";
  }

// Server time as YYYY-MM-DDTHH:MM, like the times of the MT5 report.
string When(const datetime t)
  {
   string s = TimeToString(t, TIME_DATE | TIME_MINUTES);
   StringReplace(s, ".", "-");
   StringReplace(s, " ", "T");
   return s;
  }

string Item(const long id, const string symbol, const bool buy, const double volume, const datetime tOpen, const double openPrice,
            const bool closed, const datetime tClose, const double closePrice, const double sl, const double tp,
            const double commission, const double swp, const double profit)
  {
   string s = "{\"id\":\"" + IntegerToString(id) + "\",\"symbol\":\"" + Esc(symbol) + "\",\"type\":\"" + (buy ? "buy" : "sell")
              + "\",\"volume\":" + Num(volume) + ",\"openTime\":\"" + When(tOpen) + "\",\"openPrice\":" + Num(openPrice);
   if(closed)
      s += ",\"closeTime\":\"" + When(tClose) + "\",\"closePrice\":" + Num(closePrice);
   s += ",\"sl\":" + Num(sl) + ",\"tp\":" + Num(tp) + ",\"commission\":" + Num(commission) + ",\"swap\":" + Num(swp)
        + ",\"profit\":" + Num(profit) + ",\"status\":\"" + (closed ? "closed" : "open") + "\"}";
   return s;
  }

void Push(string &list[], const string s)
  {
   int n = ArraySize(list);
   ArrayResize(list, n + 1, 256);
   list[n] = s;
  }

bool Has(const long &list[], const long v)
  {
   int n = ArraySize(list);
   for(int i = 0; i < n; i++)
      if(list[i] == v)
         return true;
   return false;
  }

// A whole number field of the server's JSON reply ("added":3 -> 3).
long Field(const string json, const string name)
  {
   int p = StringFind(json, "\"" + name + "\":");
   if(p < 0)
      return 0;
   p += StringLen(name) + 3;
   long v = 0;
   int n = StringLen(json);
   while(p < n)
     {
      ushort c = StringGetCharacter(json, p);
      if(c < '0' || c > '9')
         break;
      v = v * 10 + (c - '0');
      p++;
     }
   return v;
  }

// A text field of the server's JSON reply ("expected":"123" -> 123).
string Text(const string json, const string name)
  {
   string tag = "\"" + name + "\":\"";
   int p = StringFind(json, tag);
   if(p < 0)
      return "";
   p += StringLen(tag);
   int q = StringFind(json, "\"", p);
   return q < 0 ? "" : StringSubstr(json, p, q - p);
  }

string Host()
  {
   int p = StringFind(InpUrl, "/", 8);
   return p < 0 ? InpUrl : StringSubstr(InpUrl, 0, p);
  }

//--- reading the account
// Open positions; their ids go to ids[]. Floating profit and swap are left out: Mizan stores them once the trade closes.
void AddOpen(string &items[], long &ids[])
  {
   int total = PositionsTotal(), k = 0;
   ArrayResize(ids, total);
   for(int i = 0; i < total; i++)
     {
      if(PositionGetTicket(i) == 0)
         continue;
      long id = PositionGetInteger(POSITION_IDENTIFIER);
      ids[k++] = id;
      Push(items, Item(id, PositionGetString(POSITION_SYMBOL), PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY,
                       PositionGetDouble(POSITION_VOLUME), (datetime)PositionGetInteger(POSITION_TIME), PositionGetDouble(POSITION_PRICE_OPEN),
                       false, 0, 0, PositionGetDouble(POSITION_SL), PositionGetDouble(POSITION_TP), 0, 0, 0));
     }
   ArrayResize(ids, k);
  }

// One closed position from all of its deals (its entry may be older than the window). Prices are volume-weighted;
// stop and target are the ones at the exit, else at the entry. Netting reversals (DEAL_ENTRY_INOUT) count as exits.
bool Closed(const long id, string &item)
  {
   if(!HistorySelectByPosition(id))
      return false;
   string symbol = "";
   long side = -1;
   double volIn = 0, valIn = 0, volOut = 0, valOut = 0, com = 0, swp = 0, profit = 0, slIn = 0, tpIn = 0, slOut = 0, tpOut = 0;
   datetime tOpen = 0, tClose = 0;
   int n = HistoryDealsTotal();
   for(int i = 0; i < n; i++)
     {
      ulong d = HistoryDealGetTicket(i);
      if(d == 0)
         continue;
      long type = HistoryDealGetInteger(d, DEAL_TYPE), entry = HistoryDealGetInteger(d, DEAL_ENTRY);
      if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL)
         continue;
      double vol = HistoryDealGetDouble(d, DEAL_VOLUME), price = HistoryDealGetDouble(d, DEAL_PRICE);
      datetime t = (datetime)HistoryDealGetInteger(d, DEAL_TIME);
      com    += HistoryDealGetDouble(d, DEAL_COMMISSION) + HistoryDealGetDouble(d, DEAL_FEE);
      swp    += HistoryDealGetDouble(d, DEAL_SWAP);
      profit += HistoryDealGetDouble(d, DEAL_PROFIT);
      if(entry == DEAL_ENTRY_IN)
        {
         if(side < 0 || t < tOpen)
           {
            side = type;
            symbol = HistoryDealGetString(d, DEAL_SYMBOL);
            tOpen = t;
            slIn = HistoryDealGetDouble(d, DEAL_SL);
            tpIn = HistoryDealGetDouble(d, DEAL_TP);
           }
         volIn += vol;
         valIn += vol * price;
        }
      else
        {
         if(t >= tClose)
           {
            tClose = t;
            slOut = HistoryDealGetDouble(d, DEAL_SL);
            tpOut = HistoryDealGetDouble(d, DEAL_TP);
           }
         volOut += vol;
         valOut += vol * price;
        }
     }
   if(side < 0 || volIn <= 0 || volOut <= 0)
      return false;
   item = Item(id, symbol, side == DEAL_TYPE_BUY, volIn, tOpen, valIn / volIn, true, tClose, valOut / volOut,
               slOut > 0 ? slOut : slIn, tpOut > 0 ? tpOut : tpIn, com, swp, profit);
   return true;
  }

//--- talking to Mizan
int Post(const string body, string &reply)
  {
   uchar data[], result[];
   string headers;
   int len = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(len > 0 && data[len - 1] == 0)
      ArrayResize(data, len - 1);
   ResetLastError();
   int code = WebRequest("POST", InpUrl, "Content-Type: application/json\r\n", 30000, data, result, headers);
   g_err = code == -1 ? GetLastError() : 0;
   reply = code == -1 ? "" : CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   return code;
  }

void Fail(const int code, const string reply)
  {
   if(code == -1)
     {
      if(g_err == 4014) // the address is not in the allowed list
        {
         Show("MT5 blocks the connection. Tools > Options > Expert Advisors: tick \"Allow WebRequest for listed URL\" and add\n" + Host());
         if(!g_told)
           {
            g_told = true;
            Alert("Mizan Sync: allow WebRequest for " + Host() + " (Tools > Options > Expert Advisors).");
           }
        }
      else
         Show("No connection to Mizan (error " + IntegerToString(g_err) + "). Check the internet and the allowed URL " + Host() + ". Retrying...");
      return;
     }
   if(code == 401 && StringFind(reply, "badToken") >= 0)
     {
      g_stop = true;
      Show("Mizan does not know this sync key. Make a new key in Mizan (Import page) and paste it in the EA inputs.");
      return;
     }
   if(code == 409)
     {
      g_stop = true;
      Show("This key is for another MT5 account (" + Text(reply, "expected") + "). Log in to that account, or make a key for this one in Mizan.");
      return;
     }
   if(code == 404 && StringFind(reply, "noAccount") >= 0)
     {
      g_stop = true;
      Show("The Mizan account of this key was deleted. Make a new key in Mizan (Import page).");
      return;
     }
   Show("Mizan did not accept the trades (HTTP " + IntegerToString(code) + "). Retrying...");
   Print("Mizan Sync: HTTP ", code, " ", reply);
  }

// Sends the open positions and the positions closed in the last `days` days. False when it should retry.
bool Sync(const int days)
  {
   string items[];
   long openIds[];
   AddOpen(items, openIds);
   datetime now = TimeCurrent();
   if(!HistorySelect(now - days * 86400, now + 86400))
     {
      Show("Could not read the account history. Retrying...");
      return false;
     }
   int n = HistoryDealsTotal(), m = 0;
   long ids[];
   ArrayResize(ids, n);
   for(int i = 0; i < n; i++)
     {
      ulong d = HistoryDealGetTicket(i);
      if(d == 0)
         continue;
      long type = HistoryDealGetInteger(d, DEAL_TYPE);
      if((type == DEAL_TYPE_BUY || type == DEAL_TYPE_SELL) && HistoryDealGetInteger(d, DEAL_ENTRY) != DEAL_ENTRY_IN)
         ids[m++] = HistoryDealGetInteger(d, DEAL_POSITION_ID);
     }
   ArrayResize(ids, m);
   ArraySort(ids);
   for(int i = 0; i < m; i++)
     {
      if(ids[i] <= 0 || (i > 0 && ids[i] == ids[i - 1]) || Has(openIds, ids[i]))
         continue; // a partly closed position that is still open is sent as open
      string item;
      if(Closed(ids[i], item))
         Push(items, item);
     }

   int total = ArraySize(items);
   string all = "";
   for(int i = 0; i < total; i++)
      all += items[i] + "\n";
   if(all == g_last && TimeLocal() - g_sent < HEARTBEAT)
     {
      Show("Up to date  (checked " + TimeToString(TimeLocal(), TIME_MINUTES) + ", " + IntegerToString(ArraySize(openIds)) + " open)");
      return true;
     }

   string head = "{\"token\":\"" + Esc(g_key) + "\",\"login\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))
                 + "\",\"server\":\"" + Esc(AccountInfoString(ACCOUNT_SERVER)) + "\",\"currency\":\"" + Esc(AccountInfoString(ACCOUNT_CURRENCY))
                 + "\",\"positions\":[";
   long added = 0;
   for(int start = 0; start < total || start == 0; start += BATCH)
     {
      int stop = start + BATCH < total ? start + BATCH : total;
      string body = head;
      for(int i = start; i < stop; i++)
         body += (i > start ? "," : "") + items[i];
      body += "]}";
      string reply;
      int code = Post(body, reply);
      if(code != 200)
        {
         Fail(code, reply);
         return false;
        }
      added += Field(reply, "added");
     }
   g_last = all;
   g_sent = TimeLocal();
   Show("Synced " + TimeToString(g_sent, TIME_MINUTES) + "  (" + IntegerToString(added) + " new, " + IntegerToString(ArraySize(openIds)) + " open)");
   return true;
  }

//--- events
int OnInit()
  {
   g_key = InpKey;
   StringTrimLeft(g_key);
   StringTrimRight(g_key);
   if(StringLen(g_key) < 20)
     {
      Alert("Mizan Sync: paste your sync key (Mizan > Import > MT5 auto-sync) in the EA inputs.");
      return INIT_PARAMETERS_INCORRECT;
     }
   if(MQLInfoInteger(MQL_TESTER))
      return INIT_FAILED; // WebRequest does not work in the Strategy Tester
   g_full = false;
   g_dirty = true;
   g_stop = false;
   g_next = 0;
   g_last = "";
   Show("Connecting to Mizan...");
   EventSetTimer(5);
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   Comment("");
  }

void OnTick()
  {
  }

void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
  {
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD || trans.type == TRADE_TRANSACTION_POSITION)
      g_dirty = true;
  }

void OnTimer()
  {
   if(g_stop || (!g_dirty && TimeLocal() < g_next))
      return;
   g_dirty = false;
   if(Sync(g_full ? RECENT : (InpDays < 1 ? 1 : InpDays)))
      g_full = true;
   g_next = TimeLocal() + (InpEvery < 10 ? 10 : InpEvery);
  }
//+------------------------------------------------------------------+
