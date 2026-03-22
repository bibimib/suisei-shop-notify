// 星街すいせいFC公式ショップ 新商品通知スクリプト
// 定期的に商品一覧をチェックして、新商品をDiscordに通知する

const BASE_URL = "https://hoshimachi-suisei-fc.jp";
const API_URL = `${BASE_URL}/s/hs/api/list/item_list`;
const KNOWN_CODES_FILE = "known_codes.json";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const fs = require("fs");

const TIMELINE_TOKEN = process.env.TIMELINE_GITHUB_TOKEN;

async function appendToTimeline(newItems) {
  if (!TIMELINE_TOKEN || newItems.length === 0) return;
  const apiUrl = "https://api.github.com/repos/bibimib/oshi-timeline/contents/feed.json";
  const headers = {
    Authorization: `Bearer ${TIMELINE_TOKEN}`,
    "User-Agent": "oshi-timeline-writer",
    "Content-Type": "application/json",
  };
  const getRes = await fetch(apiUrl, { headers });
  let currentItems = [];
  let sha = null;
  if (getRes.ok) {
    const data = await getRes.json();
    sha = data.sha;
    currentItems = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
  }
  const existingIds = new Set(currentItems.map(i => i.id));
  const toAdd = newItems.filter(i => !existingIds.has(i.id));
  if (toAdd.length === 0) return;
  const newFeed = [...toAdd, ...currentItems].slice(0, 200);
  const putRes = await fetch(apiUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `フィード更新: ${toAdd.length}件追加`,
      content: Buffer.from(JSON.stringify(newFeed, null, 2)).toString("base64"),
      sha,
    }),
  });
  if (!putRes.ok) console.warn(`タイムライン更新失敗: ${putRes.status}`);
  else console.log(`タイムラインに${toAdd.length}件追加しました`);
}

// 既知の商品コードを読み込む
function loadKnownCodes() {
  if (fs.existsSync(KNOWN_CODES_FILE)) {
    return new Set(JSON.parse(fs.readFileSync(KNOWN_CODES_FILE, "utf-8")));
  }
  return new Set();
}

// 既知の商品コードを保存する
function saveKnownCodes(codes) {
  fs.writeFileSync(KNOWN_CODES_FILE, JSON.stringify([...codes], null, 2));
}

// 全商品を取得（ページネーション対応）
async function fetchAllItems() {
  const items = [];
  let page = 0;
  while (true) {
    const url = `${API_URL}?page=${page}&limit=50`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ショップ取得失敗: ${res.status}`);
    const data = await res.json();
    if (!data.list || data.list.length === 0) break;
    items.push(...data.list);
    const totalPages = parseInt(data.pages?.total ?? "1", 10);
    if (page + 1 >= totalPages) break;
    page++;
  }
  return items;
}

// FC限定商品かどうかを判定（商品名に「FC限定」が含まれるか）
function isFcLimited(item) {
  return item.item_name?.includes("FC限定") ?? false;
}

// 商品の詳細URLを組み立てる
function buildItemUrl(item) {
  if (item.item_details_url) {
    return item.item_details_url.startsWith("http")
      ? item.item_details_url
      : `${BASE_URL}${item.item_details_url}`;
  }
  return `${BASE_URL}/s/hs/item/detail/${item.item_code}`;
}

// 価格を表示用に整形する
function formatPrice(item) {
  const min = parseInt(item.min_price ?? "0", 10);
  const max = parseInt(item.max_price ?? "0", 10);
  if (min === 0 && max === 0) return "価格未定";
  if (min === max) return `¥${min.toLocaleString()}`;
  return `¥${min.toLocaleString()} 〜 ¥${max.toLocaleString()}`;
}

// Discordに通知を送る
async function sendDiscordNotification(item) {
  const fcLimited = isFcLimited(item);
  const url = buildItemUrl(item);
  const price = formatPrice(item);
  const image = item.item_img_url ?? null;

  const fields = [
    { name: "価格", value: price, inline: true },
    { name: "購入はこちら", value: `[ショップを開く](${url})`, inline: true },
  ];

  if (fcLimited) {
    fields.push({
      name: "🌟 FC会員限定",
      value: "FC会員のみご購入いただけます",
      inline: false,
    });
  }

  const payload = {
    embeds: [
      {
        title: fcLimited
          ? "🌟 【FC限定】新商品が追加されました！"
          : "🛍️ 新商品が追加されました！",
        description: `**${item.item_name}**`,
        url,
        color: fcLimited ? 0xff0000 : 0x57f287, // FC限定=赤・通常=緑
        fields,
        image: image ? { url: image } : undefined,
        footer: { text: "星街すいせいFC公式ショップ速報" },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Discord通知失敗: ${res.status}`);
}

// メイン処理
async function main() {
  if (!DISCORD_WEBHOOK_URL) {
    console.error("DISCORD_WEBHOOK_URL が設定されていません");
    process.exit(1);
  }

  console.log("星街すいせいFCショップをチェック中...");

  const items = await fetchAllItems();
  const knownCodes = loadKnownCodes();

  // 初回実行時はコードを記録するだけ（全商品を通知しない）
  if (knownCodes.size === 0) {
    console.log(`初回実行: ${items.length}件の商品コードを記録しました`);
    const allCodes = new Set(items.map((i) => String(i.item_code)));
    saveKnownCodes(allCodes);
    return;
  }

  // 新商品を検出
  const newItems = items.filter((i) => !knownCodes.has(String(i.item_code)));

  if (newItems.length === 0) {
    console.log("新商品なし");
    return;
  }

  console.log(`新商品 ${newItems.length}件 を検出！`);

  for (const item of newItems) {
    await sendDiscordNotification(item);
    await appendToTimeline([{
      id: `suisei-shop-${item.item_code}`,
      sourceKey: "suisei",
      sourceLabel: "星詠み",
      sourceColor: "#FF8C00",
      title: item.item_name,
      url: buildItemUrl(item),
      price: item.min_price || null,
      image: item.item_img_url || null,
      discoveredAt: new Date().toISOString(),
      type: "shop",
    }]);
    const label = isFcLimited(item) ? "（FC限定）" : "";
    console.log(`通知送信: ${item.item_name}${label}`);
    knownCodes.add(String(item.item_code));
  }

  saveKnownCodes(knownCodes);
  console.log("完了！");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
