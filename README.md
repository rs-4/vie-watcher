# VIE Watcher

Scraper léger de l'API Business France / Mon VIE qui poll toutes les 10 secondes et envoie chaque nouvelle offre sur Discord via webhook.

## Fonctionnement

- Appelle `POST https://civiweb-api-prd.azurewebsites.net/api/Offers/search` avec `skip: 0`, `limit: 30`.
- Stocke le plus grand `id` déjà vu dans `state.json`.
- Au premier lancement, initialise `lastMaxId` sans spammer Discord.
- Ensuite, envoie seulement les offres `id > lastMaxId`, de la plus ancienne à la plus récente.
- Respecte le `429 retry_after` Discord et espace les messages.

## Config

Créer un fichier `.env` local ou `/etc/vie-watcher.env` en prod :

```bash
DISCORD_WEBHOOK=https://discord.com/api/webhooks/XXXX/YYYY
POLL_MS=10000
```

Variables optionnelles :

- `VIE_LIMIT=30`
- `STATE_FILE=/opt/vie-watcher/state.json`
- `DRY_RUN=1` pour tester sans envoyer sur Discord
- `RUN_ONCE=1` pour un seul tick
- `DISCORD_DELAY_MS=1200`

## Test local

```bash
cp .env.example .env
export $(grep -v '^#' .env | xargs)
npm run dry-run
npm test
node watcher.js
```

Test webhook seul :

```bash
curl -X POST "$DISCORD_WEBHOOK" \
  -H "content-type: application/json" \
  -d '{"content":"✅ Test VIE Watcher — webhook OK."}'
```

## Déploiement systemd

```bash
sudo mkdir -p /opt/vie-watcher
sudo cp watcher.js package.json /opt/vie-watcher/
sudo cp vie-watcher.service /etc/systemd/system/vie-watcher.service
sudo install -o root -g www-data -m 0640 .env.example /etc/vie-watcher.env
sudo nano /etc/vie-watcher.env # remplacer le webhook
sudo chown -R www-data:www-data /opt/vie-watcher
sudo systemctl daemon-reload
sudo systemctl enable --now vie-watcher
sudo journalctl -u vie-watcher -f
```

Commandes utiles :

```bash
sudo systemctl status vie-watcher
sudo systemctl restart vie-watcher
sudo systemctl stop vie-watcher
```

## Notes

- Node 18+ requis (`fetch` natif). Testé avec Node 24.
- URL offre vérifiée : `https://mon-vie-via.businessfrance.fr/offres/{id}`.
- Ne jamais commit le webhook Discord.
- `state.json` doit rester persistant entre les redémarrages.
