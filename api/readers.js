import { neon } from "@neondatabase/serverless";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+\d().\-\s]+$/;

function sendJson(response, status, payload) {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.status(status).json(payload);
}

function parseBody(body) {
    if (typeof body === "string") {
        try {
            return JSON.parse(body);
        } catch {
            return null;
        }
    }
    return body;
}

function getValidationError(reader) {
    if (!reader || typeof reader !== "object" || Array.isArray(reader)) {
        return "Please provide your name, email, and phone number.";
    }

    const { name, email, phone } = reader;
    if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
        return "Name is required and must be 100 characters or fewer.";
    }
    if (typeof email !== "string" || email.length > 254 || !emailPattern.test(email)) {
        return "Please provide a valid email address.";
    }
    if (
        typeof phone !== "string" ||
        phone.length > 30 ||
        !phonePattern.test(phone) ||
        phone.replace(/\D/g, "").length < 7
    ) {
        return "Please provide a valid phone number.";
    }

    return null;
}

export default async function handler(request, response) {
    if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        return sendJson(response, 405, { error: "Method not allowed." });
    }

    const reader = parseBody(request.body);
    const validationError = getValidationError(reader);
    if (validationError) {
        return sendJson(response, 400, { error: validationError });
    }

    if (!process.env.DATABASE_URL) {
        return sendJson(response, 503, {
            error: "Reader submissions are not configured yet. Add DATABASE_URL to the Vercel project."
        });
    }

    try {
        const sql = neon(process.env.DATABASE_URL);

        await sql`
            CREATE TABLE IF NOT EXISTS reader_submissions (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT NOT NULL,
                submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `;

        const [savedReader] = await sql`
            INSERT INTO reader_submissions (name, email, phone)
            VALUES (${reader.name.trim()}, ${reader.email.trim()}, ${reader.phone.trim()})
            RETURNING id
        `;

        return sendJson(response, 201, {
            message: "Reader details saved.",
            id: savedReader.id
        });
    } catch (error) {
        console.error("Unable to save reader submission:", error);
        return sendJson(response, 500, {
            error: "Unable to save your details. Please try again."
        });
    }
}
