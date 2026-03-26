import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { LogEntry } from "@/lib/types";

// DELETE /api/entries/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const entry = db
      .prepare(`SELECT id FROM log_entries WHERE id = ?`)
      .get(id) as LogEntry | undefined;

    if (!entry) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }

    db.prepare(`DELETE FROM log_entries WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true, data: { id: Number(id) } });
  } catch (err) {
    console.error("[DELETE /api/entries/:id]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// PATCH /api/entries/:id  — update type or content
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: Partial<{ content: string; type: string }> = await req.json();
    const db = getDb();

    const entry = db
      .prepare(`SELECT * FROM log_entries WHERE id = ?`)
      .get(id) as LogEntry | undefined;

    if (!entry) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }

    const newContent = body.content?.trim() ?? entry.content;
    const newType = body.type ?? entry.type;

    if (!["highlight", "lowlight", "blocker"].includes(newType)) {
      return NextResponse.json(
        { ok: false, error: "invalid type" },
        { status: 400 }
      );
    }

    db.prepare(
      `UPDATE log_entries SET content = ?, type = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(newContent, newType, id);

    const updated = db
      .prepare(`SELECT * FROM log_entries WHERE id = ?`)
      .get(id) as LogEntry;

    return NextResponse.json({ ok: true, data: updated });
  } catch (err) {
    console.error("[PATCH /api/entries/:id]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
