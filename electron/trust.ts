import path from 'node:path'
import { pathToFileURL } from 'node:url'
export function trustedRendererUrl(value:string,isDev:boolean) {
  try {
    const url=new URL(value)
    if(isDev && url.origin==='http://localhost:5173') return true
    url.search='';url.hash=''
    return url.href===pathToFileURL(path.resolve(__dirname,'../build/renderer/index.html')).href
  } catch {return false}
}
export function allowedBackendUrl(value:string,isDev:boolean) {
  try {
    const url=new URL(value)
    if(url.username||url.password||!url.pathname.startsWith('/api/')) return false
    const origins=['https://hisvex-api-production.up.railway.app','https://hisvex-api.onrender.com']
    if(isDev) origins.push('http://localhost:4000','http://localhost:5000','http://127.0.0.1:4000','http://127.0.0.1:5000')
    return origins.includes(url.origin)
  } catch {return false}
}
