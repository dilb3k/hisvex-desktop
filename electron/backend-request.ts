import { allowedBackendUrl } from './trust'
// Trusted renderer -> fixed API hosts only. Main-process fetch avoids file://
// CORS without changing the renderer origin or stranding its offline storage.
export async function requestBackend(input:any,isDev:boolean) {
  if(!input||typeof input.url!=='string'||!allowedBackendUrl(input.url,isDev)) throw Error('Backend URL is not allowed')
  const method=String(input.method??'GET').toUpperCase()
  if(!['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(method)) throw Error('Method is not allowed')
  const headers=new Headers()
  const allowed=new Set(['authorization','content-type','accept','idempotency-key','x-account-id','x-client-protocol'])
  for(const [key,value] of Object.entries(input.headers??{})) if(allowed.has(key.toLowerCase())&&typeof value==='string') headers.set(key,value)
  let body:BodyInit|undefined
  if(input.multipart) {
    body=new FormData();headers.delete('Content-Type')
    let size=0
    for(const part of input.multipart) {
      if(typeof part.name!=='string') throw Error('Invalid form field')
      if(typeof part.value==='string') {size+=Buffer.byteLength(part.value);body.append(part.name,part.value)}
      else if(part.bytes instanceof Uint8Array) {size+=part.bytes.byteLength;body.append(part.name,new Blob([new Uint8Array(part.bytes)],{type:String(part.type??'application/octet-stream')}),String(part.filename??'file'))}
      else throw Error('Invalid upload')
      if(size>20*1024*1024) throw Error('Upload is too large')
    }
  } else if(input.body!==undefined) {
    if(typeof input.body!=='string'||Buffer.byteLength(input.body)>20*1024*1024) throw Error('Invalid request body')
    body=input.body
  }
  const timeout=Math.min(125000,Math.max(1000,Number(input.timeout)||22000))
  const signal=AbortSignal.timeout(timeout)
  try {
    const response=await fetch(input.url,{method,headers,body,signal,redirect:'error'})
    const reader=response.body?.getReader();const chunks:Uint8Array[]=[];let size=0
    if(reader) for(;;) {
      const {done,value}=await reader.read();if(done) break
      size+=value.byteLength;if(size>20*1024*1024){await reader.cancel();throw Error('Response is too large')}
      chunks.push(value)
    }
    return {status:response.status,statusText:response.statusText,headers:Object.fromEntries(response.headers.entries()),data:Buffer.concat(chunks).toString('utf8')}
  } catch {return {networkError:true,timeout:signal.aborted}}
}
