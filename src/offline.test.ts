import {it,expect} from 'vitest';
import {newTrip} from './model';
import {offlineDocument,parseBackup} from './offline';
it('escapes untrusted data in offline documents',()=>{const html=offlineDocument(newTrip({title:'<script>alert(1)</script>',notes:'<img src=x onerror=alert(1)>'}));expect(html).not.toContain('<script>');expect(html).not.toContain('<img');expect(html).toContain('&lt;script&gt;');});
it('includes all days in offline export',()=>{const t=newTrip();t.activities=[{id:'1',title:'Day one',day:1,time:'',address:'',kind:'Passeio',done:false},{id:'2',title:'Day five',day:5,time:'',address:'',kind:'Passeio',done:false}];expect(offlineDocument(t)).toContain('Day one');expect(offlineDocument(t)).toContain('Day five');});
it('restores copies without overwriting existing IDs and rejects executable URLs',()=>{const t=newTrip({reservations:[{id:'x',title:'x',details:'',url:'javascript:alert(1)'}]});const restored=parseBackup(JSON.stringify({version:1,trips:[t]}));expect(restored[0].id).not.toBe(t.id);expect(restored[0].reservations[0].url).toBe('');});
it('rejects unknown backup format',()=>{expect(()=>parseBackup('{"trips":[]}')).toThrow();});
