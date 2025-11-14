import express from "express";
import puppeteer from "puppeteer";
import fs from "fs-extra";
import path from "path";
import { globSync } from "glob";

// -----------------------------------------------------
// AUTO-DETECT CHROME INSTALL PATH (WORKS ON RENDER)
// -----------------------------------------------------
function findChromePath() {
    const base = "/opt/render/.cache/puppeteer";

    const patterns = [
        "chrome/linux-*/chrome-linux*/chrome",
        "chrome/*/chrome-linux*/chrome",
        "*/chrome-linux*/chrome",
        "**/chrome",
    ];

    for (const pattern of patterns) {
        const fullPattern = path.join(base, pattern);
        const matches = globSync(fullPattern);

        if (matches.length > 0) {
            console.log("🎯 Found Chrome executable:", matches[0]);
            return matches[0];
        }
    }

    console.error("❌ Chrome binary not found inside:", base);
    return null;
}

const chromePath = findChromePath();

// -----------------------------------------------------
// EXPRESS SERVER SETUP
// -----------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;

const COOKIE_FILE = path.resolve("./cookies.json");

// INTEREST IDs (final)
const INTEREST_MAP = {
    "home decor": "935249274030",
    "food and recipes": "918530398158",
    "women's fashion": "948967005229",
    "men's fashion": "924581335376",
    "pets and petcare": "925056443165",
    "diy crafts": "934876475639",
};

// -----------------------------------------------------
// HELPERS
// -----------------------------------------------------
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
        console.log("✅ Already logged in using cookies");
        return;
    }

    console.log("⚠️ Manual login required (only when running locally).");
    console.log("⏳ Waiting 60 seconds for login...");

    await delay(60000);
    await saveCookies(page);
    console.log("🔓 Login saved.");
}

async function scrapeMainTable(page) {
    return await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("table tbody tr"));
        return rows.map((row) => {
            const cells = row.querySelectorAll("td");
            return {
                keyword: cells[0]?.innerText.trim() || "",
                weekly: cells[1]?.innerText.trim() || "",
                monthly: cells[2]?.innerText.trim() || "",
                yearly: cells[3]?.innerText.trim() || "",
            };
        });
    });
}

async function scrapeSecondary(page) {
    return await page.evaluate(() => {
        const insights = Array.from(document.querySelectorAll("h2,h3,h4"))
            .map((el) => el.innerText.trim())
            .filter((t) => t.length > 5);

        return { insights: insights.slice(0, 10) };
    });
}

async function scrapeInterest(page, interestName, interestId) {
    const url = `https://trends.pinterest.com/?l1InterestIds=${interestId}`;
    console.log("🌐 Loading:", url);

    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    await page.waitForSelector("table tbody tr td", { timeout: 25000 });

    const mainTable = await scrapeMainTable(page);
    const secondary = await scrapeSecondary(page);

    return {
        interest: interestName,
        interestId,
        mainTable,
        secondary,
        fetchedAt: new Date().toISOString(),
    };
}

// -----------------------------------------------------
// API ROUTE (MAIN ENTRYPOINT)
// -----------------------------------------------------
app.get("/api/pinterest-trends-final", async (req, res) => {
    let browser;

    try {
        if (!chromePath) {
            throw new Error(
                "Chrome could not be located in Render environment."
            );
        }

        browser = await puppeteer.launch({
            headless: "new",
            executablePath: chromePath,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--disable-features=site-per-process",
                "--disable-web-security",
                "--no-zygote",
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
        console.error("❌ ERROR:", e);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
app.listen(PORT, () => {
    console.log(`🚀 Pinterest Trends API running on port ${PORT}`);
});
// -----------------------------------------------------
