/* 画像・音の事前キャッシュ（PWA） */
const CACHE = 'beefhunter-v1';
const PRECACHE = ["assets/img/assets_index.json", "assets/img/chars/boss_beast.png", "assets/img/chars/boss_demon.png", "assets/img/chars/boss_dragon.png", "assets/img/chars/boss_overlord.png", "assets/img/chars/enemy_flytrap.png", "assets/img/chars/enemy_golem.png", "assets/img/chars/enemy_shadow.png", "assets/img/chars/enemy_slime.png", "assets/img/chars/enemy_thornbug.png", "assets/img/chars/hero_courier.png", "assets/img/chars/hero_priest.png", "assets/img/chars/hero_spellknight.png", "assets/img/chars/hero_summoner.png", "assets/img/chars/hero_warrior.png", "assets/img/dice/faces.png", "assets/img/dice/ichi.png", "assets/img/dice/roll.png", "assets/img/fx/absorb.png", "assets/img/fx/curse.png", "assets/img/fx/cursor.png", "assets/img/fx/encount.png", "assets/img/fx/explosion.png", "assets/img/fx/fire.png", "assets/img/fx/gold.png", "assets/img/fx/heal.png", "assets/img/fx/hit.png", "assets/img/fx/paru.png", "assets/img/fx/paru_kiwami.png", "assets/img/fx/piyo.png", "assets/img/fx/summon_circle.png", "assets/img/fx/summon_seed.png", "assets/img/fx/swap.png", "assets/img/fx/warp.png", "assets/img/items/icons.png", "assets/img/npc/dealer.png", "assets/img/npc/inn.png", "assets/img/npc/merchant.png", "assets/img/npc/priest.png", "assets/img/npc/shoesage.png", "assets/img/npc/smith.png", "assets/img/num/damage.png", "assets/img/num/gold.png", "assets/img/num/heal.png", "assets/img/obj/chest.png", "assets/img/obj/chest_open.png", "assets/img/obj/gold_large.png", "assets/img/obj/gold_small.png", "assets/img/obj/qbox.png", "assets/img/obj/tack.png", "assets/img/obj/tack_big.png", "assets/img/tiles/bridge.png", "assets/img/tiles/forest.png", "assets/img/tiles/grass.png", "assets/img/tiles/mountain.png", "assets/img/tiles/path.png", "assets/img/tiles/path_boss.png", "assets/img/tiles/path_branch.png", "assets/img/tiles/path_lastboss.png", "assets/img/tiles/path_start.png", "assets/img/tiles/sand.png", "assets/img/tiles/sea_0.png", "assets/img/tiles/sea_1.png", "icons/icon-192.png", "icons/icon-512.png", "manifest.webmanifest"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', ...PRECACHE])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // 素材はキャッシュ優先、それ以外（HTML/JS）はネットワーク優先
  if (/\/assets\/img\/|\/icons\//.test(req.url)) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => { const c = res.clone(); caches.open(CACHE).then((x) => x.put(req, c)); return res; })));
  } else {
    e.respondWith(fetch(req).then((res) => { const c = res.clone(); caches.open(CACHE).then((x) => x.put(req, c)); return res; }).catch(() => caches.match(req)));
  }
});
