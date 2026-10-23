import { createServer } from "node:http";
import { appendFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";

const directory = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(directory, "readers.jsonl");
const pageFile = path.join(directory, "first.html");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const maxBodySize = 16 * 1024;

function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });
    response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    for await (const chunk of request) {
        size += chunk.length;
        if (size > maxBodySize) {
            tooLarge = true;
        } else if (!tooLarge) {
            chunks.push(chunk);
        }
    }

    if (tooLarge) {
        const error = new Error("Request body is too large.");
        error.statusCode = 413;
        throw error;
    }

    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        const error = new Error("Request body must be valid JSON.");
        error.statusCode = 400;
        throw error;
    }
}

function validateReader(reader) {
    if (!reader || typeof reader !== "object" || Array.isArray(reader)) {
        return "Please provide your name, email, and phone number.";
    }

    const { name, email, phone } = reader;
    if (
        typeof name !== "string" ||
        name.trim().length < 1 ||
        name.trim().length > 100
    ) {
        return "Name is required and must be 100 characters or fewer.";
    }

    if (
        typeof email !== "string" ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        return "Please provide a valid email address.";
    }

    if (
        typeof phone !== "string" ||
        phone.length > 30 ||
        !/^[+\d().\-\s]+$/.test(phone) ||
        phone.replace(/\D/g, "").length < 7
    ) {
        return "Please provide a valid phone number.";
    }

    return null;
}

const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url, "http://localhost");

    if (request.method === "GET" && (requestUrl.pathname === "/" || requestUrl.pathname === "/first.html")) {
        try {
            const page = await readFile(pageFile);
            response.writeHead(200, {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store"
            });
            response.end(page);
        } catch (error) {
            console.error("Unable to read the page:", error);
            sendJson(response, 500, { error: "Unable to load the page." });
        }
        return;
    }

    if (requestUrl.pathname !== "/api/readers") {
        sendJson(response, 404, { error: "Not found." });
        return;
    }

    if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        sendJson(response, 405, { error: "Method not allowed." });
        return;
    }

    try {
        const reader = await readJsonBody(request);
        const validationError = validateReader(reader);
        if (validationError) {
            sendJson(response, 400, { error: validationError });
            return;
        }

        const record = {
            id: randomUUID(),
            name: reader.name.trim(),
            email: reader.email.trim(),
            phone: reader.phone.trim(),
            submittedAt: new Date().toISOString()
        };

        await appendFile(dataFile, `${JSON.stringify(record)}\n`, { encoding: "utf8" });
        sendJson(response, 201, { message: "Reader details saved.", id: record.id });
    } catch (error) {
        if (error.statusCode) {
            sendJson(response, error.statusCode, { error: error.message });
            return;
        }

        console.error("Unable to save reader details:", error);
        sendJson(response, 500, { error: "Unable to save your details. Please try again." });
    }
});

server.listen(port, host, () => {
    console.log(`Git practice page and API running at http://localhost:${port}`);
    for (const addresses of Object.values(networkInterfaces())) {
        for (const address of addresses || []) {
            if (address.family === "IPv4" && !address.internal) {
                console.log(`On this network: http://${address.address}:${port}`);
            }
        }
    }
});
