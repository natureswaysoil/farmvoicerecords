"use client";
import { FormEvent,useState } from "react";
export default function JoinPage(){
 const [code,setCode]=useState(""); const [message,setMessage]=useState("");
 function submit(e:FormEvent){e.preventDefault();const n=code.trim().toUpperCase();if(!/^[A-Z0-9]{6,10}$/.test(n)){setMessage("Enter the complete 6- to 10-character farm join code.");return;}setMessage(`Code ${n} is structurally valid. Connect the membership backend to complete the join.`);}
 return <main className="container section"><div className="card" style={{maxWidth:620,margin:"20px auto"}}><div className="kicker">Join a farm team</div><h2>Enter the full worker join code</h2><p className="muted">New FarmVoice codes use 10 characters; older six-character codes remain accepted. Do not shorten the code.</p><form className="form" onSubmit={submit}><div className="field"><label htmlFor="code">Farm join code</label><input id="code" autoCapitalize="characters" value={code} onChange={e=>setCode(e.target.value)} placeholder="4CEC570164"/></div><button className="btn" type="submit">Join farm</button></form>{message&&<p className="notice" style={{marginTop:14}}>{message}</p>}</div></main>;
}
