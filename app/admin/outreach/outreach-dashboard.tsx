"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";

type Group = {
  id: string;
  name: string;
  url: string;
  audience_type: string;
  region: string | null;
  member_estimate: number | null;
  promotion_policy: string;
  allowed_days: string[];
  priority: number;
  notes: string | null;
  active: boolean;
  last_posted_at: string | null;
  next_post_after: string | null;
};

type Post = {
  id: string;
  group_id: string;
  topic: string;
  post_text: string;
  destination_path: string;
  status: string;
  scheduled_for: string | null;
  posted_at: string | null;
  comments_count: number;
  interested_leads: number;
  trial_signups: number;
  paid_customers: number;
  monthly_revenue: number;
  created_at?: string;
};

const audienceLabels: Record<string, string> = {
  h2a: "H-2A employers",
  farm_management: "Farm management",
  pesticide: "Pesticide applicators",
  bookkeeping: "Bookkeeping / QuickBooks",
  north_carolina: "North Carolina agriculture",
  general_farm: "General farm owners",
};

const destinationByTopic: Record<string, string> = {
  h2a: "/signup",
  pesticide: "/resources/pesticide-record-template",
  crew_time: "/signup",
  quickbooks: "/signup",
  farm_records: "/signup",
  trial: "/signup",
};

const dayOptions = [
  ["sun", "Sun"], ["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"],
  ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"],
];

function defaultCopy(topic: string) {
  const copies: Record<string, string> = {
    h2a:
      "Farmers using H-2A workers: what takes the most office time right now — crew time, payroll prep, housing records, or keeping documents together? FarmVoice Records is built to keep those records in one reviewed farm workspace instead of scattered notebooks and spreadsheets.",
    pesticide:
      "How are you keeping pesticide application records today — paper, spreadsheet, or software? FarmVoice Records lets you capture field work by voice, review the details, and keep the application tied to the correct field, evidence, and inspection history.",
    crew_time:
      "Farm crews do not always need another app on every phone. FarmVoice Records supports crew scheduling, GPS-supported time, approvals, and one-phone crew workflows so field time can move into payroll prep without re-entering everything.",
    quickbooks:
      "If you use QuickBooks for the farm, where does your worker time come from before it reaches payroll? FarmVoice Records is designed to collect approved crew time and prepare individual worker records for QuickBooks instead of rebuilding the week from paper notes.",
    farm_records:
      "Farm paperwork usually gets hardest when the same information has to be written more than once. FarmVoice Records is built around speaking or entering the work once, reviewing it, and reusing that record for fields, crew history, evidence, exports, and follow-up.",
    trial:
      "I am looking for farmers willing to try FarmVoice Records and tell me where it saves time — and where it does not. The trial lets you test the actual farm workflow before deciding whether to keep it.",
  };
  return copies[topic] ?? copies.farm_records;
}

function utmUrl(groupId: string, destinationPath: string, topic: string) {
  const params = new URLSearchParams({
    utm_source: "facebook",
    utm_medium: "group",
    utm_campaign: "facebook_groups",
    utm_content: groupId,
    utm_term: topic,
  });
  return `https://farmvoicerecords.com${destinationPath}?${params.toString()}`;
}

