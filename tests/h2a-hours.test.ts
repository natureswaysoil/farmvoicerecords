import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { dailyHours, weeklyHours } from "../src/lib/h2a-hours.ts";
test("paid rest stays paid; only actual unpaid meals reduce the shift", () => {
  assert.equal(dailyHours("8", "30", "45")?.hours, 7.25);
  assert.equal(dailyHours("8", "30", "0")?.hours, 8);
  for (const args of [
    ["8", "0", "480"],
    ["8", "-1", "30"],
    ["8", "0", "2.5"],
    ["8", "450", "60"],
    ["NaN", "0", "0"],
    ["", "0", "0"],
  ])
    assert.equal(dailyHours(...(args as [string, string, string])), null);
});
test("weekly totals split weeks and workers and never deduct breaks twice", () => {
  const row = {
    worker_id: "a",
    work_date: "2026-09-27",
    hours_worked: 7.25,
    shift_minutes: 480,
    paid_break_minutes: 30,
    break_minutes: 45,
    approved_at: null,
  };
  const weeks = weeklyHours([
    row,
    { ...row, work_date: "2026-09-28" },
    { ...row, worker_id: "b" },
  ]);
  assert.equal(weeks.length, 3);
  assert.equal(
    weeks.find((w) => w.week === "2026-09-21" && w.workerId === "a")?.minutes,
    435,
  );
  assert.equal(
    weeklyHours([row, { ...row, work_date: "2026-09-28" }], 0).length,
    1,
  );
  assert.equal(
    weeklyHours([
      {
        worker_id: "a",
        work_date: "2026-09-28",
        hours_worked: 8,
        break_minutes: 30,
      },
    ])[0].minutes,
    480,
  );
});
test("database calculates paid hours, protects approval, and preserves legacy hours", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema private;create table public.h2a_daily_records(id int primary key,break_minutes int not null default 0 check(break_minutes>=0),hours_worked numeric(6,2),approved_at timestamptz);insert into h2a_daily_records values(1,30,8,null);`,
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20260930213305_h2a_breaks_weekly_hours.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      `insert into h2a_daily_records(id,shift_minutes,paid_break_minutes,break_minutes,hours_worked) values(2,480,30,45,999);`,
    );
    assert.equal(
      Number(
        (
          await db.query<{ hours_worked: number }>(
            "select hours_worked from h2a_daily_records where id=2",
          )
        ).rows[0].hours_worked,
      ),
      7.25,
    );
    assert.equal(
      Number(
        (
          await db.query<{ hours_worked: number }>(
            "select hours_worked from h2a_daily_records where id=1",
          )
        ).rows[0].hours_worked,
      ),
      8,
    );
    await assert.rejects(
      db.exec("update h2a_daily_records set break_minutes=480 where id=2"),
    );
    await assert.rejects(
      db.exec("update h2a_daily_records set shift_minutes=null where id=2"),
    );
    await assert.rejects(
      db.exec(
        "update h2a_daily_records set approved_at=now(),break_minutes=0 where id=2",
      ),
    );
    await db.exec("update h2a_daily_records set approved_at=now() where id=2");
    await assert.rejects(
      db.exec("update h2a_daily_records set paid_break_minutes=0 where id=2"),
    );
  } finally {
    await db.close();
  }
});
