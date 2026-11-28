"""ROYAL MASTER FOREX - Relay Gateway (Relay Test group).

Logs in to the master and follower MT5 accounts through the MTsocketAPI SDK (no MetaTrader
terminal, no EA), reports "connected" to the platform and copies new master positions to the
followers. Put this file, start_gateway.bat and gateway_config.json in the SDK folder
bindings\\python (next to example_mt5.py) and run start_gateway.bat.
"""

import json
import os
import queue
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

from mtsocketapi import MT5WebClient, MT5WebClientOptions, Side

VERSION = "1.0.0"
HEARTBEAT_SECONDS = 5
RECONNECT_SECONDS = 10
MAX_POSITION_AGE_SECONDS = 120
HERE = os.path.dirname(os.path.abspath(__file__))


def utc_now():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds") if dt else None


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] {msg}", flush=True)


def pick(obj, *names):
    for n in names:
        v = getattr(obj, n, None)
        if v is None and isinstance(obj, dict):
            v = obj.get(n)
        if v is not None:
            return v
    return None


def load_config():
    path = os.path.join(HERE, "gateway_config.json")
    if not os.path.exists(path):
        sys.exit("gateway_config.json not found. Download it from the Relay Test group page.")
    with open(path, encoding="utf-8") as f:
        cfg = json.load(f)
    missing = [a["account_name"] for a in cfg.get("accounts", []) if not a.get("password")]
    if missing:
        sys.exit("Fill in the password in gateway_config.json for: " + ", ".join(missing))
    return cfg


