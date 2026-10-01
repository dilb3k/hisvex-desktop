import axios,{AxiosError,type AxiosAdapter} from 'axios'
export const nativeBackendAdapter:AxiosAdapter=async config=>{
  const headers:Record<string,string>={}
  for(const [name,value] of Object.entries(config.headers.toJSON())) if(value!==undefined&&value!==null) headers[name]=String(value)
  const request:any={url:axios.getUri(config),method:config.method,headers,timeout:config.timeout}
  if(typeof FormData!=='undefined'&&config.data instanceof FormData) {
    request.multipart=[]
    for(const [name,value] of config.data.entries()) request.multipart.push(typeof value==='string'?{name,value}:{name,bytes:new Uint8Array(await value.arrayBuffer()),filename:value.name,type:value.type})
  } else if(config.data!==undefined) request.body=typeof config.data==='string'?config.data:JSON.stringify(config.data)
  const result=await window.electronAPI!.requestBackend(request)
  if(result.networkError) throw new AxiosError(result.timeout?'Request timed out':'Backend response unavailable',result.timeout?'ECONNABORTED':'ERR_NETWORK',config)
  const response={...result,config,data:result.data,headers:result.headers??{},status:result.status!,statusText:result.statusText!}
  if(config.validateStatus&&!config.validateStatus(response.status)) throw new AxiosError(`HTTP ${response.status}`,response.status>=500?'ERR_BAD_RESPONSE':'ERR_BAD_REQUEST',config,undefined,response)
  return response
}
