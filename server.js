// ══════════════════════════════════════════════════════
//  Survey API Server  —  Node.js + Express + MySQL
//  파일: server.js
// ══════════════════════════════════════════════════════

const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");

const app = express();
app.use(express.json());

// ─── CORS ──────────────────────────────────────────────
app.use(
  cors({
    origin: ["https://yourdomain.com", "https://www.yourdomain.com"],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  }),
);

// ─── DB 연결 풀 ────────────────────────────────────────
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "survey_user",
  password: process.env.DB_PASSWORD || "your_password",
  database: process.env.DB_NAME || "survey_db",
  waitForConnections: true,
  connectionLimit: 10,
});

// ─── 슬랙 알림 ─────────────────────────────────────────
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";

const GENDER_LABEL = { male: "남성", female: "여성" };
const AGE_LABEL = {
  "10s": "10대",
  "20s": "20대",
  "30s": "30대",
  "40s": "40대",
  "50s": "50대",
  "60plus": "60대 이상",
};
const PURPOSE_LABEL = {
  purchase: "구매",
  experience: "체험",
  gift: "선물",
  inquiry: "상담&문의",
};
const CAT_LABEL = {
  lower_body: "하체",
  back: "등허리",
  neck_shoulder: "목어깨",
  massage_gun: "마사지건",
  other: "기타",
};
const PRODUCT_LABEL = {
  lb_pulley_thigh: "풀리지 허벅지 마사지기",
  lb_calf_v3: "종아리 마사지기 V3",
  lb_boots: "풀리션 마사지 부츠",
  bk_mat: "마사지 매트",
  bk_backpuller: "백풀러 허리 마사지기",
  bk_cushion: "등 허리 쿠션 마사지기",
  ns_tapping_v3: "목 어깨 두드림 마사지기 V3",
  ns_neckpuller: "넥풀러 목 어깨 홈케어",
  ns_thepillow: "더필로 마사지베개",
  ns_travel_pillow: "여행용 목 베개 마사지기",
  mg_minimax: "미니맥스 마사지건",
  mg_gun_belt: "마사지 건 & 벨트",
  mg_turbofit: "터보핏 마사지건",
  ww_pullio: "풀리오 웰워크",
  etc_hand: "손 마사지기",
  etc_pediplaner: "패디플래너",
  etc_airgua: "에어괄사 마사지기",
};
const BUYPURPOSE_LABEL = {
  massage_strength: "마사지강도",
  design: "디자인만족",
  price: "합리적가격",
  gift_give: "선물용",
  other: "기타",
};
const ROUTE_LABEL = {
  sns: "SNS",
  search: "검색",
  friend: "지인추천",
  pass_by: "지나가다발견",
  existing: "기존이용자",
};
const STORE_LABEL = {
  suwon: "타임빌라스 수원점",
  hongdae: "홍대점",
  sinchon: "신촌점",
  jamsil: "잠실점",
};

const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);
const revisitBar = (n) =>
  ["🔴", "🟠", "🟡", "🟢", "💚"][n - 1] + " " + n + "/5";
const labelArr = (arr, map) => arr.map((v) => map[v] || v).join(", ") || "-";

