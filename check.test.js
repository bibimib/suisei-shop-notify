// check.js（商品）と news-check.js（ニュース）のテスト（ネットにはつながない。fetch を偽物に差し替える）
// 実行: node --test check.test.js
// ※ ファイル名を付けずに node --test だと test-notify.js（本物のテスト通知）まで走るので付けること

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

process.env.DISCORD_WEBHOOK_URL = "https://discord.test/webhook";
delete process.env.TIMELINE_GITHUB_TOKEN;
const shop = require("./check.js");
const news = require("./news-check.js");

// 作業用のフォルダに入って動かし、終わったら片付ける
async function inTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(__dirname, ".test-tmp-"));
  const prev = process.cwd();
  process.chdir(dir);
  try {
    await fn();
  } finally {
    process.chdir(prev);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// サイトは siteBody を返し、Discord は discordStatus(題名, 何回目) の番号を返す
function fakeFetch(siteBody, discordStatus = () => 204) {
  const posts = [];
  const counts = {};
  global.fetch = async (url, opts = {}) => {
    if (url === process.env.DISCORD_WEBHOOK_URL) {
      const title = (JSON.parse(opts.body).embeds?.[0]?.description ?? "").replace(/\*/g, "");
      counts[title] = (counts[title] ?? 0) + 1;
      posts.push(title);
      const status = discordStatus(title, counts[title]);
      if (status === 429) return new Response(JSON.stringify({ retry_after: 0.01 }), { status });
      return new Response(null, { status });
    }
    if (url.startsWith("https://hoshimachi-suisei-fc.jp/")) return new Response(siteBody, { status: 200 });
    throw new Error(`想定外の通信: ${url}`);
  };
  return posts;
}

const readList = (file) => JSON.parse(fs.readFileSync(file, "utf-8")).sort();

// --- 商品 ---
const item = (code) => ({ item_code: code, item_name: `商品${code}`, min_price: "1000", max_price: "1000" });
const shopBody = (codes) => JSON.stringify({ list: codes.map(item), pages: { total: "1" } });

test("商品：初回は名簿に記録するだけで、通知しない", async () => {
  await inTempDir(async () => {
    const posts = fakeFetch(shopBody([1, 2]));
    await shop.main();
    assert.deepEqual(posts, []);
    assert.deepEqual(readList("known_codes.json"), ["1", "2"]);
  });
});

test("商品：途中の1件が失敗しても、送れた分は名簿に残り、残りも送る", async () => {
  await inTempDir(async () => {
    fs.writeFileSync("known_codes.json", JSON.stringify(["1"]));
    const posts = fakeFetch(shopBody([1, 2, 3, 4]), (t) => (t === "商品3" ? 500 : 204));
    await assert.rejects(shop.main(), /商品3/);
    assert.deepEqual(posts, ["商品2", "商品3", "商品4"]);
    assert.deepEqual(readList("known_codes.json"), ["1", "2", "4"]);
  });
});

test("商品：送りすぎ（429）と言われたら、待ってから送り直す", async () => {
  await inTempDir(async () => {
    fs.writeFileSync("known_codes.json", JSON.stringify(["1"]));
    const posts = fakeFetch(shopBody([1, 2]), (t, n) => (n === 1 ? 429 : 204));
    await shop.main();
    assert.deepEqual(posts, ["商品2", "商品2"]);
    assert.deepEqual(readList("known_codes.json"), ["1", "2"]);
  });
});

// --- ニュース ---
const newsBody = (ids) =>
  ids.map((id) => `<a href="/s/hs/news/detail/${id}"><h2 class="news__title">ニュース${id}</h2></a>`).join("\n");

test("ニュース：途中の1件が失敗しても、送れた分は名簿に残り、残りも送る", async () => {
  await inTempDir(async () => {
    fs.writeFileSync("known_news_ids.json", JSON.stringify(["1"]));
    const posts = fakeFetch(newsBody([1, 2, 3, 4]), (t) => (t === "ニュース3" ? 500 : 204));
    await assert.rejects(news.main(), /ニュース3/);
    assert.deepEqual(posts, ["ニュース2", "ニュース3", "ニュース4"]);
    assert.deepEqual(readList("known_news_ids.json"), ["1", "2", "4"]);
  });
});

test("ニュース：次の回は、届かなかった分だけを送り直す", async () => {
  await inTempDir(async () => {
    fs.writeFileSync("known_news_ids.json", JSON.stringify(["1", "2", "4"]));
    const posts = fakeFetch(newsBody([1, 2, 3, 4]));
    await news.main();
    assert.deepEqual(posts, ["ニュース3"]);
    assert.deepEqual(readList("known_news_ids.json"), ["1", "2", "3", "4"]);
  });
});
