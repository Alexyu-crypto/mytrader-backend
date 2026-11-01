# CopyTrade - MT4/MT5 Multi-Broker Copy Trade Web App

A complete web application for managing multiple MT4/MT5 trading accounts with real-time position monitoring and copy trading capabilities. Custom Expert Advisors (EAs) run on your PC 24/7 and push live data to Supabase, while this web app displays everything in real-time and controls copy trading relationships.

## Architecture

```
MT4/MT5 Terminal (PC)          Supabase (Cloud)              Web App (Browser)
┌──────────────────┐     ┌──────────────────────┐     ┌────────────────────┐
│  EA Bridge        │────▶│  PostgreSQL Tables   │◀───▶│  React Dashboard   │
│  - Pushes positions│    │  - accounts          │     │  - Live positions  │
│  - Updates balance │    │  - live_positions    │     │  - Account cards   │
│  - Uploads history │    │  - trade_history     │     │  - Copy settings   │
│  - Polls signals   │◀───│  - copy_settings     │────▶│  - Copy engine     │
│                    │    │  - copy_signals      │     │  - History & P&L   │
└──────────────────┘     └──────────────────────┘     └────────────────────┘
```

## Quick Start

### 1. Prerequisites

- A Supabase project (already provisioned)
- MetaTrader 4 and/or MetaTrader 5 terminal(s) running on your PC
- The web app (this project) deployed and accessible

### 2. Web App Setup

The app is already configured with your Supabase credentials. No additional setup needed - just run the app.

### 3. Add Your Trading Accounts

1. Open the web app and go to **Accounts**
2. Click **Add New MT4/MT5 Account**
3. Enter:
   - **Account Name**: A unique name with NO spaces (e.g., `Master-Gold-01`, `Follower-EUR-02`)
   - **Broker**: Your broker name (e.g., IC Markets, Pepperstone)
   - **Platform**: MT4 or MT5
   - **Type**: Master (source of trades) or Follower (receives copied trades)
4. After saving, follow the on-screen setup instructions

### 4. Install the EA Bridge

#### For MT4:
1. Download `MT4LiveBridge.mq4` from the Accounts page
2. Copy it to your `MQL4/Experts` folder (File → Open Data Folder in MT4)
3. In MT4: Tools → Options → Expert Advisors
4. Check **"Allow WebRequest for listed URL"**
5. Add your Supabase URL: `https://YOUR_PROJECT.supabase.co`
6. Refresh the Navigator panel, drag the EA onto any chart
7. In the EA inputs:
   - `AccountLabel`: Set to EXACTLY the account name you created on the website
   - `SupabaseUrl`: Your Supabase project URL (find it on the Connection Test page)
   - `SupabaseKey`: Your Supabase anon key (find it on the Connection Test page)
   - `UpdateSeconds`: How often to push data (default 2 seconds)
8. Click **AutoTrading** to enable
9. Check the **Experts** tab for confirmation logs

#### For MT5:
Same steps but use `MT5LiveBridge.mq5` and copy to `MQL5/Experts`.

### 5. Configure Copy Trading

1. Go to **Copy Settings**
2. You'll see a matrix with masters on the left and followers on top
3. Click any cell to configure that master→follower relationship
4. Set:
   - **Enabled**: On/Off
   - **Mode**: Multiplier (follower lots = master lots × multiplier) or Fixed (always use fixed lot size)
   - **Lot Multiplier**: e.g., 0.5 = half size, 2.0 = double size
   - **Max Lot**: Safety cap on position size
   - **Reverse**: If enabled, BUY becomes SELL and vice versa
   - **Allowed/Blocked Symbols**: Restrict which symbols get copied
5. Save

### 6. Monitor Everything

- **Dashboard**: Real-time account cards, live positions table, copy engine log
- **History**: Closed trades with P&L summary, win rate, and filters
- **Connection Test**: Verify Supabase connectivity and get EA config values

## How Copy Trading Works

1. **Master EA** pushes open positions to `live_positions` table every 2 seconds
2. **Web App Copy Engine** (runs in your browser on the Dashboard page) detects new master positions every 3 seconds
3. For each new master position, the engine checks all enabled `copy_settings` where that account is the master
4. It calculates the follower's lot size based on the mode (multiplier or fixed)
5. A `copy_signal` is inserted into the database
6. **Follower EA** polls `copy_signals` for its account name and executes the trades
7. Signal status is updated to `executed` or `failed`

## Database Tables

| Table | Purpose |
|-------|---------|
| `accounts` | Account metadata (name, broker, platform, type, balance, equity) |
| `live_positions` | Currently open positions, refreshed every 2s by EA |
| `trade_history` | Closed trades uploaded by EA |
| `copy_settings` | Master→Follower configuration (lot mode, filters, etc.) |
| `copy_signals` | Generated copy trade signals for follower EAs to execute |

## EA Configuration

The EA has 4 input parameters:

| Input | Description | Default |
|-------|-------------|---------|
| `AccountLabel` | Must match the account_name created on the website | `CHANGE_ME` |
| `SupabaseUrl` | Your Supabase project URL | `https://YOUR_PROJECT.supabase.co` |
| `SupabaseKey` | Supabase anon key (find on Connection Test page) | `YOUR_ANON_KEY` |
| `UpdateSeconds` | Data push interval in seconds | `2` |

## Important Notes

- The **AccountLabel** in the EA MUST exactly match the account name you created on the website. This is how the system links your EA to the correct account.
- You can run multiple EAs on different charts/terminals, each with a different AccountLabel.
- The web app's copy engine only runs while the Dashboard page is open. For 24/7 operation, keep the Dashboard open or implement the Edge Function version.
- The EA works with ANY broker and ANY symbol - no broker-specific configuration needed.
- RLS is enabled but policies allow anon access for development. For production, consider adding authentication.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| EA shows HTTP 401 | Wrong SupabaseKey - copy the anon key from the Connection Test page |
| EA shows HTTP 0 or 404 | URL not in WebRequest allowlist - add Supabase URL to Tools→Options→EA |
| Account shows OFFLINE | EA not running or not pushing data. Check Experts tab for errors |
| No copy signals generated | Ensure copy settings are enabled and Dashboard page is open |
| Follower not executing | Check follower EA is running and AutoTrading is enabled |

## Download EA Files

- [MT4LiveBridge.mq4](/downloads/MT4LiveBridge.mq4)
- [MT5LiveBridge.mq5](/downloads/MT5LiveBridge.mq5)
