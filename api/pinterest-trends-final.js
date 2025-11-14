// =============================
// pinterest-trends-final.js
// =============================

import express from "express";
import cors from "cors";
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { globSync } from "glob";

const app = express();
app.use(cors());

// ------------------------------
// 1️⃣ Detect Chrome in Render
// ------------------------------
function findChromePath() {
    const base = "/opt/render/.cache/puppeteer";

    console.log("🔍 Searching Chrome in:", base);

    // Match: /opt/render/.cache/puppeteer/chrome/linux-XXX/chrome-linux64/chrome
    const matches = globSync(path.join(base, "**/chrome"));

    if (matches.length > 0) {
        console.log("🎯 FOUND Chrome:", matches[0]);
        return matches[0];
    }

    console.error("❌ Chrome NOT FOUND in Render environment");
    return null;
}

// ------------------------------
// 2️⃣ Load Cookies (Login Only Once)
// ------------------------------
function loadCookies() {
    try {
        const file = path.join(process.cwd(), "cookies.json");
        if (fs.existsSync(file)) {
            console.log("🍪 Cookies loaded");
            return JSON.parse(fs.readFileSync(file, "utf8"));
        }
        console.log("⚠ No cookies.json found");
        return [];
    } catch (err) {
        console.error("❌ Error loading cookies:", err);
        return [];
    }
}

// ------------------------------
// 3️⃣ Launch Puppeteer (Render Safe)
// ------------------------------
async function launchBrowser() {
    const executablePath = findChromePath();

    if (!executablePath) {
        throw new Error("Chrome could not be located in Render environment.");
    }

    console.log("🚀 Launching Puppeteer…");

    return await puppeteer.launch({
        executablePath,
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-zygote",
            "--single-process",
        ],
    });
}

// ------------------------------
// 4️⃣ Scraping Logic
// ------------------------------
async function scrapeInterest(browser, url, label) {
    console.log(`\n==============================`);
    console.log(`🔎 SCRAPING INTEREST: ${label}`);
    console.log(`==============================`);

    const page = await browser.newPage();

    // Apply cookies
    const cookies = loadCookies();
    if (cookies.length > 0) {
        await page.setCookie(...cookies);
        console.log("🍪 Cookies applied");
    }

    await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });

    // Wait for main table
    await page.waitForSelector("table tbody tr", { timeout: 30000 });

    // Extract rows
    const data = await page.$$eval("table tbody tr", (rows) =>
        rows.map((r) => {
            const tds = r.querySelectorAll("td");
            return {
                keyword: tds[0]?.innerText.trim(),
                weekly: tds[1]?.innerText.trim(),
                monthly: tds[2]?.innerText.trim(),
                yearly: tds[3]?.innerText.trim(),
            };
        })
    );

    return data;
}

// ------------------------------
// 5️⃣ API ENDPOINT (MAIN)
// ------------------------------
app.get("/api/pinterest-trends-final", async (req, res) => {
    try {
        const browser = await launchBrowser();

        const interests = [
            {
                name: "home decor",
                id: "935249274030",
            },
            {
                name: "food and recipes",
                id: "918530398158",
            },
            {
                name: "women's fashion",
                id: "948967005229",
            },
            {
                name: "men's fashion",
                id: "924581335376",
            },
            {
                name: "pets and petcare",
                id: "925056443165",
            },
            {
                name: "diy crafts",
                id: "934876475639",
            },
        ];

        const results = [];

        for (const item of interests) {
            const url = `https://trends.pinterest.com/?l1InterestIds=${item.id}`;
            const table = await scrapeInterest(browser, url, item.name);

            results.push({
                interest: item.name,
                interestId: item.id,
                mainTable: table,
                fetchedAt: new Date().toISOString(),
            });
        }

        await browser.close();
        res.json({
            fetchedAt: new Date().toISOString(),
            total: results.length,
            results,
        });
    } catch (err) {
        console.error("❌ ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ------------------------------
// 6️⃣ Start Server
// ------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
    console.log(`\n🚀 Pinterest Trends API running on port ${PORT}`)
);
