# BEEF HUNTER（すごろくバトル）

原作「牛すじハンター」のルール・数値を再現したオンライン対戦すごろくRPG。仕様は [docs/SPEC.md](docs/SPEC.md)。

## 構成

| パス | 内容 |
|---|---|
| `packages/shared` | ルール本体（データ・乱数・マップ・進行エンジン・CPU思考）。Vitest |
| `packages/server` | Colyseus 0.15 サーバ（サーバ権威、制限時間、CPU代行、再接続、観戦、途中参加、リプレイ） |
| `packages/client` | Phaser 3 + Vite + Capacitor 6（Android）。ひとり用・チュートリアル・リプレイ再生は端末内で動作 |
| `assets/data` | マップ（標準／短編／長編） |

## 開発

```bash
npm install
npm run dev:server          # ws://localhost:2567
npm run dev:client          # http://localhost:5173
npm test                    # shared + server のテスト
npm run typecheck
npm run e2e                 # Playwright（Web版E2E）
```

クライアントの接続先は `VITE_SERVER_URL`（ビルド時）またはタイトル画面の「設定」で変更できます。

## Android（APK）

```bash
npm run build -w packages/client
cd packages/client && npx cap sync android
cd android && ./gradlew assembleRelease
```

GitHub Actions（`.github/workflows/android.yml`）で `main` への push ごとに `app-release.apk` を Artifacts と Releases に出力します。
Secrets：`SERVER_URL`（例 `wss://xxx.onrender.com`）、`KEYSTORE_BASE64`、`KEYSTORE_PASSWORD`、`KEY_ALIAS`、`KEY_PASSWORD`。キーストア未設定時はデバッグ署名で出力します。

## サーバ設置

Render（`render.yaml`）にそのままデプロイできます。`RENDER_DEPLOY_HOOK` を設定すると `server.yml` がテスト通過後にデプロイします。
HTTP エンドポイント：`/health`、`/find?code=`（ルームコード）、`/friend?code=`（フレンドコード）、`/rooms`（観戦可能なルーム）。

## 仕様との対応メモ

- 原作地形番号（1〜36）は 3=海、12〜18=山、28以降=広場（砂）、それ以外=草原 に割り当て。
- ひよこは使用者を除いた1位（歩数最多）が対象。
- ボス（`boss1/2/3`・`lastboss`）は制御マスに隣接するボスオブジェクトと対応付け。
- 牛魔王のスプライトは魔王（`boss_overlord`）を流用。
