import express from "express";
import puppeteer from "puppeteer";
import fs from "fs-extra";
import path from "path";
import { globSync } from "glob";

// -----------------------------------------------------
// RENDER CHROME PATH FINDER — FINAL FIXED VERSION
// -----------------------------------------------------



const chromePath = "chrome/linux-138.0.7204.168/chrome-linux64/chrome";

// -----------------------------------------------------
// EXPRESS SERVER CONFIG
// -----------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;

const COOKIE_FILE = path.resolve("./cookies.json");

// Official Pinterest Interest IDs
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
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function loadCookies(page) {
    if (await fs.pathExists(COOKIE_FILE)) {
        const cookies = await fs.readJson(COOKIE_FILE);
        await page.setCookie(...cookies);

        console.log("🍪 Cookies loaded from file.");
    }
}

async function saveCookies(page) {
    const cookies = await page.cookies();
    await fs.writeJson(COOKIE_FILE, cookies, { spaces: 2 });
    console.log("💾 Cookies saved to file.");
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
        console.log("✅ Already logged in (cookies OK).");
        return;
    }

    console.log("⚠️ Login required. Waiting 60 seconds...");
    await delay(60000);

    await saveCookies(page);
    console.log("🔓 Login saved; continuing.");
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
    console.log("🌐 Scraping:", interestName, "→", url);

    await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: 60000,
    });

    await page.waitForSelector("table tbody tr td", {
        timeout: 30000,
    });

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
// API ENDPOINT
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
    } catch (err) {
        if (browser) await browser.close();

        console.error("❌ ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// -----------------------------------------------------
app.listen(PORT, () => {
    console.log(`🚀 Pinterest Trends API running on port ${PORT}`);
});
// -----------------------------------------------------
