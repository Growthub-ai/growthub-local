#!/usr/bin/env node
// Editable vector listing art. These are labeled product illustrations, never QA receipts.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const out=fileURLToPath(new URL('../plugins/growthub-gtm/assets/',import.meta.url));
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const t=(x,y,s,size=23,color='#777',weight=400,extra='')=>`<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" fill="${color}" font-weight="${weight}" ${extra}>${esc(s)}</text>`;
const r=(x,y,w,h,fill='#fff',rx=16,stroke='none')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>`;
const line=(x,y,x2,y2,color='#e5e7eb')=>`<path d="M${x} ${y}H${x2}" stroke="${color}"/>`;
const person=(x,y,color='#3c82ff',shape='circle')=>`<g transform="translate(${x},${y})">${r(0,0,28,28,color,shape==='circle'?14:7)}<path d="M12 7l1 5m6-5l1 5" stroke="#14233c" stroke-width="2.5" stroke-linecap="round"/></g>`;
const tick=(x,y,color='#a3a3a3')=>`<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="${color}" stroke-width="1.5"/><path d="M${x-4} ${y}l3 3 5-6" fill="none" stroke="${color}" stroke-width="1.6"/>`;
const chip=(x,y,w,label,color='#3c82ff')=>r(x,y,w,43,'#fff',12,'#e3e6eb')+`<circle cx="${x+20}" cy="${y+21}" r="5" fill="${color}"/>`+t(x+35,y+28,label,18,'#535861');
const arrow=(x,y)=>`<path d="M${x} ${y}h31m-7-6 7 6-7 6" fill="none" stroke="#b6bec9" stroke-width="2" stroke-linecap="round"/>`;
const shell=(headline,sub,name,body,advantage)=>`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1000" viewBox="0 0 1200 1000" role="img" aria-label="${esc(headline)} — illustrative Growthub workflow"><defs><pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.3" fill="#e5e9ed"/></pattern><filter id="shadow" x="-20%" y="-20%" width="140%" height="155%"><feDropShadow dx="0" dy="15" stdDeviation="15" flood-color="#17233c" flood-opacity=".11"/></filter></defs>${r(0,0,1200,1000,'white',0)}${t(600,77,headline,45,'#24262b',500,'text-anchor="middle" letter-spacing="-1.4"')}${t(600,122,sub,23,'#7a7d83',400,'text-anchor="middle"')}${r(32,169,1136,774,'#fafbfc',28,'#e0e4e8')}${r(33,170,1134,772,'url(#dots)',28)}<g filter="url(#shadow)">${r(108,220,984,623,'white',25,'#e0e4e8')}</g>${line(109,286,1091,286)}<g fill="#e0e4e8"><circle cx="142" cy="253" r="6"/><circle cx="165" cy="253" r="6"/><circle cx="188" cy="253" r="6"/></g><text x="222" y="261" font-family="monospace" font-size="22" fill="#25272b">${esc(name)}</text>${body}${t(600,899,advantage,22,'#67717e',400,'text-anchor="middle"')}${t(600,977,'Illustrative workflow · requires applicable connections, permissions and execution availability',16,'#9298a1',400,'text-anchor="middle"')}</svg>`;
let body=r(306,313,737,90,'#f5f5f5',25)+t(333,351,'Prepare a launch brief for our new offer.',24,'#282828')+t(333,383,'Use the approved brand direction. Save it for review.',24,'#282828');
body+=chip(156,427,222,'Approved Brand Kit')+chip(392,427,216,'Business knowledge','#13b7a6')+chip(622,427,220,'Connected tools','#8654ff');
body+=person(157,497)+t(200,519,'Strategist',22)+`<path d="M170 538v64" stroke="#dedfe2"/>`;
body+=t(201,557,'Uses your saved method and the client’s context',22)+tick(1021,550)+t(201,599,'Prepares a brief you can inspect and continue',22)+tick(1021,592);
body+=r(156,632,887,112,'#fafafa',15,'#e5e7eb')+r(179,652,56,70,'white',6,'#dce2e9')+line(190,669,224,669,'#a4b5d1')+line(190,680,221,680)+line(190,691,225,691)+line(190,702,217,702)+t(254,668,'Launch brief',24,'#282828',500)+t(254,700,'Audience · positioning · creative direction · next steps',20,'#858990')+t(254,727,'Saved in your Character conversation',17,'#989da5');
body+=r(156,770,887,47,'#ecfdf5',13)+tick(181,794,'#0c836a')+t(202,802,'A useful result, with the context to keep moving.',21,'#087b64');
writeFileSync(out+'use-case-team.svg',shell('A brief in. Useful work out.','Your saved expertise, brand context and connected tools — working together.','Strategist · Growthub',body,'Give direction once. Keep the method and result connected.'));
body=r(151,312,277,54,'white',12,'#e1e4e8')+t(171,347,'Search your projects',20,'#9b9fa5');
body+=r(151,389,277,67,'#eef5ff',13)+r(167,405,35,35,'#d8eeee',9)+t(173,429,'AC',17,'#009a91',600)+t(216,430,'Acme',23,'#282828')+t(171,505,'Northstar',23,'#60656d')+t(171,563,'Cedar & Co.',23,'#60656d')+t(171,621,'Fieldwork',23,'#60656d');
body+=r(458,312,585,433,'white',16,'#e1e4e8')+t(483,350,'Acme · launch brief',24,'#282828',500)+line(459,371,1042,371);
body+=chip(483,391,207,'Brand voice + assets')+chip(704,391,220,'Saved instructions','#8654ff');
body+=r(483,458,534,76,'#f5f5f5',20)+t(505,490,'Pick up the launch brief.',23,'#282828')+t(505,519,'Keep this client’s voice and direction.',22,'#282828');
[['Strategist','Launch positioning','#3c82ff'],['Writer','Launch posts','#ff7c18'],['Researcher','Competitor references','#13b7a6']].forEach((v,i)=>{const y=559+i*51;body+=person(485,y,v[2],i?'square':'circle')+t(530,y+21,v[0],21,'#42464d')+t(735,y+21,v[1],19,'#979ca4')});
body+=r(151,770,892,47,'#f5f7fa',13)+t(177,801,'Your Claude or Codex. Your business context, close to the work.',21,'#67717e');
writeFileSync(out+'use-case-context.svg',shell('More clients. Less starting over.','Keep each client’s brand, knowledge and saved team with their work.','Projects · Growthub',body,'Move between clients without rebuilding the brief.'));
body=r(306,313,737,90,'#f5f5f5',25)+t(333,351,'This weekly brief works. Let’s repeat it.',24,'#282828')+t(333,383,'Keep the accepted direction and review the setup.',24,'#282828');
body+=person(157,432,'#8654ff','square')+t(200,454,'Growth Operator',22);
const cards=[{x:156,title:'Accepted result',sub:'The brief you reviewed',color:'#3c82ff',tag:'REUSE'},{x:466,title:'Growthub Routine',sub:'Schedule + approvals',color:'#8654ff',tag:'CONFIGURE'},{x:776,title:'Saved outcomes',sub:'Ready for the next review',color:'#13b7a6',tag:'REPEAT'}];
for(const c of cards){body+=r(c.x,489,267,224,'#fafbfc',15,'#e3e6eb')+t(c.x+20,524,c.tag,14,c.color,600,'letter-spacing="1.8"')+t(c.x+20,561,c.title,23,'#33373e',500)+t(c.x+20,589,c.sub,17,'#969ba3');if(c.tag==='CONFIGURE'){body+=r(c.x+20,615,226,60,'white',10,'#e6e9ee')+t(c.x+36,640,'Weekly brief',18,'#696e78')+t(c.x+36,662,'Set up in Growthub',16,'#a0a5ad');}else{body+=r(c.x+22,614,65,65,'white',7,'#dce2e9')+line(c.x+33,633,c.x+75,633,'#b7c6dd')+line(c.x+33,645,c.x+70,645)+line(c.x+33,657,c.x+74,657);if(c.tag==='REPEAT')body+=r(c.x+100,614,65,65,'white',7,'#dce2e9')+r(c.x+178,614,65,65,'white',7,'#dce2e9');}}
body+=arrow(428,600)+arrow(738,600)+r(156,770,887,47,'#ecfdf5',13)+t(180,801,'Keep accepted work moving through your existing Routine controls.',21,'#087b64');
writeFileSync(out+'use-case-repeat.svg',shell('Make good work repeatable.','Carry an accepted result into a workflow your business can keep using.','Growth Operator · weekly brief',body,'The saved result becomes the starting point for the next job.'));
console.log('Generated three transformation-led product illustrations.');
