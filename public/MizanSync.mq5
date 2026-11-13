//+------------------------------------------------------------------+
//| MizanSync.mq5 - sends your MetaTrader 5 trades to Mizan          |
//+------------------------------------------------------------------+
// Read-only: this Expert Advisor never opens, changes or closes a trade. It reads the account history and the
// open positions and sends them to Mizan, where they become the trades of the account the sync key was made for.
// It also reads MT5's built-in economic calendar (history included) and sends it along, separately from the trades:
// a calendar hiccup never blocks or delays a trade sync.
//
// Setup (once):
//  1. Tools > Options > Expert Advisors: tick "Allow WebRequest for listed URL" and add
//     https://lfdddmcktywktnrkthbx.supabase.co
//  2. Put this file in File > Open Data Folder > MQL5 > Experts, open it in MetaEditor (F4) and press Compile (F7).
//  3. Drag MizanSync onto any chart and paste the sync key from Mizan (Import page) in its inputs.
// Keep MT5 open: closed trades reach Mizan within a minute. The status shows in the chart's top-left corner.
#property copyright   "Mizan"
#property version     "1.07"
#property description "Sends your trades to your Mizan journal automatically."
#property description "Read-only: it never opens, changes or closes a trade."

input string InpKey   = "";  // Sync key (from Mizan, Import page)
input string InpUrl   = "https://lfdddmcktywktnrkthbx.supabase.co/functions/v1/mt5-sync"; // Mizan sync address
input int    InpDays  = 90;  // First sync: days of history
input int    InpEvery = 60;  // Check every (seconds)

#define BATCH      300   // positions per request (the server takes up to 2000)
#define RECENT     3     // days of history checked after the first sync
#define HEARTBEAT  600   // seconds: resend at least this often, so Mizan shows the link is alive
#define CAL_DAYS     400   // first calendar sync: days of history
#define CAL_LEAD     14    // calendar sync: days ahead of now
#define CAL_HOURS    3600  // calendar sync: at most once this often (seconds)
#define CAL_BATCH    500   // calendar events per request
#define CAL_FMT_VER  2     // bump when CalValue's math changes: forces one full resend so the server overwrites old rows

