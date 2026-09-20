# suisei-shop-notify — 星街すいせいFCの新商品・ニュース通知

`hoshimachi-suisei-fc.jp` を定期的に見て、新商品とニュースをDiscordに通知する。
**4兄弟のなかで唯一、商品とニュースの2系統を見ている。**

## ステータス

- **現在**: 稼働中
- **検証方法**: `gh run list --repo bibimib/suisei-shop-notify` で直近の成功を確認
- 死活監視: `bot-health` が毎朝9時に見ている（12時間止まったらアラート）

## 仕組み

| ワークフロー | cron | 役割 |
|---|---|---|
| `check.yml` | `*/5 * * * *`（5分ごと） | 新商品チェック→Discord→`oshi-timeline` |
| `news-check.yml` | `0 * * * *`（1時間ごと） | ニュース欄のチェック |
| `keepalive.yml` | `0 3 2 * *`（毎月2日） | ワークフローの自動停止を防ぐ |
| `test-notify.yml` | 手動 | 通知の見た目を確認する |

スクリプトも2本ある：`check.js`（商品）と `news-check.js`（ニュース）。

## 必要なSecret

`DISCORD_WEBHOOK_URL` / `GITHUB_TOKEN` / `TIMELINE_GITHUB_TOKEN`

## 兄弟プロジェクト

`holo-shop-notify` `vspo-shop-notify` `merch-notify` と同じ作り。
**片方を直したら他も見ること。** 詳しい対応表は `holo-shop-notify/CLAUDE.md`。

## 未実装候補

1. `docs/known-issues.md` を作る
2. 商品とニュースで通知の見た目を分ける（今はどちらも同じ形）
3. HTML構造が変わって静かに0件になる問題の検知
