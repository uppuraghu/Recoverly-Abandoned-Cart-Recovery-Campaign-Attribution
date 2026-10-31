const {spawnSync}=require('child_process'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const base=path.resolve(__dirname,'..');
function run(out){const p=spawnSync(process.execPath,[path.join(base,'src','generate.js'),`--out=${out}`],{cwd:base,encoding:'utf8'});if(p.status!==0)throw new Error(p.stderr||p.stdout);}
function digest(dir){const files=[];function walk(d){for(const n of fs.readdirSync(d).sort()){const p=path.join(d,n);if(fs.statSync(p).isDirectory())walk(p);else files.push([path.relative(dir,p),crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]);}}walk(dir);return files;}
const a=path.join(base,'repro_a'),b=path.join(base,'repro_b');fs.rmSync(a,{recursive:true,force:true});fs.rmSync(b,{recursive:true,force:true});run(a);run(b);
const da=digest(a),db=digest(b);const equal=JSON.stringify(da)===JSON.stringify(db);console.log(JSON.stringify({reproducible:equal,file_count_a:da.length,file_count_b:db.length,seed:Number(process.env.SEED||20261022)},null,2));fs.rmSync(a,{recursive:true,force:true});fs.rmSync(b,{recursive:true,force:true});if(!equal)process.exit(1);
