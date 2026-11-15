'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'..','android_bridge.js'),'utf8');
const listeners=new Map(),saved=[];
const native={
 addEventListener(name,handler){listeners.set(name,handler);},
 postMessage(raw){
  const msg=JSON.parse(raw);saved.push(msg);
  queueMicrotask(()=>{
   const data=msg.action==='settings.load'?{schemaVersion:1,scanner:{system:'Gammel'}}:
    msg.action==='settings.save'?true:msg.action==='file.export'?true:null;
   listeners.get('message')({data:JSON.stringify({id:msg.id,ok:true,data})});
  });
 }
};
const mock={location:{hostname:'appassets.androidplatform.net'},IndustrialAndroid:native,
 document:{readyState:'loading',addEventListener(){}},setTimeout,clearTimeout};
new Function('window',script)(mock);
(async()=>{
 assert(mock.ICAndroid,'Android origin must install native bridge adapter');
 assert.equal((await mock.ICAndroid.loadSettings()).scanner.system,'Gammel');
 assert.equal(await mock.ICAndroid.saveSettings({schemaVersion:1}),true);
 assert.equal(await mock.ICAndroid.exportFile('mine.csv','A,B\n1,2','text/csv'),true);
 assert.deepEqual(saved.map(x=>x.action),['settings.load','settings.save','file.export']);
 assert.equal(saved[1].settings.schemaVersion,1);
 assert.equal(saved[2].name,'mine.csv');
 const win={location:{hostname:'localhost'},document:mock.document,IndustrialAndroid:native};
 new Function('window',script)(win);
 assert.equal(win.ICAndroid,undefined,'Desktop must not use mobile device storage');
 console.log('PASS Android origin-scoped bridge, settings backup, SAF export and inert desktop path');
})().catch(error=>{console.error(error);process.exitCode=1;});
