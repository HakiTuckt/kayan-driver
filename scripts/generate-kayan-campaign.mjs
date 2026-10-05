import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outputDir = path.join(root, "public/downloads/kayan-driver-campaign");
const photoPath = path.join(root, "public/assets/kayan-driver.png");
const width = 1080;
const height = 1350;

const banners = [
  {
    file: "01-introducing-kayan.jpg",
    kicker: "A NEW ERA FOR RIDE-HAILING",
    title: ["INTRODUCING", "KAYAN"],
    metric: "ZAMBIA",
    detail: ["A driver-first platform is on the way.", "Your ride. Your earnings. Your future."],
  },
  {
    file: "02-lower-commission.jpg",
    kicker: "LOWER FEES. MORE FOR YOU.",
    title: ["KEEP MORE", "OF EVERY FARE"],
    metric: "5%  /  0%",
    detail: ["5% commission for Standard drivers.", "0% commission for Premium drivers."],
  },
  {
    file: "03-higher-payment-per-km.jpg",
    kicker: "FAIRER EARNINGS, EVERY TRIP",
    title: ["MORE FOR", "EVERY KM"],
    metric: "K9",
    detail: ["Minimum fare target per kilometre.", "KAYAN aims to make every kilometre", "count as living costs continue to rise."],
  },
  {
    file: "04-driver-jackpot.jpg",
    kicker: "THE KAYAN PREMIUM JACKPOT",
    title: ["YOUR TRIPS", "COULD PAY MORE"],
    metric: "UP TO 1.3×",
    detail: ["Complete 14 successful trips in a day", "to unlock a chance at an enhanced payout", "on one eligible trip. Premium drivers."],
  },
  {
    file: "05-free-monthly-car-wash.jpg",
    kicker: "A LITTLE THANK-YOU, EVERY MONTH",
    title: ["DRIVE CLEAN.", "FEEL GOOD."],
    metric: "1 FREE WASH",
    detail: ["Enjoy one car wash each month", "at a participating partner service."],
  },
  {
    file: "06-free-fuel-premium.jpg",
    kicker: "A PREMIUM DRIVER BENEFIT",
    title: ["A FULL TANK,", "ON KAYAN."],
    metric: "EVERY 3 MONTHS",
    detail: ["KAYAN will cover one full tank", "of fuel every three months for", "eligible Premium drivers."],
  },
  {
    file: "07-built-by-listening.jpg",
    kicker: "A PERSONAL MESSAGE FROM HAKAN",
    title: ["BUILT BY", "LISTENING"],
    detail: [
      "In three months in Lusaka, I have",
      "heard drivers' concerns: high fees,",
      "low per-kilometre payments and",
      "the pressure of rising costs.",
      "That is why I am developing KAYAN",
      "with drivers at its heart.  — Hakan",
    ],
  },
  {
    file: "08-coming-soon-zambia.jpg",
    kicker: "YOU DRIVE THE CITY",
    title: ["YOU DESERVE", "TO EARN MORE."],
    metric: "KAYAN IS COMING SOON",
    detail: ["Lower fees. Fairer earnings.", "Real benefits for drivers.", "Stay tuned and be among the first."],
  },
];

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function textLine(text, x, y, size, fill, weight = 500, tracking = 0) {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" letter-spacing="${tracking}">${escapeXml(text)}</text>`;
}

function bannerOverlay(banner, index) {
  const lines = [];
  lines.push(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#052f2b" stop-opacity=".96"/>
          <stop offset=".48" stop-color="#073c36" stop-opacity=".88"/>
          <stop offset=".78" stop-color="#062e2a" stop-opacity=".67"/>
          <stop offset="1" stop-color="#041f20" stop-opacity=".91"/>
        </linearGradient>
        <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#62c7a0"/>
          <stop offset="1" stop-color="#6ed7e8"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#shade)"/>
      <path d="M0 0h${width}v18H0z" fill="url(#accent)"/>
      <circle cx="930" cy="720" r="280" fill="#56b899" opacity=".08"/>
  `);
  lines.push(textLine("KAYAN", 78, 102, 37, "#fffaf0", 800, 6));
  lines.push(textLine("ZAMBIA  /  COMING SOON", 1002, 99, 20, "#d6eee4", 700, 2).replace('x="1002"', 'x="1002" text-anchor="end"'));
  lines.push(`<rect x="78" y="137" width="920" height="2" fill="#d7eee5" opacity=".34"/>`);
  lines.push(textLine(banner.kicker, 80, 230, 24, "#8ce0bc", 700, 3));

  const titleSize = Math.max(65, 82 - Math.max(0, banner.title.join(" ").length - 22));
  banner.title.forEach((line, lineIndex) => {
    lines.push(textLine(line, 76, 350 + lineIndex * 104, titleSize, "#ffffff", 800, -1));
  });

  let detailY = 650;
  if (banner.metric) {
    const metricSize = banner.metric.length > 17 ? 42 : banner.metric.length > 9 ? 58 : 112;
    lines.push(textLine(banner.metric, 80, 650, metricSize, "#8ce0bc", 800, banner.metric.length > 9 ? 0 : -2));
    detailY = 725;
  }

  const bodySize = banner.detail.length > 4 ? 29 : 34;
  banner.detail.forEach((line, lineIndex) => {
    lines.push(textLine(line, 82, detailY + lineIndex * 50, bodySize, "#f0f7f2", 500));
  });

  lines.push(`<rect x="78" y="1170" width="9" height="78" rx="4" fill="url(#accent)"/>`);
  lines.push(textLine(index === 0 ? "YOUR RIDE. YOUR EARNINGS. YOUR FUTURE." : "DRIVER-FIRST. BUILT FOR ZAMBIA.", 111, 1202, 20, "#fffaf0", 700, 1.7));
  lines.push(textLine("KAYAN", 111, 1240, 18, "#9dcabb", 700, 4));
  lines.push(`</svg>`);
  return Buffer.from(lines.join(""));
}

await fs.mkdir(outputDir, { recursive: true });
const photo = sharp(photoPath).resize(width, height, { fit: "cover", position: "centre" });

for (const [index, banner] of banners.entries()) {
  const overlay = bannerOverlay(banner, index);
  await photo
    .clone()
    .composite([{ input: overlay }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(path.join(outputDir, banner.file));
}

console.log(`Created ${banners.length} campaign banners in ${path.relative(root, outputDir)}`);
