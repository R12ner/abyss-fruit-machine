import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';

const root=resolve('dist');
const port=Number(process.env.PORT)||8000;
const types={
  '.html':'text/html; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.js':'application/javascript; charset=utf-8',
  '.mjs':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.svg':'image/svg+xml',
  '.webp':'image/webp'
};

createServer(async(request,response)=>{
  try{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    let file=resolve(root,`.${pathname}`);
    if(file!==root&&!file.startsWith(root+sep)){
      response.writeHead(403,{'Content-Type':'text/plain; charset=utf-8'}).end('Forbidden');return;
    }
    if((await stat(file)).isDirectory())file=resolve(file,'index.html');
    const content=await readFile(file);
    response.writeHead(200,{'Content-Type':types[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-cache'});
    if(request.method==='HEAD')response.end();else response.end(content);
  }catch(error){
    response.writeHead(error?.code==='ENOENT'?404:500,{'Content-Type':'text/plain; charset=utf-8'}).end(error?.code==='ENOENT'?'Not Found':'Server Error');
  }
}).listen(port,'127.0.0.1',()=>console.log(`ABYSS ARCADE: http://127.0.0.1:${port}`));
