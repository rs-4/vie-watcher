# VIE Watcher

A lightweight Business France / Mon VIE API watcher that polls every 10 seconds and sends each new offer to Discord via webhook.

## How it works

- Calls `POST https://civiweb-api-prd.azurewebsites.net/api/Offers/search` with `skip: 0`, `limit: 30`.
- Stores the highest offer `id` already seen in `state.json`.
- On the first run, initializes `lastMaxId` without spamming Discord.
- On later runs, sends only offers where `id > lastMaxId`, from oldest to newest.
- Handles Discord `429 retry_after` responses and spaces messages out to respect webhook rate limits.

## Configuration

Create a local `.env` file, or `/etc/vie-watcher.env` in production:

```bash
DISCORD_WEBHOOK=https://discord.com/api/webhooks/XXXX/YYYY
POLL_MS=10000
VIE_API_KEY=public_key_from_mon_vie_site
```

Optional variables:

- `VIE_API_KEY=...` for the `X-API-KEY` header required by the Business France API
- `VIE_LIMIT=30`
- `STATE_FILE=/opt/vie-watcher/state.json`
- `DRY_RUN=1` to test without sending Discord messages
- `RUN_ONCE=1` to run a single polling tick
- `DISCORD_DELAY_MS=1200`

## Local testing

```bash
cp .env.example .env
export $(grep -v '^#' .env | xargs)
npm run dry-run
npm test
node watcher.js
```

Test only the Discord webhook:

```bash
curl -X POST "$DISCORD_WEBHOOK" \
  -H "content-type: application/json" \
  -d '{"content":"✅ VIE Watcher test — webhook OK."}'
```

## systemd deployment

```bash
sudo mkdir -p /opt/vie-watcher
sudo cp watcher.js package.json /opt/vie-watcher/
sudo cp vie-watcher.service /etc/systemd/system/vie-watcher.service
sudo install -o root -g www-data -m 0640 .env.example /etc/vie-watcher.env
sudo nano /etc/vie-watcher.env # replace the webhook URL
sudo chown -R www-data:www-data /opt/vie-watcher
sudo systemctl daemon-reload
sudo systemctl enable --now vie-watcher
sudo journalctl -u vie-watcher -f
```

Useful commands:

```bash
sudo systemctl status vie-watcher
sudo systemctl restart vie-watcher
sudo systemctl stop vie-watcher
```

## Notes

- Requires Node 18+ for native `fetch`. Tested with Node 24.
- Verified offer URL pattern: `https://mon-vie-via.businessfrance.fr/offres/{id}`.
- Never commit the Discord webhook URL.
- `state.json` must persist across restarts.