string   g_key     = "";
datetime g_from    = 0;      // server time of the last sync that saw the whole history (0 = first sync: InpDays)
datetime g_beat    = 0;      // local time of the last timer event (a big jump = the PC slept)
datetime g_calm    = 0;      // local time from which MT5 counts as settled after a sleep or a lost connection
bool     g_dirty   = true;   // a deal or a position changed since the last check
bool     g_stop    = false;  // the server refused the key: wait until the inputs change
bool     g_told    = false;  // the "allow WebRequest" alert was shown
datetime g_next    = 0;      // local time of the next check
datetime g_sent    = 0;      // local time of the last successful send
string   g_last    = "";     // what was last sent
int      g_err     = 0;      // GetLastError() after a failed WebRequest
datetime g_calFrom = 0;      // server time covered by the calendar so far (0 = first sync: CAL_DAYS back)
datetime g_calNext = 0;      // local time of the next allowed calendar check
string   g_calCur[9] = {"USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "CNY"};
string   g_calFromVar = "";  // terminal global variable name: remembers g_calFrom across restarts, per account
string   g_calVerVar  = "";  // terminal global variable name: the calendar value-format version last fully sent

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

// The account's real trade mode, for the "verified account type" (MizanSync 1.07+): "demo", "contest" or "real".
// Anything else MT5 might add later is sent as "" and Mizan treats it as unknown.
string TradeMode()
  {
   switch((ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE))
     {
      case ACCOUNT_TRADE_MODE_DEMO:    return "demo";
      case ACCOUNT_TRADE_MODE_CONTEST: return "contest";
      case ACCOUNT_TRADE_MODE_REAL:    return "real";
     }
   return "";
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

//--- economic calendar
// MQL5's ENUM_CALENDAR_EVENT_IMPORTANCE, mapped to Mizan's impact scale. NONE is skipped (empty string).
string CalImpact(const ENUM_CALENDAR_EVENT_IMPORTANCE imp)
  {
   switch(imp)
     {
      case CALENDAR_IMPORTANCE_HIGH:     return "high";
      case CALENDAR_IMPORTANCE_MODERATE: return "medium";
      case CALENDAR_IMPORTANCE_LOW:      return "low";
      default:                          return "";
     }
  }

// actual/forecast/previous are scaled integers, always *10^6 regardless of digits (LONG_MIN = no value);
// digits only says how many decimal places to display, and unit/multiplier say what to append.
string CalValue(const long raw, const uint digits, const ENUM_CALENDAR_EVENT_UNIT unit, const ENUM_CALENDAR_EVENT_MULTIPLIER mult)
  {
   if(raw == LONG_MIN)
      return "";
   double v = raw / 1000000.0;
   string s = DoubleToString(v, (int)digits);
   switch(mult)
     {
      case CALENDAR_MULTIPLIER_THOUSANDS: s += "K"; break;
      case CALENDAR_MULTIPLIER_MILLIONS:  s += "M"; break;
      case CALENDAR_MULTIPLIER_BILLIONS:  s += "B"; break;
      case CALENDAR_MULTIPLIER_TRILLIONS: s += "T"; break;
     }
   if(unit == CALENDAR_UNIT_PERCENT)
      s += "%";
   return s;
  }

// Trade server time -> UTC, as the database expects (a timestamp with no offset, read as UTC).
string CalWhen(const datetime tServer, const long offset)
  {
   return When(tServer - (datetime)offset);
  }

string CalItem(const MqlCalendarValue &v, const MqlCalendarEvent &e, const string cur, const long offset)
  {
   return "{\"id\":\"" + IntegerToString((long)v.id) + "\",\"time\":\"" + CalWhen(v.time, offset)
          + "\",\"currency\":\"" + cur + "\",\"title\":\"" + Esc(e.name) + "\",\"impact\":\"" + CalImpact(e.importance)
          + "\",\"previous\":\"" + CalValue(v.prev_value, e.digits, e.unit, e.multiplier)
          + "\",\"forecast\":\"" + CalValue(v.forecast_value, e.digits, e.unit, e.multiplier)
          + "\",\"actual\":\"" + CalValue(v.actual_value, e.digits, e.unit, e.multiplier) + "\"}";
  }

// Reads the calendar from the last covered point (or CAL_DAYS back, first run) to CAL_LEAD days ahead, and sends it.
// Best-effort only: never sets g_stop, never shows an Alert, never touches the trade-sync status line or its timing.
void SyncCalendar()
  {
   datetime now = TimeCurrent();
   datetime from = g_calFrom == 0 ? now - CAL_DAYS * 86400 : g_calFrom;
   datetime to   = now + CAL_LEAD * 86400;
   long offset = (long)TimeTradeServer() - (long)TimeGMT();

   string items[];
   datetime maxTime = from;
   for(int c = 0; c < ArraySize(g_calCur); c++)
     {
      MqlCalendarValue values[];
      if(!CalendarValueHistory(values, from, to, NULL, g_calCur[c]))
         continue;
      for(int i = 0; i < ArraySize(values); i++)
        {
         MqlCalendarEvent ev;
         if(!CalendarEventById(values[i].event_id, ev))
            continue;
         if(ev.importance == CALENDAR_IMPORTANCE_NONE)
            continue;
         Push(items, CalItem(values[i], ev, g_calCur[c], offset));
         if(values[i].time > maxTime)
            maxTime = values[i].time;
        }
     }

   int total = ArraySize(items);
   if(total == 0)
     {
      g_calFrom = maxTime;
      GlobalVariableSet(g_calFromVar, (double)g_calFrom);
      GlobalVariableSet(g_calVerVar, (double)CAL_FMT_VER);
      return;
     }

   string head = "{\"token\":\"" + Esc(g_key) + "\",\"action\":\"calendar\",\"events\":[";
   bool okAll = true;
   for(int start = 0; start < total; start += CAL_BATCH)
     {
      int stop = start + CAL_BATCH < total ? start + CAL_BATCH : total;
      string body = head;
      for(int i = start; i < stop; i++)
         body += (i > start ? "," : "") + items[i];
      body += "]}";
      string reply;
      int code = Post(body, reply);
      if(code != 200)
        {
         okAll = false;
         break;
        }
     }
   if(okAll)
     {
      g_calFrom = maxTime;
      // Only once the whole range (from this run's `from`, which may be CAL_DAYS back) is confirmed sent does the
      // watermark advance and the format version get recorded -- so a failed resend retries the full range next hour.
      GlobalVariableSet(g_calFromVar, (double)g_calFrom);
      GlobalVariableSet(g_calVerVar, (double)CAL_FMT_VER);
     }
  }

// Sends the open positions and the positions closed since `from` (server time). False when it should retry.
bool Sync(const datetime from)
  {
   string items[];
   long openIds[];
   AddOpen(items, openIds);
   datetime now = TimeCurrent();
   if(!HistorySelect(from, now + 86400))
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

   string head = "{\"token\":\"" + Esc(g_key) + "\",\"now\":\"" + When(TimeCurrent()) + "\",\"login\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))
                 + "\",\"server\":\"" + Esc(AccountInfoString(ACCOUNT_SERVER)) + "\",\"currency\":\"" + Esc(AccountInfoString(ACCOUNT_CURRENCY))
                 + "\",\"tradeMode\":\"" + TradeMode() // (MizanSync 1.07+) older servers and EAs simply ignore / omit it
                 + "\",\"balance\":" + Num(AccountInfoDouble(ACCOUNT_BALANCE)) + ",\"positions\":[";
   long added = 0;
   for(int start = 0; start < total || start == 0; start += BATCH)
     {
      int stop = start + BATCH < total ? start + BATCH : total;
      string body = head;
      for(int i = start; i < stop; i++)
         body += (i > start ? "," : "") + items[i];
      body += "],\"final\":" + (stop >= total ? "true" : "false") + "}"; // the last request of this sync
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
   g_from = 0;
   g_dirty = true;
   g_stop = false;
   g_next = 0;
   g_last = "";
   g_calNext = 0;

   // The calendar watermark persists across restarts in a terminal global variable, scoped to this account, so a
   // normal restart does not resend CAL_DAYS of history every time. But when CAL_FMT_VER has gone up since the
   // last fully-sent run (e.g. this update's value-scaling fix), force one full resend so the server's upsert
   // overwrites the rows it already has with the corrected values.
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   g_calFromVar = "MizanSync_CalFrom_" + IntegerToString(login);
   g_calVerVar  = "MizanSync_CalFmtVer_" + IntegerToString(login);
   double sentVer = GlobalVariableCheck(g_calVerVar) ? GlobalVariableGet(g_calVerVar) : 0;
   if((int)sentVer >= CAL_FMT_VER && GlobalVariableCheck(g_calFromVar))
      g_calFrom = (datetime)GlobalVariableGet(g_calFromVar);
   else
      g_calFrom = 0; // first run, or the value format changed since the last full send: resend CAL_DAYS back

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
   datetime t = TimeLocal();
   if(t - g_beat > 60 || !TerminalInfoInteger(TERMINAL_CONNECTED))
      g_calm = t + 120; // after a sleep or a lost connection, MT5 first reloads the account history
   g_beat = t;
   // Calendar: its own hourly cadence, independent of the trade-sync gating below; a failure here is silent and retried next hour.
   if(!g_stop && t >= g_calNext)
     {
      SyncCalendar();
      g_calNext = t + CAL_HOURS;
     }
   if(g_stop || (!g_dirty && t < g_next))
      return;
   g_dirty = false;
   datetime now = TimeCurrent();
   datetime from = now - RECENT * 86400;
   if(g_from == 0)
      from = now - (InpDays < 1 ? 1 : InpDays) * 86400;
   else if(g_from < from)
      from = g_from; // a gap (sleep, no internet): check everything since the last good sync
   if(Sync(from) && t >= g_calm)
      g_from = now;
   g_next = t + (InpEvery < 10 ? 10 : InpEvery);
  }
//+------------------------------------------------------------------+
