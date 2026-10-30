import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {logBillingFailure} from '../src/lib/billing/diagnostics.ts';
async function moduleAt(path:string,require:(path:string)=>unknown,extra:Record<string,unknown>={}){
 const exports:Record<string,any>={};
 const context=vm.createContext({exports,require,Date,crypto,Response,Request,...extra});
 const source=await readFile(new URL(`../${path}`,import.meta.url),'utf8');
 vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 return exports;
}
test('billing diagnostics retain event/request correlation without raw secrets, bodies or personal data',()=>{
 const original=console.error,lines:string[]=[];console.error=(value:string)=>lines.push(value);
 try{logBillingFailure('webhook','persist_access',{code:'23514',type:'StripeAPIError',requestId:'req_123',statusCode:500,message:'secret',raw:{email:'private@example.test',token:'secret'},farmId:'private'}, {id:'evt_123',type:'invoice.paid'});}
 finally{console.error=original;}
 const entry=JSON.parse(lines[0]);assert.equal(entry.eventId,'evt_123');assert.equal(entry.requestId,'req_123');assert.equal(entry.code,'23514');
 assert.ok(!lines[0].includes('secret'));assert.ok(!lines[0].includes('private'));
});
test('notification worker refuses missing/incorrect secrets before claims or email sending',async()=>{
 for(const authorized of [false,null]){
  let handler:any,claims=0,sends=0;
  const db={rpc:async(name:string)=>{if(name==='notification_worker_authorize')return{data:authorized,error:null};claims++;throw new Error('unexpected claim');}};
  await moduleAt('supabase/functions/notification-worker/index.ts',path=>path.includes('supabase-js')?{createClient:()=>db}:{},{Deno:{env:{get:()=> 'test'},serve:(fn:any)=>handler=fn},fetch:async()=>{sends++;throw new Error('unexpected send');}});
  const response=await handler(new Request('https://worker.test',{method:'POST'}));assert.equal(response.status,401);assert.equal(claims,0);assert.equal(sends,0);
 }
});
function mockDeere(options:{claimed?:boolean;current?:any;saved?:any;providerError?:boolean}={}){
 const old={access_token_expires_at:'2020-01-01',access_token_ciphertext:'old-access',refresh_token_ciphertext:'old-refresh',scopes:[]};
 let providerCalls=0;const operations:any[]=[];
 const supabase={auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},rpc:async()=>({data:options.claimed!==false,error:null}),from(){let mode='read';const filters:Record<string,unknown>={},updates:unknown={};return{
  select(){return this;},eq(k:string,v:unknown){filters[k]=v;return this;},update(value:unknown){mode='update';Object.assign(updates,value);return this;},
  async maybeSingle(){operations.push({mode,filters,updates});return{data:mode==='update'?(Object.hasOwn(options,'saved')?options.saved:{...old,...updates}):filters.refresh_lock_token?(options.current??old):old,error:null};},
  then(resolve:any){operations.push({mode,filters,updates});return Promise.resolve({error:null}).then(resolve);},
 };}};
 return{supabase,operations,providerCalls:()=>providerCalls,provider:async()=>{providerCalls++;if(options.providerError)throw new Error('provider failed');return{access_token:'new-access',refresh_token:'new-refresh',expires_in:3600};}};
}
async function deere(mock:ReturnType<typeof mockDeere>){return moduleAt('src/lib/john-deere-server.ts',path=>{
 if(path.includes('supabase/server'))return{createClient:async()=>mock.supabase};
 if(path.includes('farm-owner-server'))return{requireOwnerFarmId:async()=> 'farm'};
 return{decryptJohnDeereSecret:(s:string)=>s,encryptJohnDeereSecret:(s:string)=>s,johnDeereTokenExpiry:()=>new Date(Date.now()+3600000).toISOString(),refreshJohnDeereAccessToken:mock.provider};
});}
test('Deere competitor cannot refresh and stale-lock claimant rereads the winning token',async()=>{
 const competitor=mockDeere({claimed:false}),module=await deere(competitor);await assert.rejects(module.getValidJohnDeereAccessToken('farm'),/in progress/);assert.equal(competitor.providerCalls(),0);
 const current={access_token_expires_at:new Date(Date.now()+3600000).toISOString(),access_token_ciphertext:'winner',refresh_token_ciphertext:'rotated'};
 const next=mockDeere({current}),nextModule=await deere(next);assert.equal((await nextModule.getValidJohnDeereAccessToken('farm')).accessToken,'winner');assert.equal(next.providerCalls(),0);
 assert.ok(next.operations.at(-1).filters.refresh_lock_token);
});
test('Deere refresh conditionally saves/releases and cannot resurrect a disconnected/reconnected row',async()=>{
 const mock=mockDeere(),module=await deere(mock);assert.equal((await module.getValidJohnDeereAccessToken('farm')).accessToken,'new-access');assert.equal(mock.providerCalls(),1);
 const save=mock.operations.find(x=>x.mode==='update'&&x.updates.access_token_ciphertext);assert.equal(save.filters.refresh_token_ciphertext,'old-refresh');assert.ok(save.filters.refresh_lock_token);
 const lost=mockDeere({saved:null}),lostModule=await deere(lost);await assert.rejects(lostModule.getValidJohnDeereAccessToken('farm'),/changed during refresh/);assert.ok(lost.operations.at(-1).filters.refresh_lock_token);
 const failed=mockDeere({providerError:true}),failedModule=await deere(failed);await assert.rejects(failedModule.getValidJohnDeereAccessToken('farm'),/provider failed/);assert.equal(failed.operations.at(-1).updates.refresh_lock_token,null);
});