export default function OutreachDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const [groups, setGroups] = useState<Group[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function fetchAllPosts() {
    const pageSize = 1000;
    const rows: Post[] = [];
    for (let start = 0; ; start += pageSize) {
      const { data, error } = await supabase
        .from("outreach_posts")
        .select("*")
        .order("created_at", { ascending: false })
        .range(start, start + pageSize - 1);
      if (error) return { rows: [] as Post[], error };
      const page = (data ?? []) as Post[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    return { rows, error: null };
  }

  async function refresh() {
    setLoading(true);
    const [{ data: groupRows, error: groupError }, postResult] = await Promise.all([
      supabase.from("outreach_groups").select("*").order("priority", { ascending: false }).order("name"),
      fetchAllPosts(),
    ]);

    if (groupError || postResult.error) {
      setMessage(groupError?.message ?? postResult.error?.message ?? "Could not load outreach data.");
    } else {
      setGroups((groupRows ?? []) as Group[]);
      setPosts(postResult.rows);
    }
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function addGroup(formData: FormData) {
    setMessage("");
    const name = String(formData.get("name") ?? "").trim();
    const url = String(formData.get("url") ?? "").trim();
    if (!name || !url) {
      setMessage("Group name and URL are required.");
      return;
    }

    const allowedDays = dayOptions
      .map(([value]) => value)
      .filter((value) => formData.get(`day_${value}`) === "on");

    const { error } = await supabase.from("outreach_groups").insert({
      name,
      url,
      audience_type: String(formData.get("audience_type") ?? "general_farm"),
      region: String(formData.get("region") ?? "").trim() || null,
      promotion_policy: String(formData.get("promotion_policy") ?? "unknown"),
      priority: Number(formData.get("priority") ?? 3),
      allowed_days: allowedDays,
      notes: String(formData.get("notes") ?? "").trim() || null,
    });

    if (error) setMessage(error.message);
    else {
      setMessage("Group added.");
      await refresh();
    }
  }

  async function queuePost(group: Group, topic: string) {
    setMessage("");
    const destination = destinationByTopic[topic] ?? "/signup";
    const copy = defaultCopy(topic);
    const text = `${copy}\n\nLearn more: ${utmUrl(group.id, destination, topic)}`;
    const { error } = await supabase.rpc("queue_outreach_post", {
      p_group_id: group.id,
      p_topic: topic,
      p_post_text: text,
      p_destination_path: destination,
    });
    if (error) setMessage(error.message);
    else {
      setMessage(group.promotion_policy === "approval_required" || group.promotion_policy === "unknown"
        ? "Post prepared and flagged for approval."
        : "Post added to today's queue.");
      await refresh();
    }
  }

  async function markPosted(post: Post) {
    const { error } = await supabase.rpc("mark_outreach_posted", { p_post_id: post.id });
    setMessage(error?.message ?? "Marked posted. This group is now held for 7 days.");
    await refresh();
  }

  async function updateOutcome(post: Post, metric: "comments_count" | "interested_leads" | "trial_signups" | "paid_customers") {
    const { error } = await supabase.rpc("increment_outreach_metric", {
      p_post_id: post.id,
      p_metric: metric,
    });
    if (error) setMessage(error.message);
    await refresh();
  }

  async function updateMrr(post: Post, value: string) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      setMessage("Enter a valid monthly revenue amount.");
      return;
    }
    const { error } = await supabase.rpc("set_outreach_mrr", {
      p_post_id: post.id,
      p_monthly_revenue: amount,
    });
    setMessage(error?.message ?? "Monthly revenue updated.");
    await refresh();
  }

  const now = Date.now();
  const ready = posts.filter((post) => {
    if (post.status !== "ready") return false;
    const group = groups.find((item) => item.id === post.group_id);
    return !group?.next_post_after || new Date(group.next_post_after).getTime() <= now;
  });
  const approval = posts.filter((post) => post.status === "approval_required");
  const posted = posts.filter((post) => post.status === "posted");
  const metrics = posted.reduce(
    (acc, post) => {
      acc.comments += post.comments_count;
      acc.leads += post.interested_leads;
      acc.trials += post.trial_signups;
      acc.customers += post.paid_customers;
      acc.mrr += Number(post.monthly_revenue || 0);
      return acc;
    },
    { comments: 0, leads: 0, trials: 0, customers: 0, mrr: 0 },
  );

  return (
    <main className="container section">
      <div className="kicker">Private admin workspace</div>
      <h1>Facebook outreach</h1>
      <p className="lede">
        Prepare targeted FarmVoice posts, respect each group&apos;s promotion rules,
        open the group for manual posting, and track which communities produce trials and customers.
      </p>
      <p className="small muted">
        Final Facebook posting stays manual. FarmVoice does not impersonate your Facebook account or bypass group rules.
      </p>

      {message ? <div className="card" style={{ marginBottom: 16 }}>{message}</div> : null}

      <section className="home-outcome-strip" aria-label="Outreach performance">
        <div><strong>{posted.length}</strong><span>Posts made</span></div>
        <div><strong>{metrics.leads}</strong><span>Interested farmers</span></div>
        <div><strong>{metrics.trials}</strong><span>Trial signups</span></div>
        <div><strong>{metrics.customers}</strong><span>Paid customers</span></div>
        <div><strong>${metrics.mrr.toFixed(0)}</strong><span>Tracked MRR</span></div>
      </section>

      <section className="section">
        <div className="home-section-head">
          <div><div className="kicker">Today</div><h2>Post queue</h2></div>
          <span className="badge">{ready.length} ready</span>
        </div>
        {loading ? <p>Loading...</p> : ready.length === 0 ? (
          <div className="card"><p className="muted">No posts are ready today.</p></div>
        ) : (
          <div className="home-feature-grid">
            {ready.map((post) => {
              const group = groups.find((item) => item.id === post.group_id);
              if (!group) return null;
              return (
                <article className="card" key={post.id}>
                  <div className="kicker">{audienceLabels[group.audience_type] ?? group.audience_type}</div>
                  <h3>{group.name}</h3>
                  <p style={{ whiteSpace: "pre-wrap" }}>{post.post_text}</p>
                  <p className="small muted">Promotion policy: {group.promotion_policy.replaceAll("_", " ")}</p>
                  <div className="actions">
                    <button className="btn" onClick={() => navigator.clipboard.writeText(post.post_text)}>Copy post</button>
                    <a className="btn secondary" href={group.url} target="_blank" rel="noreferrer">Open Facebook group</a>
                    <button className="btn secondary" onClick={() => void markPosted(post)}>Mark posted</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {approval.length > 0 ? (
        <section className="section">
          <div className="home-section-head">
            <div><div className="kicker">Rule check</div><h2>Approval required</h2></div>
            <span className="badge">{approval.length}</span>
          </div>
          <div className="home-feature-grid">
            {approval.map((post) => {
              const group = groups.find((item) => item.id === post.group_id);
              if (!group) return null;
              return (
                <article className="card" key={post.id}>
                  <h3>{group.name}</h3>
                  <p style={{ whiteSpace: "pre-wrap" }}>{post.post_text}</p>
                  <p className="small muted">
                    This group is marked {group.promotion_policy.replaceAll("_", " ")}. Submit through the group&apos;s approval process before marking it posted.
                  </p>
                  <div className="actions">
                    <button className="btn" onClick={() => navigator.clipboard.writeText(post.post_text)}>Copy post</button>
                    <a className="btn secondary" href={group.url} target="_blank" rel="noreferrer">Open Facebook group</a>
                    <button className="btn secondary" onClick={() => void markPosted(post)}>Mark accepted/posted</button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="home-section-head"><div><div className="kicker">Targets</div><h2>Facebook groups</h2></div></div>
        <div className="home-feature-grid">
          {groups.map((group) => {
            const coolingDown = Boolean(group.next_post_after && new Date(group.next_post_after).getTime() > now);
            const blocked = group.promotion_policy === "no_promotion" || coolingDown;
            return (
              <article className="card" key={group.id}>
                <div className="kicker">{audienceLabels[group.audience_type] ?? group.audience_type}</div>
                <h3>{group.name}</h3>
                <p className="small muted">
                  Priority {group.priority}/5 · {group.promotion_policy.replaceAll("_", " ")}
                  {group.region ? ` · ${group.region}` : ""}
                </p>
                {group.allowed_days?.length ? <p className="small muted">Allowed days: {group.allowed_days.join(", ")}</p> : null}
                {coolingDown ? <p className="small muted">Cooldown until {new Date(group.next_post_after!).toLocaleDateString()}</p> : null}
                {group.notes ? <p>{group.notes}</p> : null}
                <div className="actions">
                  {[
                    ["h2a", "H-2A"], ["pesticide", "Pesticide"], ["crew_time", "Crew time"],
                    ["quickbooks", "QuickBooks"], ["farm_records", "Farm records"], ["trial", "Trial"],
                  ].map(([topic, label]) => (
                    <button
                      key={topic}
                      className="btn secondary"
                      disabled={blocked}
                      onClick={() => void queuePost(group, topic)}
                    >
                      Queue {label}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="card">
          <div className="kicker">Add target</div>
          <h2>Add a Facebook group</h2>
          <form action={addGroup} className="form-grid">
            <label>Group name<input name="name" required /></label>
            <label>Facebook URL<input name="url" type="url" required /></label>
            <label>Audience
              <select name="audience_type" defaultValue="general_farm">
                {Object.entries(audienceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Region<input name="region" placeholder="NC, Southeast, US..." /></label>
            <label>Promotion policy
              <select name="promotion_policy" defaultValue="unknown">
                <option value="unknown">Unknown — review first</option>
                <option value="allowed">Allowed</option>
                <option value="approval_required">Admin approval required</option>
                <option value="specific_days">Specific promotion days</option>
                <option value="no_promotion">No promotion</option>
              </select>
            </label>
            <label>Priority
              <select name="priority" defaultValue="3">
                {[5,4,3,2,1].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <fieldset style={{ gridColumn: "1 / -1" }}>
              <legend>Allowed promotion days (for groups with specific-day rules)</legend>
              <div className="actions">
                {dayOptions.map(([value, label]) => (
                  <label key={value}><input type="checkbox" name={`day_${value}`} /> {label}</label>
                ))}
              </div>
            </fieldset>
            <label style={{ gridColumn: "1 / -1" }}>Notes<textarea name="notes" rows={3} placeholder="Rules, admin notes, best posting days..." /></label>
            <div><button className="btn" type="submit">Add group</button></div>
          </form>
        </div>
      </section>

      <section className="section">
        <div className="home-section-head"><div><div className="kicker">Results</div><h2>Posted outreach</h2></div></div>
        <div className="home-feature-grid">
          {posted.slice(0, 30).map((post) => {
            const group = groups.find((item) => item.id === post.group_id);
            if (!group) return null;
            return (
              <article className="card" key={post.id}>
                <h3>{group.name}</h3>
                <p className="small muted">{post.topic.replaceAll("_", " ")} · {post.posted_at ? new Date(post.posted_at).toLocaleDateString() : ""}</p>
                <p>Comments {post.comments_count} · Leads {post.interested_leads} · Trials {post.trial_signups} · Customers {post.paid_customers}</p>
                <p>MRR ${Number(post.monthly_revenue || 0).toFixed(2)}</p>
                <div className="actions">
                  <button className="btn secondary" onClick={() => void updateOutcome(post, "comments_count")}>+ comment</button>
                  <button className="btn secondary" onClick={() => void updateOutcome(post, "interested_leads")}>+ lead</button>
                  <button className="btn secondary" onClick={() => void updateOutcome(post, "trial_signups")}>+ trial</button>
                  <button className="btn secondary" onClick={() => void updateOutcome(post, "paid_customers")}>+ customer</button>
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void updateMrr(post, String(form.get("mrr") ?? "0"));
                  }}
                  className="actions"
                >
                  <input name="mrr" type="number" min="0" step="0.01" defaultValue={post.monthly_revenue} aria-label="Monthly recurring revenue" />
                  <button className="btn secondary" type="submit">Update MRR</button>
                </form>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
