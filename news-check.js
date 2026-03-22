// 星街すいせいFC公式サイト ニュース更新通知スクリプト
// 定期的にニュース一覧をチェックして、新着ニュースをDiscordに通知する

const BASE_URL = "https://hoshimachi-suisei-fc.jp";
const NEWS_LIST_URL = `${BASE_URL}/s/hs/news/list`;
const KNOWN_IDS_FILE = "known_news_ids.json";
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

// 既知のニュースIDを読み込む
function loadKnownIds() {
  if (fs.existsSync(KNOWN_IDS_FILE)) {
    return new Set(JSON.parse(fs.readFileSync(KNOWN_IDS_FILE, "utf-8")));
  }
  return new Set();
}

// 既知のニュースIDを保存する
function saveKnownIds(ids) {
  fs.writeFileSync(KNOWN_IDS_FILE, JSON.stringify([...ids], null, 2));
}

// ニュース一覧ページを取得してIDとタイトルを抽出する
async function fetchNewsItems() {
  const res = await fetch(NEWS_LIST_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  if (!res.ok) throw new Error(`ニュース取得失敗: ${res.status}`);
  const html = await res.text();

  const items = [];
  // href="/s/hs/news/detail/[ID]" と h2.news__title を一緒に抽出
  const pattern =
    /href="\/s\/hs\/news\/detail\/(\d+)[^"]*"[\s\S]*?<h2[^>]*class="news__title"[^>]*>([\s\S]*?)<\/h2>/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const id = match[1];
    // <br>タグをスペースに置換してタグを除去
    const title = match[2]
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    items.push({ id, title });
  }
  return items;
}

// Discordに通知を送る
async function sendDiscordNotification(item) {
  const url = `${BASE_URL}/s/hs/news/detail/${item.id}`;

  const payload = {
    embeds: [
      {
        title: "📢 新着ニュースが追加されました！",
        description: `**${item.title}**`,
        url,
        color: 0x0099ff, // 青（ニュース）
        fields: [
          {
            name: "詳細はこちら",
            value: `[ニュースを開く](${url})`,
            inline: false,
          },
        ],
        footer: { text: "星街すいせいFC ニュース速報" },
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

  console.log("星街すいせいFCニュースをチェック中...");

  const items = await fetchNewsItems();
  if (items.length === 0) {
    console.log("ニュースが取得できませんでした");
    return;
  }

  const knownIds = loadKnownIds();

  // 初回実行時はIDを記録するだけ（全件通知しない）
  if (knownIds.size === 0) {
    console.log(`初回実行: ${items.length}件のニュースIDを記録しました`);
    saveKnownIds(new Set(items.map((i) => i.id)));
    return;
  }

  // 新着ニュースを検出
  const newItems = items.filter((i) => !knownIds.has(i.id));

  if (newItems.length === 0) {
    console.log("新着ニュースなし");
    return;
  }

  console.log(`新着ニュース ${newItems.length}件 を検出！`);

  for (const item of newItems) {
    await sendDiscordNotification(item);
    await appendToTimeline([{
      id: `suisei-news-${item.id}`,
      sourceKey: "suisei",
      sourceLabel: "星詠み",
      sourceColor: "#FF8C00",
      title: item.title,
      url: `https://hoshimachi-suisei-fc.jp/s/hs/news/detail/${item.id}`,
      price: null,
      image: null,
      discoveredAt: new Date().toISOString(),
      type: "news",
    }]);
    console.log(`通知送信: ${item.title}`);
    knownIds.add(item.id);
  }

  saveKnownIds(knownIds);
  console.log("完了！");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
