// Discordテスト通知スクリプト
// FC限定・通常それぞれのサンプル通知を送る

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const BASE_URL = "https://hoshimachi-suisei-fc.jp";

async function sendTestNotification(isFcLimited) {
  const url = `${BASE_URL}/s/hs/page/ec-top`;
  const fields = [
    { name: "価格", value: "¥7,500", inline: true },
    { name: "購入はこちら", value: `[ショップを開く](${url})`, inline: true },
  ];

  if (isFcLimited) {
    fields.push({
      name: "🌟 FC会員限定",
      value: "FC会員のみご購入いただけます",
      inline: false,
    });
  }

  const payload = {
    embeds: [
      {
        title: isFcLimited
          ? "🌟 【FC限定】新商品が追加されました！"
          : "🛍️ 新商品が追加されました！",
        description: isFcLimited
          ? "**【テスト】FC限定Tシャツ**"
          : "**【テスト】通常商品サンプル**",
        url,
        color: isFcLimited ? 0xff0000 : 0x57f287,
        fields,
        footer: { text: "星街すいせいFC公式ショップ速報（テスト）" },
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
  console.log(`テスト通知送信完了: ${isFcLimited ? "FC限定（赤）" : "通常（緑）"}`);
}

async function main() {
  if (!DISCORD_WEBHOOK_URL) {
    console.error("DISCORD_WEBHOOK_URL が設定されていません");
    process.exit(1);
  }

  console.log("Discordテスト通知を送信中...");
  await sendTestNotification(false); // 通常（緑）
  await new Promise((r) => setTimeout(r, 1000)); // 1秒待つ
  await sendTestNotification(true);  // FC限定（赤）
  console.log("テスト完了！Discordを確認してぺこ！");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
