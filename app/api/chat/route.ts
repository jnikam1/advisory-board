import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const maxDuration = 60;

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

interface ChatRequest {
  persona: string;
  prompt: string;
  maxTokens?: number;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured. Set it in your environment variables." },
      { status: 500 }
    );
  }

  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { persona, prompt, maxTokens = 1024 } = body;
  if (!persona || !prompt) {
    return NextResponse.json(
      { error: "Missing persona or prompt" },
      { status: 400 }
    );
  }

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  try {
    const apiResponse = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: persona,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const rawText = await apiResponse.text();

    if (!apiResponse.ok) {
      return NextResponse.json(
        {
          error: `Anthropic API error (${apiResponse.status}): ${rawText.slice(0, 300)}`,
        },
        { status: apiResponse.status }
      );
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        { error: "Could not parse API response" },
        { status: 500 }
      );
    }

    const text = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Empty response from API" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      text,
      usage: data.usage,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Network error: ${e.message || "Unknown"}` },
      { status: 500 }
    );
  }
}
