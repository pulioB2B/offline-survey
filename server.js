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
// ★ 실제 자사몰 도메인으로 교체하세요
app.use(
  cors({
    origin: [
      "https://pulio365.cafe24.com",
      "https://puliodays.com",
      "https://m.puliodays.com",
    ],
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
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
});

// ─── 입력 검증 helper ──────────────────────────────────
const VALID_GENDER = ["male", "female", "other", "prefer_not"];
const VALID_AGE = ["10s", "20s", "30s", "40s", "50s", "60plus"];
const VALID_PURPOSE = [
  "purchase",
  "browse",
  "pickup",
  "inquiry",
  "experience",
  "gift",
];
const VALID_PRODUCTS = [
  "skincare_basic",
  "serum_premium",
  "sunscreen",
  "cleansing",
  "bodycare",
  "haircare",
  "other_product",
];

function isValidRating(v) {
  return Number.isInteger(+v) && +v >= 1 && +v <= 5;
}
function isValidScale(v) {
  return Number.isInteger(+v) && +v >= 1 && +v <= 5;
}
function filterArray(arr, allowed) {
  if (!Array.isArray(arr)) return [];
  return arr.filter((v) => allowed.includes(v));
}

// ══════════════════════════════════════════════════════
//  POST /api/survey  —  설문 응답 저장
// ══════════════════════════════════════════════════════
app.post("/api/survey", async (req, res) => {
  try {
    const {
      store_id,
      gender,
      age,
      purpose,
      products,
      product_feel,
      product_info,
      staff,
      store_exp,
      revisit,
      comment_improve,
      comment_praise,
    } = req.body;

    // ── 필수 필드 검증
    if (!store_id || store_id.length > 50)
      return res.status(400).json({ error: "유효하지 않은 store_id" });
    if (!VALID_GENDER.includes(gender))
      return res.status(400).json({ error: "유효하지 않은 성별 값" });
    if (!VALID_AGE.includes(age))
      return res.status(400).json({ error: "유효하지 않은 연령대 값" });
    if (!filterArray(purpose, VALID_PURPOSE).length)
      return res.status(400).json({ error: "방문 목적 미선택" });
    if (!filterArray(products, VALID_PRODUCTS).length)
      return res.status(400).json({ error: "체험 제품 미선택" });
    if (!isValidRating(product_feel))
      return res.status(400).json({ error: "제품 사용성 별점 오류" });
    if (!isValidRating(product_info))
      return res.status(400).json({ error: "제품 안내 별점 오류" });
    if (!isValidRating(staff))
      return res.status(400).json({ error: "직원 응대 별점 오류" });
    if (!isValidRating(store_exp))
      return res.status(400).json({ error: "매장 체험 별점 오류" });
    if (!isValidScale(revisit))
      return res.status(400).json({ error: "재방문 의향 값 오류" });

    // ── 텍스트 sanitize (XSS 방지용 간단 처리)
    const clean = (str, max = 500) =>
      typeof str === "string"
        ? str
            .replace(/<[^>]*>/g, "")
            .trim()
            .slice(0, max)
        : "";

    const safeImprove = clean(comment_improve, 300);
    const safePraise = clean(comment_praise, 300);

    // ── DB 저장
    const [result] = await db.execute(
      `INSERT INTO survey_responses
        (store_id, gender, age_group, purpose, products,
         rating_product_feel, rating_product_info, rating_staff, rating_store,
         revisit_score, comment_improve, comment_praise, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        store_id,
        gender,
        age,
        JSON.stringify(filterArray(purpose, VALID_PURPOSE)),
        JSON.stringify(filterArray(products, VALID_PRODUCTS)),
        +product_feel,
        +product_info,
        +staff,
        +store_exp,
        +revisit,
        safeImprove,
        safePraise,
        req.ip,
      ],
    );

    res.json({ success: true, id: result.insertId });
  } catch (e) {
    console.error("[POST /api/survey] error:", e);
    res.status(500).json({ error: "서버 오류" });
  }
});

// ══════════════════════════════════════════════════════
//  GET /api/survey/results  —  매장별 통계 (관리자용)
// ══════════════════════════════════════════════════════
app.get("/api/survey/results", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        store_id,
        COUNT(*)                        AS total_responses,
        ROUND(AVG(rating_product_feel), 2) AS avg_product_feel,
        ROUND(AVG(rating_product_info), 2) AS avg_product_info,
        ROUND(AVG(rating_staff),        2) AS avg_staff,
        ROUND(AVG(rating_store),        2) AS avg_store,
        ROUND(AVG(revisit_score),       2) AS avg_revisit,
        ROUND(
          (AVG(rating_product_feel) + AVG(rating_product_info) +
           AVG(rating_staff) + AVG(rating_store)) / 4, 2
        )                               AS avg_total
      FROM survey_responses
      GROUP BY store_id
      ORDER BY total_responses DESC
    `);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "서버 오류" });
  }
});

// GET /api/survey/list  —  전체 응답 목록 (페이징)
app.get("/api/survey/list", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const store = req.query.store || null;

    const where = store ? "WHERE store_id = ?" : "";
    const params = store ? [store, limit, offset] : [limit, offset];

    const [rows] = await db.execute(
      `SELECT id, store_id, gender, age_group, purpose, products,
              rating_product_feel, rating_product_info, rating_staff, rating_store,
              revisit_score, comment_improve, comment_praise, submitted_at
       FROM survey_responses ${where}
       ORDER BY submitted_at DESC
       LIMIT ? OFFSET ?`,
      params,
    );

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM survey_responses ${where}`,
      store ? [store] : [],
    );

    res.json({ rows, total, page, limit });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "서버 오류" });
  }
});

// ─── Health check ──────────────────────────────────────
app.get("/health", (_, res) =>
  res.json({ status: "ok", time: new Date().toISOString() }),
);

// ─── Start ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Survey API running on :${PORT}`));