class Platform:
    def __init__(self, cfg):
        self.base = cfg["supabase_url"].rstrip("/") + "/rest/v1/rpc/"
        self.anon = cfg["anon_key"]
        self.key = cfg["gateway_key"]

    def rpc(self, name, body):
        req = urllib.request.Request(
            self.base + name,
            data=json.dumps({"p_key": self.key, **body}).encode(),
            headers={"apikey": self.anon, "Authorization": "Bearer " + self.anon, "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as r:
                return json.loads(r.read() or b"null")
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")
            if "gateway key rejected" in detail:
                raise PermissionError("Gateway key rejected. Download a new gateway_config.json from the page.")
            raise RuntimeError(f"{name}: HTTP {e.code} {detail[:200]}")


class Account:
    def __init__(self, cfg, entry):
        self.name = entry["account_name"]
        self.login = int(entry["login"])
        self.password = entry["password"]
        self.url = cfg.get("web_terminal_url") or "wss://web.metatrader.app/terminal"
        self.page_url = cfg.get("page_url") or ""
        self.client = None
        self.offset = 0
        self.symbols = {}
        self.subscribed = []
        self.last_attempt = 0.0
        self.error = ""
        self.wake = None

    @property
    def connected(self):
        return bool(self.client is not None and self.client.is_connected)

    def connect(self, wake):
        self.wake = wake
        self.last_attempt = time.time()
        try:
            if self.client is not None:
                try:
                    self.client.close()
                except Exception:
                    pass
            self.client = MT5WebClient(self.url, MT5WebClientOptions())
            self.client.on_trade_event = lambda _e: self.wake.set()
            self.client.on_disconnected = lambda info: log(f"{self.name} disconnected: {info}")
            self.client.on_warning = lambda text: log(f"{self.name} warning: {text}")
            self.client.connect()
            self.client.login(self.login, self.password, page_url=self.page_url)
            acc = self.client.account_info()
            self.offset = int(pick(acc, "server_offset") or 0)
            self.symbols = {s.name: s for s in self.client.load_symbols()}
            self.error = ""
            log(f"{self.name} logged in. Balance {pick(acc, 'balance')} {pick(acc, 'currency')}, {len(self.symbols)} symbols")
            return True
        except Exception as e:
            self.error = str(e)[:200]
            log(f"{self.name} login failed: {self.error}")
            return False

    def ensure_subscribed(self, symbol_name):
        if symbol_name in self.subscribed or symbol_name not in self.symbols:
            return
        self.subscribed = ([symbol_name] + self.subscribed)[:5]
        self.client.subscribe([self.symbols[n] for n in self.subscribed])

    def broker_to_utc(self, value):
        if value is None:
            return None
        if isinstance(value, datetime):
            if value.tzinfo is not None:
                return value.astimezone(timezone.utc)
            return (value - timedelta(seconds=self.offset)).replace(tzinfo=timezone.utc)
        if isinstance(value, (int, float)):
            secs = value / 1000.0 if value > 1e11 else float(value)
            return datetime.fromtimestamp(secs - self.offset, tz=timezone.utc)
        return None


def position_info(p):
    sym = pick(p, "symbol")
    side = pick(p, "side", "type")
    return {
        "id": int(pick(p, "id", "position_id", "position", "ticket")),
        "symbol": getattr(sym, "name", sym) or "",
        "side": "sell" if "SELL" in str(side).upper() else "buy",
        "lots": float(pick(p, "lots", "volume") or 0),
        "sl": pick(p, "sl", "stop_loss"),
        "tp": pick(p, "tp", "take_profit"),
        "time": pick(p, "time", "open_time", "time_create", "opened_at"),
    }


def follower_symbol(member, symbol):
    name = symbol
    strip = member.get("strip_suffix") or ""
    if strip and name.endswith(strip):
        name = name[: -len(strip)]
    mapped = (member.get("symbol_map") or {}).get(symbol) or (member.get("symbol_map") or {}).get(name)
    if mapped:
        return mapped
    return (member.get("add_prefix") or "") + name + (member.get("add_suffix") or "")


def follower_lots(member, master_lots):
    if member.get("mode") == "fixed":
        lots = float(member.get("fixed_lot") or 0.01)
    else:
        lots = master_lots * float(member.get("lot_multiplier") or 1)
    lots = max(float(member.get("min_lot") or 0.01), min(float(member.get("max_lot") or 20), lots))
    return round(lots, 2)


class Gateway:
    def __init__(self, cfg):
        self.platform = Platform(cfg)
        self.cfg = cfg
        self.accounts = {a["account_name"]: Account(cfg, a) for a in cfg["accounts"]}
        self.members = []
        self.lock = threading.Lock()
        self.wake = threading.Event()
        self.logs = queue.Queue()
        self.known = set()
        self.copies = {}
        self.stop = threading.Event()

    def master_member(self):
        with self.lock:
            return next((m for m in self.members if m["role"] == "master"), None)

    def follower_members(self):
        with self.lock:
            return [m for m in self.members if m["role"] == "follower" and m.get("enabled")]

    def heartbeat(self):
        status = {
            "version": VERSION,
            "accounts": {n: {"connected": a.connected, "error": a.error} for n, a in self.accounts.items()},
        }
        res = self.platform.rpc("relay_gateway_heartbeat", {"p_status": status})
        with self.lock:
            self.members = res.get("members", [])
        return res

    def heartbeat_loop(self):
        while not self.stop.wait(HEARTBEAT_SECONDS):
            try:
                self.heartbeat()
            except PermissionError as e:
                log(str(e))
                self.stop.set()
                self.wake.set()
            except Exception as e:
                log(f"Heartbeat failed (will retry): {e}")

    def log_loop(self):
        while True:
            row = self.logs.get()
            for attempt in range(3):
                try:
                    self.platform.rpc("relay_gateway_log", row)
                    break
                except Exception as e:
                    log(f"Log write failed ({attempt + 1}/3): {e}")
                    time.sleep(1)

    def queue_log(self, info, follower, master_opened, received, done, lots, ticket, status, reason):
        self.logs.put({
            "p_master_ticket": info["id"], "p_follower": follower, "p_symbol": info["symbol"], "p_side": info["side"],
            "p_master_lots": info["lots"], "p_follower_lots": lots, "p_master_opened_at": iso(master_opened),
            "p_gateway_received_at": iso(received), "p_follower_received_at": iso(done),
            "p_follower_ticket": ticket, "p_status": status, "p_reason": reason,
        })

    def snapshot_master(self, master):
        time.sleep(2)
        self.known = {position_info(p)["id"] for p in master.client.positions}
        log(f"Master has {len(self.known)} open position(s); only new positions will be copied.")

    def copy_position(self, master, info, received):
        opened = master.broker_to_utc(info["time"])
        if opened is None or abs((received - opened).total_seconds()) > 600:
            opened = received
        if (received - opened).total_seconds() > MAX_POSITION_AGE_SECONDS:
            return
        log(f"MASTER OPEN #{info['id']} {info['side'].upper()} {info['lots']} {info['symbol']} (opened {iso(opened)})")
        for m in self.follower_members():
            name = m["account_name"]
            acc = self.accounts.get(name)
            allowed, blocked = m.get("allowed_symbols") or [], m.get("blocked_symbols") or []
            if (allowed and info["symbol"] not in allowed) or info["symbol"] in blocked:
                continue
            lots = follower_lots(m, info["lots"])
            if acc is None or not acc.connected:
                self.queue_log(info, name, opened, received, None, lots, None, "missed", "follower not logged in to the Gateway")
                continue
            sym_name = follower_symbol(m, info["symbol"])
            sym = acc.symbols.get(sym_name)
            if sym is None:
                self.queue_log(info, name, opened, received, None, lots, None, "failed", f"symbol {sym_name} not found on follower")
                continue
            side = info["side"]
            if m.get("reverse"):
                side = "buy" if side == "sell" else "sell"
            sl = info["sl"] if m.get("copy_sl") and not m.get("reverse") and info["sl"] else None
            tp = info["tp"] if m.get("copy_tp") and not m.get("reverse") and info["tp"] else None
            try:
                acc.ensure_subscribed(sym_name)
                r = acc.client.open_market_order(sym, Side.SELL if side == "sell" else Side.BUY, lots, sl, tp, f"RMF {info['id']}")
                done = utc_now()
                if r.ok:
                    ticket = pick(r, "position", "order", "deal")
                    ticket = int(ticket) if ticket else None
                    self.copies.setdefault(info["id"], {})[name] = ticket
                    self.queue_log(info, name, opened, received, done, lots, ticket, "copied", None)
                    log(f"  -> {name} {side.upper()} {lots} {sym_name} #{ticket} in {(done - opened).total_seconds():.2f}s")
                else:
                    reason = f"{r.retcode} {r.retcode_text}"
                    self.queue_log(info, name, opened, received, done, lots, None, "failed", reason)
                    log(f"  -> {name} FAILED: {reason}")
            except Exception as e:
                self.queue_log(info, name, opened, received, utc_now(), lots, None, "failed", str(e)[:250])
                log(f"  -> {name} ERROR: {e}")

    def close_copies(self, master_id):
        for name, ticket in self.copies.pop(master_id, {}).items():
            acc = self.accounts.get(name)
            if not ticket or acc is None or not acc.connected:
                continue
            try:
                r = acc.client.close_position(ticket)
                log(f"MASTER CLOSE #{master_id} -> {name} close #{ticket}: {'ok' if r.ok else r.retcode_text}")
            except Exception as e:
                log(f"MASTER CLOSE #{master_id} -> {name} close #{ticket} ERROR: {e}")

    def run(self):
        log(f"Relay Gateway {VERSION} starting")
        res = self.heartbeat()
        log(f"Platform OK: group '{res.get('group')}', engine {res.get('engine')}")
        master_m = self.master_member()
        if master_m is None or master_m["account_name"] not in self.accounts:
            sys.exit("The master account of the group is missing from gateway_config.json.")
        master = self.accounts[master_m["account_name"]]
        for acc in self.accounts.values():
            acc.connect(self.wake)
        if not master.connected:
            log("Master not logged in yet; retrying every 10 seconds.")
        else:
            self.snapshot_master(master)
        self.heartbeat()
        threading.Thread(target=self.heartbeat_loop, daemon=True).start()
        threading.Thread(target=self.log_loop, daemon=True).start()
        log("Gateway running. The page now shows 'Relay 已接入'. Press Ctrl+C to stop.")

        while not self.stop.is_set():
            self.wake.wait(0.05)
            self.wake.clear()
            for acc in self.accounts.values():
                if not acc.connected and time.time() - acc.last_attempt > RECONNECT_SECONDS:
                    if acc.connect(self.wake) and acc is master:
                        self.snapshot_master(master)
            if not master.connected:
                continue
            received = utc_now()
            try:
                current = {i["id"]: i for i in (position_info(p) for p in master.client.positions)}
            except Exception as e:
                log(f"Could not read master positions: {e}")
                continue
            for pid, info in current.items():
                if pid not in self.known:
                    self.known.add(pid)
                    self.copy_position(master, info, received)
            for pid in list(self.known - current.keys()):
                self.known.discard(pid)
                self.close_copies(pid)


if __name__ == "__main__":
    try:
        Gateway(load_config()).run()
    except KeyboardInterrupt:
        log("Stopped.")
    except Exception as e:
        log(f"Gateway stopped: {e}")
        sys.exit(1)
