import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync,readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const frontend=new URL('../../frontend/src/',import.meta.url);
function sources(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{const path=new URL(entry.name+(entry.isDirectory()?'/':''),dir);return entry.isDirectory()?sources(path):/\.(js|jsx)$/.test(entry.name)&&!entry.name.includes('.test.')?[path]:[]})}
test('frontend runtime sources contain no Gemini secret, service-role setting, provider SDK or unsafe HTML/eval sink',()=>{for(const file of sources(frontend)){const text=readFileSync(file,'utf8');assert.doesNotMatch(text,/GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|@google\/genai|generativelanguage\.googleapis\.com|dangerouslySetInnerHTML|\beval\s*\(/,fileURLToPath(file))}});
test('example credentials are blank and server-only settings are absent from frontend examples',()=>{for(const part of ['backend','frontend']){const content=readFileSync(new URL(`../../${part}/.env.example`,import.meta.url),'utf8');for(const line of content.split('\n')){if(/^\s*(?:GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|VITE_SUPABASE_ANON_KEY|VITE_SUPABASE_PUBLISHABLE_KEY)\s*=/.test(line))assert.match(line,/=\s*$/);if(part==='frontend')assert.doesNotMatch(line,/GEMINI_API_KEY|SERVICE_ROLE_KEY/)}}});
