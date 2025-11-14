import express from "express";
import puppeteer from "puppeteer";
import fs from "fs-extra";
import path from "path";

const app = express();
const PORT = 3000;

const COOKIE_FILE = path.resolve("./cookies.json");
const MAX_MAIN_ROWS = 20;
const MAX_SECONDARY = 12;

// --- Your final interest ID map (stable forever) ---
const INTEREST_MAP = {
    "home decor": "935249274030",
    "food and recipes": "918530398158",
    "women's fashion": "948967005229",
    "men's fashion": "924581335376",
    "pets and petcare": "925056443165",
    "diy crafts": "934876475639",
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadCookies(page) {
    if (await fs.pathExists(COOKIE_FILE)) {
        const cookies = await fs.readJson(COOKIE_FILE);
        await page.setCookie(...cookies);
        console.log("🍪 Cookies loaded.");
    }
}

async function saveCookies(page) {
    const cookies = await page.cookies();
    await fs.writeJson(COOKIE_FILE, cookies, { spaces: 2 });
    console.log("💾 Cookies saved.");
}

async function ensureLogin(page) {
    await page.goto("https://www.pinterest.com/login/", {
        waitUntil: "networkidle2",
        timeout: 60000,
    });

    const needLogin = await page.evaluate(
        () => !!document.querySelector('input[type="password"]')
    );

    if (!needLogin) {
        console.log("✅ Already logged in via cookies");
        return;
    }

    console.log("⚠️ LOGIN REQUIRED — Please login manually now.");
    console.log("⏳ Waiting 60 seconds...");

    await delay(60000);

    await saveCookies(page);
    console.log("🔓 Login saved. Next runs will be fully automatic.");
}

async function scrapeMainTable(page) {
    return await page.evaluate((MAX_MAIN_ROWS) => {
        const rows = Array.from(document.querySelectorAll("table tbody tr"));
        return rows.slice(0, MAX_MAIN_ROWS).map((row) => {
            const cells = row.querySelectorAll("td");
            return {
                keyword: cells[0]?.innerText.trim() || "",
                weekly: cells[1]?.innerText.trim() || "",
                monthly: cells[2]?.innerText.trim() || "",
                yearly: cells[3]?.innerText.trim() || "",
            };
        });
    }, MAX_MAIN_ROWS);
}

async function scrapeSecondaryLists(page) {
    return await page.evaluate((MAX_SECONDARY) => {
        const result = [];

        // Common growing trends lists
        const selectors = [
            ".trend-grid li",
            ".TrendListItem",
            ".trends-grid li",
            ".growing-trends li",
            ".trend-card",
            ".trendTile",
        ];

        for (const selector of selectors) {
            const items = Array.from(document.querySelectorAll(selector))
                .map((el) => (el.innerText || "").trim().split("\n")[0])
                .filter(Boolean);

            if (items.length) {
                result.push({
                    source: selector,
                    items: items.slice(0, MAX_SECONDARY),
                });
                break;
            }
        }

        // Insight cards / H2/H3 blocks
        const insights = Array.from(document.querySelectorAll("h2,h3,h4"))
            .map((e) => e.innerText.trim())
            .filter((t) => t.length > 3)
            .slice(0, 8);

        if (insights.length) {
            result.push({
                source: "insights",
                items: insights.map((t) => ({ title: t })),
            });
        }

        return result;
    }, MAX_SECONDARY);
}

async function scrapeInterest(page, interestName, interestId) {
    console.log(`\n🔎 Scraping: ${interestName}`);

    const url = `https://trends.pinterest.com/?l1InterestIds=${interestId}`;

    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // Wait for main table to appear
    await page.waitForSelector("table tbody tr td", { timeout: 20000 });

    const mainTable = await scrapeMainTable(page);
    const secondary = await scrapeSecondaryLists(page);

    return {
        interest: interestName,
        interestId,
        mainTable,
        secondary,
        fetchedAt: new Date().toISOString(),
    };
}

// --- API route ---
app.get("/api/pinterest-trends-final", async (req, res) => {
    let browser;

    try {
        browser = await puppeteer.launch({
            headless: "new",
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-gpu",
                "--disable-dev-shm-usage",
            ],
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1400, height: 900 });

        await loadCookies(page);
        await ensureLogin(page);

        const results = [];

        for (const [name, id] of Object.entries(INTEREST_MAP)) {
            const data = await scrapeInterest(page, name, id);
            results.push(data);
        }

        await browser.close();
        res.json({
            fetchedAt: new Date().toISOString(),
            total: results.length,
            results,
        });
    } catch (e) {
        if (browser) await browser.close();
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () =>
    console.log(
        `🚀 FINAL Pinterest Trends API ready at http://localhost:${PORT}/api/pinterest-trends-final`
    )
);
