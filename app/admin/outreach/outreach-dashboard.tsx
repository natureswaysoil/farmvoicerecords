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
  h2a: "/h2a",
  pesticide: "/resources/pesticide-record-template",
  crew_time: "/team",
  quickbooks: "/integrations/quickbooks",
  farm_records: "/records",
  trial: "/signup",
};

function defaultCopy(topic: string, groupName: string) {
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
      "I am looking for farmers willing to try FarmVoice Records and tell me where it saves time — and where it does not. The trial is designed so you can test the actual farm workflow before deciding whether to keep it.",
  };
  return `${copies[topic] ?? copies.farm_records}\n\nGroup: ${groupName}`;
}

function utmUrl(groupId: string, destinationPath: string, topic: string) {
  const base = "https://farmvoicerecords.com";
  const params = new URLSearchParams({
    utm_source: "facebook",
    utm_medium: "group",
    utm_campaign: "facebook_groups",
    utm_content: groupId,
    utm_term: topic,
  });
  return `${base}${destinationPath}?${params.toString()}`;
}

export default function OutreachDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const [groups, setGroups] = useState<Group[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const [{ data: groupRows, error: groupError }, { data: postRows, error: postError }] =
      await Promise.all([
        supabase.from("outreach_groups").select("*").order("priority", { ascending: false }).order("name"),
        supabase.from("outreach_posts").select("*").order("created_at", { ascending: false }),
      ]);

    if (groupError || postError) {
      setMessage(groupError?.message ?? postError?.message ?? "Could not load outreach data.");
    } else {
      setGroups((groupRows ?? []) as Group[]);
      setPosts((postRows ?? []) as Post[]);
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

    const { error } = await supabase.from("outreach_groups").insert({
      name,
      url,
      audience_type: String(formData.get("audience_type") ?? "general_farm"),
      region: String(formData.get("region") ?? "").trim() || null,
      promotion_policy: String(formData.get("promotion_policy") ?? "unknown"),
      priority: Number(formData.get("priority") ?? 3),
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
    const destination = destinationByTopic[topic] ?? "/";
    const copy = defaultCopy(topic, group.name);
    const link = utmUrl(group.id, destination, topic);
    const { error } = await supabase.from("outreach_posts").insert({
      group_id: group.id,
      topic,
      post_text: `${copy}\n\nLearn more: ${link}`,
      destination_path: destination,
      status: "ready",
      scheduled_for: new Date().toISOString().slice(0, 10),
    });
    if (error) setMessage(error.message);
    else {
      setMessage("Post added to today's queue.");
      await refresh();
    }
  }

  async function markPosted(post: Post) {
    const postedAt = new Date().toISOString();
    const nextPost = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const [{ error: postError }, { error: groupError }] = await Promise.all([
      supabase
        .from("outreach_posts")
        .update({ status: "posted", posted_at: postedAt })
        .eq("id", post.id),
      supabase
        .from("outreach_groups")
        .update({ last_posted_at: postedAt, next_post_after: nextPost })
        .eq("id", post.group_id),
    ]);

    setMessage(postError?.message ?? groupError?.message ?? "Marked posted. This group will be held for 7 days.");
    await refresh();
  }

  async function updateOutcome(post: Post, field: "comments_count" | "interested_leads" | "trial_signups" | "paid_customers") {
    const current = Number(post[field] ?? 0);
    const { error } = await supabase
      .from("outreach_posts")
      .update({ [field]: current + 1 })
      .eq("id", post.id);
    if (error) setMessage(error.message);
    await refresh();
  }

  const today = new Date().toISOString().slice(0, 10);
  const ready = posts.filter((post) => post.status === "ready" && (!post.scheduled_for || post.scheduled_for <= today));
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
        FarmVoice does not auto-post through your personal Facebook account. Final posting stays manual to reduce account and group-rule risk.
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
          <div>
            <div className="kicker">Today</div>
            <h2>Post queue</h2>
          </div>
          <span className="badge">{ready.length} ready</span>
        </div>

        {loading ? <p>Loading...</p> : ready.length === 0 ? (
          <div className="card"><p className="muted">No posts are queued for today.</p></div>
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

      <section className="section">
        <div className="home-section-head">
          <div>
            <div className="kicker">Targets</div>
            <h2>Facebook groups</h2>
          </div>
        </div>
        <div className="home-feature-grid">
          {groups.map((group) => (
            <article className="card" key={group.id}>
              <div className="kicker">{audienceLabels[group.audience_type] ?? group.audience_type}</div>
              <h3>{group.name}</h3>
              <p className="small muted">
                Priority {group.priority}/5 · {group.promotion_policy.replaceAll("_", " ")}
                {group.region ? ` · ${group.region}` : ""}
              </p>
              {group.notes ? <p>{group.notes}</p> : null}
              <div className="actions">
                {[
                  ["h2a", "H-2A"],
                  ["pesticide", "Pesticide"],
                  ["crew_time", "Crew time"],
                  ["quickbooks", "QuickBooks"],
                  ["farm_records", "Farm records"],
                  ["trial", "Trial"],
                ].map(([topic, label]) => (
                  <button key={topic} className="btn secondary" onClick={() => void queuePost(group, topic)}>
                    Queue {label}
                  </button>
                ))}
              </div>
            </article>
          ))}
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
                <option value="unknown">Unknown</option>
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
                <div className="actions">
                  <button className="btn secondary" onClick={() => void updateOutcome(post, "comments_count")}>+ comment</button>
                  <button className="btn secondary" onClick={() => void updateOutcome(post, "interested_leads")}>+ lead</button>
                  <button className="btn secondary" onClick={() => void updateOutcome(post, "trial_signups")}>+ trial</button>
                  <button className="btn secondary" onClick={() => void updateOutcome(post, "paid_customers")}>+ customer</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