async function sendSlackNotification(data) {
  if (!SLACK_WEBHOOK_URL) return;

  const store = STORE_LABEL[data.store_id] || data.store_id;
  const gender = GENDER_LABEL[data.gender] || data.gender;
  const age = AGE_LABEL[data.age] || data.age;
  const purposes = labelArr(data.purpose, PURPOSE_LABEL);
  const cats = labelArr(data.categories, CAT_LABEL);
  const products = labelArr(data.products, PRODUCT_LABEL);
  const buyPurpose = labelArr(data.buy_purpose, BUYPURPOSE_LABEL);
  const routes = labelArr(data.route, ROUTE_LABEL);
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  const hasImprove = data.comment_improve?.trim();
  const hasPraise = data.comment_praise?.trim();

  const payload = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `📋 새 설문 응답 — ${store}`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*성별*\n${gender}` },
          { type: "mrkdwn", text: `*연령대*\n${age}` },
          {
            type: "mrkdwn",
            text: `*재방문 의향*\n${revisitBar(data.revisit)}`,
          },
          { type: "mrkdwn", text: `*방문 목적*\n${purposes}` },
          { type: "mrkdwn", text: `*방문 경로*\n${routes}` },
          { type: "mrkdwn", text: `*구매 목적*\n${buyPurpose}` },
        ],
      },
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `*🛋 체험 제품*`,
            `• 카테고리: ${cats}`,
            `• 제품: ${products}`,
          ].join("\n"),
        },
      },
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `*⭐ 제품 만족도*`,
            `• 디자인    ${stars(data.design)}`,
            `• 기능·사용성 ${stars(data.usability)}`,
            ``,
            `*🏪 매장 만족도*`,
            `• 직원 친절도 ${stars(data.staff)}`,
            `• 인테리어·청결 ${stars(data.store)}`,
            `• 체험 안내 ${stars(data.guide)}`,
          ].join("\n"),
        },
      },
    ],
  };

  if (hasImprove || hasPraise) {
    payload.blocks.push({ type: "divider" });
    if (hasImprove)
      payload.blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*🛠 아쉬운 점*\n>${data.comment_improve}`,
        },
      });
    if (hasPraise)
      payload.blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*💛 칭찬*\n>${data.comment_praise}` },
      });
  }

  payload.blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `🕐 ${now}` }],
  });

  await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// ─── 입력 검증 ────────────────────────────────────────
const VALID_GENDER = ["male", "female"];
const VALID_AGE = ["10s", "20s", "30s", "40s", "50s", "60plus"];
const VALID_PURPOSE = ["purchase", "experience", "gift", "inquiry"];
const VALID_CATEGORIES = [
  "lower_body",
  "back",
  "neck_shoulder",
  "massage_gun",
  "other",
];
const VALID_PRODUCTS = [
  "lb_pulley_thigh",
  "lb_calf_v3",
  "lb_boots",
  "bk_mat",
  "bk_backpuller",
  "bk_cushion",
  "ns_tapping_v3",
  "ns_neckpuller",
  "ns_thepillow",
  "ns_travel_pillow",
  "mg_minimax",
  "mg_gun_belt",
  "mg_turbofit",
  "ww_pullio",
  "etc_hand",
  "etc_pediplaner",
  "etc_airgua",
];
const VALID_BUY_PURPOSE = [
  "massage_strength",
  "design",
  "price",
  "gift_give",
  "other",
];
const VALID_ROUTE = ["sns", "search", "friend", "pass_by", "existing"];

const isRating = (v) => Number.isInteger(+v) && +v >= 1 && +v <= 5;
const filterArr = (arr, valid) =>
  Array.isArray(arr) ? arr.filter((v) => valid.includes(v)) : [];
const clean = (str, max = 300) =>
  typeof str === "string"
    ? str
        .replace(/<[^>]*>/g, "")
        .trim()
        .slice(0, max)
    : "";

// ══════════════════════════════════════════════════════
//  POST /api/survey
// ══════════════════════════════════════════════════════
app.post("/api/survey", async (req, res) => {
  try {
    const {
      store_id,
      gender,
      age,
      purpose,
      categories,
      products,
      design,
      usability,
      buy_purpose,
      staff,
      store,
      guide,
      route,
      revisit,
      comment_improve,
      comment_praise,
    } = req.body;

    // 필수 검증
    if (!store_id || store_id.length > 50)
      return res.status(400).json({ error: "store_id 오류" });
    if (!VALID_GENDER.includes(gender))
      return res.status(400).json({ error: "성별 오류" });
    if (!VALID_AGE.includes(age))
      return res.status(400).json({ error: "연령대 오류" });
    if (!filterArr(purpose, VALID_PURPOSE).length)
      return res.status(400).json({ error: "방문목적 미선택" });
    if (!filterArr(categories, VALID_CATEGORIES).length)
      return res.status(400).json({ error: "카테고리 미선택" });
    if (!filterArr(products, VALID_PRODUCTS).length)
      return res.status(400).json({ error: "제품 미선택" });
    if (!isRating(design))
      return res.status(400).json({ error: "디자인 별점 오류" });
    if (!isRating(usability))
      return res.status(400).json({ error: "사용성 별점 오류" });
    if (!filterArr(buy_purpose, VALID_BUY_PURPOSE).length)
      return res.status(400).json({ error: "구매목적 미선택" });
    if (!isRating(staff))
      return res.status(400).json({ error: "직원친절도 별점 오류" });
    if (!isRating(store))
      return res.status(400).json({ error: "매장 별점 오류" });
    if (!isRating(guide))
      return res.status(400).json({ error: "체험안내 별점 오류" });
    if (!filterArr(route, VALID_ROUTE).length)
      return res.status(400).json({ error: "방문경로 미선택" });
    if (!isRating(revisit))
      return res.status(400).json({ error: "재방문의향 오류" });

    const safeImprove = clean(comment_improve);
    const safePraise = clean(comment_praise);

    const [result] = await db.execute(
      `INSERT INTO survey_responses
        (store_id, gender, age_group,
         purpose, categories, products,
         rating_design, rating_usability, buy_purpose,
         rating_staff, rating_store, rating_guide, visit_route,
         revisit_score, comment_improve, comment_praise, ip_address)
       VALUES (?,?,?, ?,?,?, ?,?,?, ?,?,?,?, ?,?,?,?)`,
      [
        store_id,
        gender,
        age,
        JSON.stringify(filterArr(purpose, VALID_PURPOSE)),
        JSON.stringify(filterArr(categories, VALID_CATEGORIES)),
        JSON.stringify(filterArr(products, VALID_PRODUCTS)),
        +design,
        +usability,
        JSON.stringify(filterArr(buy_purpose, VALID_BUY_PURPOSE)),
        +staff,
        +store,
        +guide,
        JSON.stringify(filterArr(route, VALID_ROUTE)),
        +revisit,
        safeImprove,
        safePraise,
        req.ip,
      ],
    );

    res.json({ success: true, id: result.insertId });

    // 슬랙 알림 (비동기)
    sendSlackNotification({
      store_id,
      gender,
      age,
      purpose: filterArr(purpose, VALID_PURPOSE),
      categories: filterArr(categories, VALID_CATEGORIES),
      products: filterArr(products, VALID_PRODUCTS),
      design: +design,
      usability: +usability,
      buy_purpose: filterArr(buy_purpose, VALID_BUY_PURPOSE),
      staff: +staff,
      store: +store,
      guide: +guide,
      route: filterArr(route, VALID_ROUTE),
      revisit: +revisit,
      comment_improve: safeImprove,
      comment_praise: safePraise,
    }).catch((e) => console.error("[Slack] 전송 실패:", e));
  } catch (e) {
    console.error("[POST /api/survey]", e);
    res.status(500).json({ error: "서버 오류" });
  }
});

// ══════════════════════════════════════════════════════
//  GET /api/survey/results  — 매장별 통계
// ══════════════════════════════════════════════════════
app.get("/api/survey/results", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        store_id,
        COUNT(*)                           AS total,
        ROUND(AVG(rating_design),    2)    AS avg_design,
        ROUND(AVG(rating_usability), 2)    AS avg_usability,
        ROUND(AVG(rating_staff),     2)    AS avg_staff,
        ROUND(AVG(rating_store),     2)    AS avg_store,
        ROUND(AVG(rating_guide),     2)    AS avg_guide,
        ROUND(AVG(revisit_score),    2)    AS avg_revisit,
        ROUND((AVG(rating_design)+AVG(rating_usability)+
               AVG(rating_staff)+AVG(rating_store)+AVG(rating_guide))/5, 2) AS avg_overall
      FROM survey_responses
      GROUP BY store_id
      ORDER BY total DESC
    `);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "서버 오류" });
  }
});

// GET /api/survey/list  — 전체 목록 (페이징)
app.get("/api/survey/list", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const storeFilter = req.query.store || null;

    const where = storeFilter ? "WHERE store_id = ?" : "";
    const params = storeFilter ? [storeFilter, limit, offset] : [limit, offset];

    const [rows] = await db.execute(
      `SELECT id, store_id, gender, age_group,
              purpose, categories, products,
              rating_design, rating_usability, buy_purpose,
              rating_staff, rating_store, rating_guide, visit_route,
              revisit_score, comment_improve, comment_praise, submitted_at
       FROM survey_responses ${where}
       ORDER BY submitted_at DESC
       LIMIT ? OFFSET ?`,
      params,
    );

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM survey_responses ${where}`,
      storeFilter ? [storeFilter] : [],
    );

    res.json({ rows, total, page, limit });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "서버 오류" });
  }
});

// Health check
app.get("/health", (_, res) =>
  res.json({ status: "ok", time: new Date().toISOString() }),
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Survey API running on :${PORT}`));
