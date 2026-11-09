import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
// Cache only our app shell. No Supabase responses, photos, maps, or credentials.
function offlineShell():Plugin {
  return {
    name:'atlas-offline-shell', apply:'build',
    generateBundle(_options,bundle){
      const assets=['/','/index.html','/icon.svg','/manifest.webmanifest',...Object.keys(bundle).filter(name=>/\.(js|css)$/.test(name)).map(name=>'/'+name)];
      const version='atlas-shell-'+Object.keys(bundle).filter(name=>name.endsWith('.js')).join('-');
      this.emitFile({type:'asset',fileName:'sw.js',source:`
const CACHE=${JSON.stringify(version)};
const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('atlas-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname==='/sw.js')return;
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('/index.html')));return;}
 if(ASSETS.includes(url.pathname))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});`});
    },
  };
}
export default defineConfig({plugins:[react(),offlineShell()],build:{rollupOptions:{output:{manualChunks:{supabase:['@supabase/supabase-js'],react:['react','react-dom']}}}}});
