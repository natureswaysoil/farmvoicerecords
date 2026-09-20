"use client";
import { FormEvent, useState } from "react";
export default function LoginPage() {
  const [email,setEmail]=useState(""); const [sent,setSent]=useState(false);
  function submit(e:FormEvent){e.preventDefault();setSent(true);}
  return <main className="container section"><div className="card" style={{maxWidth:560,margin:"20px auto"}}><div className="kicker">Sign in</div><h2>Email sign-in</h2><p className="muted">The production FarmVoice service uses passwordless email links. This reconstruction keeps the workflow boundary ready for a backend adapter.</p><form className="form" onSubmit={submit}><div className="field"><label htmlFor="email">Email address</label><input id="email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></div><button className="btn" type="submit">Email me a sign-in link</button></form>{sent&&<p className="notice" style={{marginTop:14}}>Demo mode: sign-in request captured for <strong>{email}</strong>. Connect the auth adapter before production use.</p>}</div></main>;
}
