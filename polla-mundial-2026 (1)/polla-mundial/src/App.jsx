import { useState, useEffect, useMemo } from "react";

// ── DATOS ─────────────────────────────────────────────────────
const GROUPS = {
  A: ['México','Sudáfrica','Corea del Sur','Rep. Checa'],
  B: ['Canadá','Bosnia y Herz.','Catar','Suiza'],
  C: ['Brasil','Marruecos','Haití','Escocia'],
  D: ['EE.UU.','Paraguay','Australia','Turquía'],
  E: ['Alemania','Curazao','Costa de Marfil','Ecuador'],
  F: ['P. Bajos','Japón','Suecia','Túnez'],
  G: ['Bélgica','Egipto','Irán','Nueva Zelanda'],
  H: ['España','Cabo Verde','Arabia Saudita','Uruguay'],
  I: ['Francia','Senegal','Noruega','Irak'],
  J: ['Argentina','Argelia','Austria','Jordania'],
  K: ['Portugal','Colombia','R.D. Congo','Uzbekistán'],
  L: ['Inglaterra','Croacia','Ghana','Panamá'],
};
const JORNADAS = { j1:[[0,1],[2,3]], j2:[[0,2],[1,3]], j3:[[0,3],[1,2]] };
function groupMatchList(g) {
  return [...JORNADAS.j1.map(p=>({pair:p,jornada:1})),...JORNADAS.j2.map(p=>({pair:p,jornada:2})),...JORNADAS.j3.map(p=>({pair:p,jornada:3}))];
}
function matchKey(g,i,j){return `${g}_${i}_${j}`;}
const GK = Object.keys(GROUPS);

const PHASES = ['setup','p1_open','groups','done'];
const PLBL = { setup:'⚙ Configuración', p1_open:'📝 Predicciones abiertas', groups:'⚽ Fase de grupos en curso', done:'✅ Tiempo 1 finalizado' };

// ── TABLA Y TERCEROS ──────────────────────────────────────────
function calcGroupStandings(g, gm) {
  const teams=GROUPS[g], pts=[0,0,0,0], gf=[0,0,0,0], gc=[0,0,0,0];
  groupMatchList(g).forEach(({pair:[i,j]})=>{
    const m=gm[matchKey(g,i,j)];
    if(!m||m.h===''||m.a===''||m.h==null||m.a==null)return;
    const h=+m.h,a=+m.a; if(isNaN(h)||isNaN(a))return;
    gf[i]+=h;gc[i]+=a;gf[j]+=a;gc[j]+=h;
    if(h>a)pts[i]+=3;else if(h<a)pts[j]+=3;else{pts[i]+=1;pts[j]+=1;}
  });
  return [0,1,2,3].sort((a,b)=>{
    if(pts[b]!==pts[a])return pts[b]-pts[a];
    if((gf[b]-gc[b])!==(gf[a]-gc[a]))return(gf[b]-gc[b])-(gf[a]-gc[a]);
    return gf[b]-gf[a];
  }).map(i=>({team:teams[i],pts:pts[i],gf:gf[i],gc:gc[i],gd:gf[i]-gc[i]}));
}
function calcAllStandings(gm){const s={};GK.forEach(g=>{s[g]=calcGroupStandings(g,gm);});return s;}
function calcBest8Thirds(gm){
  return GK.map(g=>{const s=calcGroupStandings(g,gm);return s[2]?{...s[2],group:g}:null;})
    .filter(Boolean).sort((a,b)=>{if(b.pts!==a.pts)return b.pts-a.pts;if(b.gd!==a.gd)return b.gd-a.gd;return b.gf-a.gf;}).slice(0,8);
}
function getR32Teams(gm){
  const list=[]; const st=calcAllStandings(gm);
  GK.forEach(g=>{if(st[g]?.[0]?.team)list.push(st[g][0].team);if(st[g]?.[1]?.team)list.push(st[g][1].team);});
  calcBest8Thirds(gm).forEach(t=>list.push(t.team));
  return list;
}

// ── SCORING ───────────────────────────────────────────────────
function scoreMatch(pred,real){
  if(!pred||real?.h==null||real?.a==null)return{pts:0,exact:false};
  const pH=+pred.h,pA=+pred.a,rH=+real.h,rA=+real.a;
  if([pH,pA,rH,rA].some(isNaN))return{pts:0,exact:false};
  const pr=(h,a)=>h>a?1:a>h?-1:0;
  if(pr(pH,pA)!==pr(rH,rA))return{pts:0,exact:false};
  const exact=pH===rH&&pA===rA;
  return{pts:2+(exact?2:0),exact};
}
function calcTotal(t1,rr){
  if(!t1)return{total:0,exactAll:0,detail:{}};
  let total=0,exactAll=0; const detail={};
  GK.forEach(g=>{
    detail[g]={};
    groupMatchList(g).forEach(({pair:[i,j]})=>{
      const k=matchKey(g,i,j);
      const{pts,exact}=scoreMatch(t1.gm?.[k],rr?.gm?.[k]);
      total+=pts;if(exact)exactAll++;
      detail[g][k]={pred:t1.gm?.[k],real:rr?.gm?.[k],pts,exact};
    });
  });
  const realR32=rr?.cl?.r32all||[];
  (t1.r32teams||[]).forEach(t=>{if(realR32.includes(t))total+=1;});
  return{total,exactAll,detail};
}

// ── NORMALIZAR NOMBRE (para comparación sin tildes/mayúsculas) ─
function normName(s){
  return(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}

// ── STORAGE ───────────────────────────────────────────────────
const S={
  async get(k){try{const r=await window.storage.get(k);return r?JSON.parse(r.value):null;}catch{return null;}},
  async set(k,v){try{await window.storage.set(k,JSON.stringify(v));return true;}catch{return false;}},
  async del(k){try{await window.storage.delete(k);}catch{}},
  async list(pfx){try{const r=await window.storage.list(pfx);return r?.keys||[];}catch{return[];}},
};
const pk=n=>'p:'+normName(n).replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').slice(0,40);

// ── EXPORT EXCEL (via CSV descargable — compatible sin backend) ─
function exportToCSV(participants, rr) {
  // Hoja 1: Resumen
  const rows = [['Nombre','Puntos Totales','Exactos','Enviado']];
  const rr_gm = rr?.gm || {};
  participants.forEach(p => {
    const sc = calcTotal(p.t1, rr);
    rows.push([p.name, sc.total, sc.exactAll, p.t1?.submitted ? 'Sí' : 'No']);
  });

  // Hoja 2: Marcadores detallados — generamos CSV unificado con secciones
  const detail = [['--- RESUMEN ---'],['Nombre','Puntos','Exactos','Enviado']];
  participants.forEach(p => {
    const sc = calcTotal(p.t1, rr);
    detail.push([p.name, sc.total, sc.exactAll, p.t1?.submitted?'Sí':'No']);
  });

  detail.push([]);
  detail.push(['--- MARCADORES POR PARTICIPANTE ---']);

  participants.filter(p=>p.t1?.submitted).forEach(p => {
    detail.push([]);
    detail.push([`PARTICIPANTE: ${p.name}`]);
    detail.push(['Grupo','Partido','Local','Gol L','Gol V','Visitante','Resultado','Pts']);
    GK.forEach(g => {
      const teams = GROUPS[g];
      groupMatchList(g).forEach(({pair:[i,j]}) => {
        const k = matchKey(g,i,j);
        const pred = p.t1?.gm?.[k];
        const real = rr_gm[k];
        const {pts,exact} = scoreMatch(pred, real);
        const res = pred?.h!=null&&pred?.a!=null ? `${pred.h}-${pred.a}` : '-';
        const realRes = real?.h!=null&&real?.a!=null ? `${real.h}-${real.a}` : 'N/A';
        detail.push([`Grupo ${g}`, `J${Math.ceil((groupMatchList(g).findIndex(m=>matchKey(g,...m.pair)===k)+1)/2)}`, teams[i], pred?.h??'', pred?.a??'', teams[j], realRes, pts]);
      });
    });
    detail.push(['','','','','','','TOTAL:', calcTotal(p.t1,rr).total]);
    detail.push(['Clasificados R32:',...(p.t1?.r32teams||[])]);
  });

  const csv = detail.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `polla-mundial-backup-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ── THEME ─────────────────────────────────────────────────────
const C={bg:'#070f06',card:'#0d1a0b',card2:'#101f0e',brd:'#1c3419',gold:'#f7c948',grn:'#22c55e',txt:'#f0f4ef',muted:'#607a5e',red:'#ef4444'};

// ── PRIMITIVES ────────────────────────────────────────────────
function Btn({label,onClick,v='gold',dis,full=true,sm,sx}){
  const M={gold:{bg:C.gold,col:'#070f06',br:'none'},green:{bg:C.grn,col:'#070f06',br:'none'},dark:{bg:C.card,col:C.muted,br:`1px solid ${C.brd}`},red:{bg:C.red,col:'#fff',br:'none'}};
  const m=M[v]||M.gold;
  return <button onClick={onClick} disabled={dis} style={{background:m.bg,color:m.col,border:m.br,borderRadius:8,padding:sm?'6px 14px':'10px 20px',fontSize:sm?12:14,fontWeight:700,cursor:dis?'not-allowed':'pointer',opacity:dis?.45:1,fontFamily:"'Nunito',sans-serif",width:full?'100%':'auto',...sx}}>{label}</button>;
}
function Card({children,sx,hl}){return <div style={{background:C.card,border:`1px solid ${hl?C.gold:C.brd}`,borderRadius:12,padding:16,...sx}}>{children}</div>;}
function Inp({val,set,ph,type='text',sx}){return <input value={val} onChange={e=>set(e.target.value)} placeholder={ph} type={type} style={{background:C.bg,border:`1px solid ${C.brd}`,borderRadius:6,padding:'8px 12px',color:C.txt,fontSize:14,outline:'none',fontFamily:"'Nunito',sans-serif",width:'100%',...sx}}/>;}
function ScoreBox({val={},set,dis}){
  const si={width:42,textAlign:'center',background:C.bg,border:`1px solid ${C.brd}`,borderRadius:6,padding:'6px 0',color:C.txt,fontSize:16,fontWeight:700,outline:'none',fontFamily:"'Nunito',sans-serif"};
  return <div style={{display:'flex',alignItems:'center',gap:6}}>
    <input type="number" min="0" max="30" value={val.h??''} disabled={dis} style={si} onChange={e=>set({...val,h:e.target.value})}/>
    <span style={{color:C.muted,fontSize:13,fontWeight:700}}>:</span>
    <input type="number" min="0" max="30" value={val.a??''} disabled={dis} style={si} onChange={e=>set({...val,a:e.target.value})}/>
  </div>;
}
function Back({go}){return <button onClick={go} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',padding:'4px 0',fontSize:13,fontFamily:"'Nunito',sans-serif",display:'flex',alignItems:'center',gap:4,marginBottom:10}}>← Volver</button>;}
function Title({text,sz=32,col,sx}){return <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:sz,color:col||C.gold,lineHeight:1,...sx}}>{text}</div>;}
function Lbl({text,sx}){return <div style={{fontSize:11,color:C.muted,textTransform:'uppercase',letterSpacing:.6,marginBottom:5,...sx}}>{text}</div>;}
function TabBar({tabs,active,set}){
  return <div style={{display:'flex',gap:4,overflowX:'auto',marginBottom:14,paddingBottom:2}}>
    {tabs.map(t=><button key={t.id} onClick={()=>set(t.id)} style={{background:t.id===active?C.gold:C.card,color:t.id===active?'#070f06':C.muted,border:'none',borderRadius:7,padding:'7px 12px',fontSize:11,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',fontFamily:"'Nunito',sans-serif",flexShrink:0}}>{t.label}</button>)}
  </div>;
}

// ── HOME ──────────────────────────────────────────────────────
function Home({cfg,nav}){
  return <div style={{maxWidth:420,margin:'0 auto',padding:'60px 24px',textAlign:'center'}}>
    <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:80,color:C.gold,lineHeight:.9}}>POLLA</div>
    <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:52,color:C.txt,lineHeight:1,marginBottom:4}}>MUNDIAL 2026</div>
    <div style={{display:'inline-block',background:C.card,border:`1px solid ${C.brd}`,borderRadius:20,padding:'4px 14px',fontSize:12,color:C.muted,marginBottom:40}}>{PLBL[cfg?.phase||'setup']}</div>
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <Btn label="🏆 Leaderboard" onClick={()=>nav('lb')}/>
      <Btn label="⚽ Mis predicciones" v="green" onClick={()=>nav('part')}/>
      <Btn label="⚙ Panel Admin" v="dark" onClick={()=>nav('admin')}/>
    </div>
  </div>;
}

// ── ADMIN ─────────────────────────────────────────────────────
function Admin({cfg,saveCfg,back}){
  const [auth,setAuth]=useState(false),[pwd,setPwd]=useState(''),[err,setErr]=useState('');
  const [tab,setTab]=useState('status'),[rr,setRr]=useState(null);
  useEffect(()=>{if(auth)S.get('rr').then(r=>setRr(r||{gm:{},cl:{}}));},[auth]);
  const saveRr=async nr=>{setRr(nr);await S.set('rr',nr);};

  if(!cfg?.adminPwd||!auth){
    const isNew=!cfg?.adminPwd;
    return <div style={{maxWidth:360,margin:'0 auto',padding:'40px 20px'}}>
      <Back go={back}/><Title text={isNew?'CREAR ADMIN':'PANEL ADMIN'}/>
      <Card sx={{marginTop:14}}>
        <Lbl text="Contraseña"/>
        <Inp val={pwd} set={setPwd} type="password" ph="Contraseña..."/>
        {err&&<div style={{color:C.red,fontSize:12,marginTop:8}}>{err}</div>}
        <Btn label={isNew?'Crear y entrar':'Entrar'} sx={{marginTop:14}} onClick={async()=>{
          if(!pwd||pwd.length<3){setErr('Mínimo 3 caracteres');return;}
          if(isNew){await saveCfg({...cfg,adminPwd:pwd});}
          else if(pwd!==cfg.adminPwd){setErr('Contraseña incorrecta');return;}
          setAuth(true);
        }}/>
      </Card>
    </div>;
  }
  if(!rr)return <div style={{padding:40,textAlign:'center',color:C.muted}}>Cargando...</div>;
  const TABS=[{id:'status',label:'📊 Estado'},{id:'gr',label:'⚽ Resultados'},{id:'cl',label:'✅ Clasificados'},{id:'pl',label:'👥 Participantes'},{id:'auth',label:'🔒 Acceso'}];
  return <div style={{maxWidth:640,margin:'0 auto',padding:16}}>
    <Back go={back}/><Title text="PANEL ADMIN"/>
    <div style={{color:C.muted,fontSize:12,marginBottom:12}}>{PLBL[cfg.phase]}</div>
    <TabBar tabs={TABS} active={tab} set={setTab}/>
    {tab==='status'&&<AStatus cfg={cfg} saveCfg={saveCfg}/>}
    {tab==='gr'&&<AGR rr={rr} save={saveRr}/>}
    {tab==='cl'&&<ACL rr={rr} save={saveRr}/>}
    {tab==='pl'&&<APl rr={rr}/>}
    {tab==='auth'&&<AAuth cfg={cfg} saveCfg={saveCfg}/>}
  </div>;
}

function AStatus({cfg,saveCfg}){
  const pi=PHASES.indexOf(cfg.phase);
  const [closingDate,setClosingDate]=useState(cfg.closingDate||'');
  const [saved,setSaved]=useState(false);
  return <div style={{display:'flex',flexDirection:'column',gap:10}}>
    {cfg.phase==='groups'&&<div style={{background:'#1a1500',border:`1px solid ${C.gold}`,borderRadius:10,padding:'12px 14px',display:'flex',gap:10,alignItems:'flex-start'}}>
      <span style={{fontSize:18,lineHeight:1}}>⚠️</span>
      <div>
        <div style={{color:C.gold,fontWeight:800,fontSize:13,marginBottom:4}}>Acción requerida al terminar los grupos</div>
        <div style={{color:C.muted,fontSize:12,lineHeight:1.5}}>Cuando terminen los 72 partidos de la fase de grupos, ve a la pestaña <span style={{color:C.txt,fontWeight:700}}>✅ Clasificados reales</span> e ingresa y guarda los 32 clasificados. Sin ese paso el scoring de clasificados no funcionará.</div>
      </div>
    </div>}
    <Card>
      <Lbl text="Fase actual"/>
      <div style={{fontSize:18,fontWeight:800,color:C.gold,marginBottom:14}}>{PLBL[cfg.phase]}</div>
      {pi<PHASES.length-1&&<Btn v="green" label={`➡ Avanzar a: ${PLBL[PHASES[pi+1]]}`} onClick={()=>saveCfg({...cfg,phase:PHASES[pi+1]})}/>}
      {pi>0&&<Btn v="dark" label="⬅ Retroceder" sx={{marginTop:8}} onClick={()=>saveCfg({...cfg,phase:PHASES[pi-1]})}/>}
    </Card>
    <Card>
      <Lbl text="Fecha de cierre de predicciones"/>
      <div style={{color:C.muted,fontSize:12,marginBottom:10}}>Las predicciones se bloquean automáticamente en esta fecha. El admin puede extenderla manualmente avanzando o retrocediendo la fase.</div>
      <input type="datetime-local" value={closingDate} onChange={e=>{setClosingDate(e.target.value);setSaved(false);}}
        style={{background:C.bg,border:`1px solid ${C.brd}`,borderRadius:6,padding:'8px 12px',color:C.txt,fontSize:13,outline:'none',fontFamily:"'Nunito',sans-serif",width:'100%',marginBottom:10}}/>
      <Btn label={saved?'✓ Guardado':'Guardar fecha de cierre'} v="green" onClick={async()=>{await saveCfg({...cfg,closingDate});setSaved(true);}}/>
      {cfg.closingDate&&<div style={{fontSize:11,color:C.muted,marginTop:8}}>Cierre actual: {new Date(cfg.closingDate).toLocaleString('es-CO',{timeZone:'America/Bogota'})}</div>}
    </Card>
    <Card>
      {PHASES.map((p,i)=><div key={p} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderBottom:i<PHASES.length-1?`1px solid ${C.brd}`:'none'}}>
        <span style={{fontSize:14,color:i<pi?C.grn:i===pi?C.gold:'#ffffff22',width:16}}>{i<pi?'✓':i===pi?'▶':'○'}</span>
        <span style={{fontSize:13,color:i===pi?C.txt:i<pi?C.muted+'99':'#ffffff22'}}>{PLBL[p]}</span>
        {i===pi&&<span style={{fontSize:9,fontWeight:700,color:C.gold,border:`1px solid ${C.gold}44`,borderRadius:4,padding:'2px 5px',marginLeft:4}}>ACTUAL</span>}
      </div>)}
    </Card>
  </div>;
}

function AGR({rr,save}){
  const [ag,setAg]=useState('A'),[loc,setLoc]=useState({}),[ok,setOk]=useState(false);
  useEffect(()=>setLoc(rr?.gm||{}),[rr]);
  const teams=GROUPS[ag],matches=groupMatchList(ag);
  const standings=useMemo(()=>calcGroupStandings(ag,loc),[ag,loc]);
  return <div>
    <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:12}}>
      {GK.map(g=><button key={g} onClick={()=>setAg(g)} style={{background:g===ag?C.gold:C.card,color:g===ag?'#070f06':C.muted,border:'none',borderRadius:6,padding:'5px 11px',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:"'Nunito',sans-serif"}}>{g}</button>)}
    </div>
    <Card sx={{marginBottom:10}}>
      <div style={{fontWeight:800,color:C.gold,fontSize:14,marginBottom:10}}>Grupo {ag} — resultados reales</div>
      {[1,2,3].map(j=><div key={j}>
        <div style={{fontSize:10,color:C.muted,textTransform:'uppercase',letterSpacing:.5,marginTop:j>1?12:0,marginBottom:6}}>Jornada {j}</div>
        {matches.filter(m=>m.jornada===j).map(({pair:[i,k]})=>{
          const mk=matchKey(ag,i,k);
          return <div key={mk} style={{display:'flex',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${C.brd}`}}>
            <span style={{flex:1,fontSize:12,textAlign:'right',paddingRight:10}}>{teams[i]}</span>
            <ScoreBox val={loc[mk]||{}} set={v=>{setLoc(p=>({...p,[mk]:v}));setOk(false);}}/>
            <span style={{flex:1,fontSize:12,paddingLeft:10}}>{teams[k]}</span>
          </div>;
        })}
      </div>)}
    </Card>
    <Card sx={{marginBottom:10}}>
      <Lbl text="Tabla calculada"/>
      {standings.map((s,i)=><div key={s.team} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',borderBottom:i<3?`1px solid ${C.brd}`:'none'}}>
        <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:18,color:i<2?C.gold:C.muted,width:18}}>{i+1}</span>
        <span style={{flex:1,fontSize:13,color:i<2?C.txt:C.muted,fontWeight:i<2?700:400}}>{s.team}</span>
        <span style={{fontSize:11,color:C.muted}}>{s.pts}pts {s.gd>=0?'+':''}{s.gd}dg {s.gf}gf</span>
        {i<2&&<span style={{fontSize:9,fontWeight:700,color:C.grn,border:`1px solid ${C.grn}44`,borderRadius:4,padding:'2px 5px'}}>CLASIFICA</span>}
      </div>)}
    </Card>
    <Btn label={ok?'✓ Guardado':'Guardar resultados'} v="green" onClick={async()=>{await save({...rr,gm:loc});setOk(true);}}/>
  </div>;
}

function ACL({rr,save}){
  const [ok,setOk]=useState(false);
  const standings=useMemo(()=>calcAllStandings(rr?.gm||{}),[rr]);
  const best8=useMemo(()=>calcBest8Thirds(rr?.gm||{}),[rr]);
  const r32auto=useMemo(()=>{
    const list=[];
    GK.forEach(g=>{if(standings[g]?.[0])list.push(standings[g][0].team);if(standings[g]?.[1])list.push(standings[g][1].team);});
    best8.forEach(t=>list.push(t.team));return list;
  },[standings,best8]);
  return <div>
    <Card sx={{marginBottom:10}}>
      <Lbl text="32 clasificados a dieciseisavos (automático)"/>
      <div style={{color:C.muted,fontSize:12,marginBottom:12}}>Calculado a partir de los resultados reales ingresados. Guarda para activar el scoring.</div>
      <div style={{marginBottom:10}}>
        <div style={{fontSize:11,color:C.muted,marginBottom:6}}>1ros y 2dos ({GK.flatMap(g=>[standings[g]?.[0],standings[g]?.[1]]).filter(s=>s?.team).length}/24)</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
          {GK.flatMap(g=>[standings[g]?.[0],standings[g]?.[1]]).filter(s=>s?.team).map(s=><span key={s.team} style={{background:'#1a3a10',color:C.grn,border:`1px solid ${C.grn}33`,borderRadius:5,padding:'3px 8px',fontSize:11}}>{s.team}</span>)}
        </div>
      </div>
      <div>
        <div style={{fontSize:11,color:C.muted,marginBottom:6}}>8 mejores terceros ({best8.length}/8)</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
          {best8.map(s=><span key={s.team} style={{background:'#1a280a',color:'#a3d977',border:`1px solid #a3d97733`,borderRadius:5,padding:'3px 8px',fontSize:11}}>{s.team} <span style={{opacity:.6}}>{s.pts}p {s.gd>=0?'+':''}{s.gd}</span></span>)}
        </div>
      </div>
    </Card>
    <Btn label={ok?'✓ Guardado':'Guardar clasificados reales'} v="green" onClick={async()=>{await save({...rr,cl:{r32all:r32auto}});setOk(true);}}/>
  </div>;
}

// ── ADMIN: PARTICIPANTES CON DETALLE Y EXPORT ─────────────────
function APl({rr}){
  const [list,setList]=useState([]),[loading,setLoading]=useState(true);
  const [selected,setSelected]=useState(null);
  useEffect(()=>{S.list('p:').then(async keys=>{const d=await Promise.all(keys.map(k=>S.get(k)));setList(d.filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name)));setLoading(false);});},[]);
  const del=async p=>{if(!confirm(`¿Eliminar a ${p.name}?`))return;await S.del(pk(p.name));setList(l=>l.filter(x=>x.name!==p.name));setSelected(null);};

  if(selected){
    const sc=calcTotal(selected.t1,rr);
    const st=calcAllStandings(selected.t1?.gm||{});
    const b8=calcBest8Thirds(selected.t1?.gm||{});
    return <div>
      <Back go={()=>setSelected(null)}/>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:14}}>
        <Title text={selected.name.toUpperCase()} sz={22}/>
        <div style={{textAlign:'right'}}>
          <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:40,color:C.gold,lineHeight:1}}>{sc.total}</div>
          <div style={{fontSize:11,color:C.muted}}>{sc.exactAll} exactos</div>
        </div>
      </div>
      {GK.map(g=>{
        const teams=GROUPS[g],matches=groupMatchList(g);
        return <Card key={g} sx={{marginBottom:8}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <span style={{fontWeight:800,color:C.gold,fontSize:13}}>Grupo {g}</span>
            <span style={{fontSize:11,color:C.muted}}>{st[g]?.[0]?.team||'?'} · {st[g]?.[1]?.team||'?'}</span>
          </div>
          {matches.map(({pair:[i,j]})=>{
            const k=matchKey(g,i,j),pred=selected.t1?.gm?.[k],real=rr?.gm?.[k];
            const{pts,exact}=scoreMatch(pred,real);
            const hasPred=pred?.h!=null&&pred?.a!=null;
            const hasReal=real?.h!=null&&real?.a!=null;
            return <div key={k} style={{display:'flex',alignItems:'center',padding:'5px 0',borderTop:`1px solid ${C.brd}`,fontSize:11}}>
              <span style={{flex:1,textAlign:'right',paddingRight:6,color:C.muted}}>{teams[i]}</span>
              <span style={{minWidth:50,textAlign:'center',fontWeight:700,color:hasPred?C.txt:C.muted+'55'}}>{hasPred?`${pred.h}:${pred.a}`:'—'}</span>
              <span style={{color:C.muted,fontSize:9,minWidth:30,textAlign:'center'}}>real:{hasReal?`${real.h}:${real.a}`:'?'}</span>
              <span style={{flex:1,paddingLeft:6,color:C.muted}}>{teams[j]}</span>
              <span style={{minWidth:28,textAlign:'right',color:pts>0?(exact?C.gold:C.grn):C.muted,fontWeight:700,fontSize:12}}>{pts>0?`+${pts}`:hasReal?'0':''}</span>
            </div>;
          })}
        </Card>;
      })}
      <Card sx={{marginBottom:10}}>
        <Lbl text="Sus 32 clasificados"/>
        <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:4}}>
          {GK.flatMap(g=>[st[g]?.[0],st[g]?.[1]]).filter(s=>s?.team).map(s=><span key={s.team} style={{background:'#1a3a10',color:C.grn,border:`1px solid ${C.grn}33`,borderRadius:5,padding:'3px 7px',fontSize:11}}>{s.team}</span>)}
          {b8.map(s=><span key={s.team} style={{background:'#1a280a',color:'#a3d977',border:`1px solid #a3d97733`,borderRadius:5,padding:'3px 7px',fontSize:11}}>{s.team}</span>)}
        </div>
      </Card>
      <Btn v="red" full={false} label={`Eliminar a ${selected.name}`} onClick={()=>del(selected)}/>
    </div>;
  }

  if(loading)return <div style={{color:C.muted,textAlign:'center',padding:20}}>Cargando...</div>;
  const submitted=list.filter(p=>p.t1?.submitted);
  const pending=list.filter(p=>!p.t1?.submitted);
  return <div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
      <div style={{color:C.muted,fontSize:13}}>{list.length} registrados · {submitted.length} enviados · {pending.length} pendientes</div>
      {submitted.length>0&&<Btn v="dark" full={false} sm label="📥 Exportar CSV" onClick={()=>exportToCSV(list,rr)}/>}
    </div>
    {submitted.length>0&&<div>
      <Lbl text="Enviados"/>
      {submitted.map(p=>{
        const sc=calcTotal(p.t1,rr);
        return <div key={p.name} onClick={()=>setSelected(p)} style={{display:'flex',alignItems:'center',gap:12,background:C.card,border:`1px solid ${C.brd}`,borderRadius:10,padding:'12px 14px',marginBottom:6,cursor:'pointer'}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:14}}>{p.name}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>{sc.exactAll} exactos · {(p.t1?.r32teams||[]).length} clasificados</div>
          </div>
          <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:32,color:C.gold,lineHeight:1}}>{sc.total}</div>
          <span style={{color:C.muted,fontSize:16}}>›</span>
        </div>;
      })}
    </div>}
    {pending.length>0&&<div style={{marginTop:14}}>
      <Lbl text="Pendientes de envío"/>
      {pending.map(p=><div key={p.name} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:`1px solid ${C.brd}`}}>
        <span style={{fontSize:13,color:C.muted}}>{p.name}</span>
        <Btn v="red" full={false} sm label="Eliminar" onClick={()=>del(p)}/>
      </div>)}
    </div>}
    {list.length===0&&<Card><div style={{color:C.muted,textAlign:'center',padding:20}}>Sin participantes registrados aún</div></Card>}
  </div>;
}

// ── ADMIN: LISTA DE ACCESO ────────────────────────────────────
function AAuth({cfg,saveCfg}){
  const [raw,setRaw]=useState((cfg.allowedNames||[]).join('\n'));
  const [saved,setSaved]=useState(false);
  const names=cfg.allowedNames||[];
  const active=cfg.requireAuth===true;

  return <div>
    {/* Toggle principal */}
    <Card sx={{marginBottom:10}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <div style={{fontWeight:700,fontSize:14,color:C.txt}}>Control de acceso</div>
          <div style={{fontSize:12,color:C.muted,marginTop:3}}>
            {active
              ? '🔒 Solo los nombres de la lista pueden registrarse'
              : '🔓 Cualquiera con el link puede registrarse'}
          </div>
        </div>
        <button onClick={async()=>{ await saveCfg({...cfg,requireAuth:!active}); setSaved(false); }}
          style={{background:active?C.grn:C.card,border:`2px solid ${active?C.grn:C.brd}`,borderRadius:20,width:52,height:28,cursor:'pointer',position:'relative',transition:'all .2s',flexShrink:0}}>
          <div style={{position:'absolute',top:3,left:active?26:3,width:18,height:18,background:'#fff',borderRadius:'50%',transition:'left .2s'}}/>
        </button>
      </div>
      {active&&<div style={{marginTop:10,padding:'8px 10px',background:'#1a1500',borderRadius:7,fontSize:11,color:C.gold}}>
        ⚠ Control activo — solo los nombres de la lista pueden registrarse.
      </div>}
      {!active&&<div style={{marginTop:10,padding:'8px 10px',background:'#0d1a0b',borderRadius:7,fontSize:11,color:C.muted}}>
        Registro abierto. Puedes activar el control cuando quieras cerrar la inscripción.
      </div>}
    </Card>

    {/* Lista de nombres */}
    <Card sx={{marginBottom:10}}>
      <Lbl text="Lista de participantes autorizados"/>
      <div style={{color:C.muted,fontSize:12,marginBottom:10}}>Un nombre por línea. Se usa solo cuando el control está activo. Ignora mayúsculas y tildes.</div>
      <textarea value={raw} onChange={e=>{setRaw(e.target.value);setSaved(false);}} rows={10}
        placeholder={'Juan García\nMaría López\nPedro Martínez\n...'}
        style={{background:C.bg,border:`1px solid ${C.brd}`,borderRadius:6,padding:'10px 12px',color:C.txt,fontSize:13,outline:'none',fontFamily:"'Nunito',sans-serif",width:'100%',resize:'vertical'}}/>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:10}}>
        <span style={{fontSize:11,color:C.muted}}>{raw.split('\n').filter(l=>l.trim()).length} nombres</span>
        <Btn full={false} label={saved?'✓ Guardado':'Guardar lista'} v="green" onClick={async()=>{
          const list=raw.split('\n').map(l=>l.trim()).filter(Boolean);
          await saveCfg({...cfg,allowedNames:list});setSaved(true);
        }}/>
      </div>
    </Card>
    {names.length>0&&<Card>
      <Lbl text="Lista guardada"/>
      <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:4}}>
        {names.map(n=><span key={n} style={{background:C.card2,border:`1px solid ${C.brd}`,borderRadius:5,padding:'3px 8px',fontSize:12,color:C.txt}}>{n}</span>)}
      </div>
    </Card>}
  </div>;
}

// ── PARTICIPANT ───────────────────────────────────────────────
function Participant({cfg:cfgProp,back}){
  const [auth,setAuth]=useState(false),[pd,setPd]=useState(null);
  const [name,setName]=useState(''),[pwd,setPwd]=useState(''),[isNew,setIsNew]=useState(false),[err,setErr]=useState('');
  const [rr,setRr]=useState(null);
  const [cfg,setCfg]=useState(cfgProp);

  // Siempre leer cfg fresco del storage al entrar
  useEffect(()=>{
    S.get('cfg').then(c=>{ if(c) setCfg(c); });
  },[]);

  useEffect(()=>{if(auth)Promise.all([S.get('rr'),S.get('cfg')]).then(([r,c])=>{setRr(r||{gm:{},cl:{}});if(c)setCfg(c);});},[auth]);

  // Verificar si las predicciones están abiertas
  const isOpen=(c)=>{
    if(c?.phase!=='p1_open')return false;
    if(c?.closingDate){const cd=new Date(c.closingDate);if(new Date()>cd)return false;}
    return true;
  };

  const login=async()=>{
    if(!name.trim()){setErr('Ingresa tu nombre');return;}
    if(!pwd.trim()){setErr('Ingresa tu contraseña');return;}
    const k=pk(name.trim()),ex=await S.get(k);
    if(isNew){
      // Verificar lista de acceso solo si el control está activo
      if(cfg.requireAuth===true){
        const allowed=cfg.allowedNames||[];
        if(allowed.length>0){
          const match=allowed.some(n=>normName(n)===normName(name.trim()));
          if(!match){setErr('Tu nombre no está en la lista de participantes autorizados. Verifica con el administrador.');return;}
        }
      }
      if(ex){setErr('Ese nombre ya está registrado');return;}
      const np={name:name.trim(),pwd,t1:{gm:{},submitted:false}};
      await S.set(k,np);setPd(np);setAuth(true);
    } else {
      if(!ex){setErr('No encontrado. ¿Quieres registrarte?');return;}
      if(ex.pwd!==pwd){setErr('Contraseña incorrecta');return;}
      setPd(ex);setAuth(true);
    }
  };

  const saveP=async np=>{await S.set(pk(np.name),np);setPd(np);};

  if(!auth)return <div style={{maxWidth:380,margin:'0 auto',padding:'40px 20px'}}>
    <Back go={back}/><Title text="MIS PREDICCIONES"/>
    <Card sx={{marginTop:14}}>
      <div style={{display:'flex',gap:6,marginBottom:16}}>
        {['Ingresar','Registrarse'].map((l,i)=><button key={l} onClick={()=>setIsNew(!!i)} style={{flex:1,background:isNew===!!i?C.gold:C.card2,color:isNew===!!i?'#070f06':C.muted,border:`1px solid ${C.brd}`,borderRadius:7,padding:'9px',fontWeight:700,cursor:'pointer',fontFamily:"'Nunito',sans-serif",fontSize:13}}>{l}</button>)}
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <div><Lbl text="Tu nombre"/><Inp val={name} set={setName} ph="Nombre completo..."/></div>
        <div><Lbl text="Contraseña"/><Inp val={pwd} set={setPwd} type="password" ph="Contraseña personal..."/></div>
      </div>
      {err&&<div style={{color:C.red,fontSize:12,marginTop:10,lineHeight:1.4}}>{err}</div>}
      <Btn label={isNew?'Registrarse':'Ingresar'} v="green" sx={{marginTop:14}} onClick={login}/>
    </Card>
  </div>;

  if(!rr)return <div style={{padding:40,textAlign:'center',color:C.muted}}>Cargando...</div>;

  const open=isOpen(cfg);
  const score=calcTotal(pd.t1?.submitted?pd.t1:null,rr);

  return <div style={{maxWidth:640,margin:'0 auto',padding:16}}>
    <Back go={back}/>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:14}}>
      <Title text={pd.name.toUpperCase()} sz={26}/>
      {pd.t1?.submitted&&<div style={{textAlign:'right'}}>
        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:44,color:C.gold,lineHeight:1}}>{score.total}</div>
        <div style={{fontSize:11,color:C.muted}}>puntos · {score.exactAll} exactos</div>
      </div>}
    </div>
    {cfg?.phase==='setup'&&<Card><div style={{color:C.muted,textAlign:'center',padding:'24px 0',fontSize:14}}>⏳ La polla aún no está abierta.</div></Card>}
    {open&&!pd.t1?.submitted&&<T1Form pd={pd} save={saveP} rr={rr}/>}
    {pd.t1?.submitted&&<SubmittedView pd={pd} rr={rr} score={score}/>}
    {!pd.t1?.submitted&&!open&&cfg?.phase!=='setup'&&<Card><div style={{color:C.muted,textAlign:'center',padding:20}}>
      {cfg?.closingDate&&new Date()>new Date(cfg.closingDate)?'⏰ El tiempo de predicciones cerró.':'⚠ Las predicciones no están disponibles en este momento.'}
    </div></Card>}
  </div>;
}

function SubmittedView({pd,rr,score}){
  const [tab,setTab]=useState('matches');
  const st=useMemo(()=>calcAllStandings(pd.t1?.gm||{}),[pd]);
  const b8=useMemo(()=>calcBest8Thirds(pd.t1?.gm||{}),[pd]);
  const TABS=[{id:'matches',label:'⚽ Mis marcadores'},{id:'r32',label:'🏅 Mis clasificados'}];
  return <div>
    <Card sx={{textAlign:'center',padding:'16px',marginBottom:12}} hl>
      <div style={{color:C.grn,fontWeight:800,fontSize:16,marginBottom:4}}>✓ Predicciones enviadas</div>
      <div style={{color:C.muted,fontSize:12}}>Solo lectura — no puedes hacer cambios.</div>
    </Card>
    <TabBar tabs={TABS} active={tab} set={setTab}/>

    {tab==='matches'&&<div>
      <div style={{color:C.muted,fontSize:11,marginBottom:10}}>
        Verde = resultado correcto · Dorado = marcador exacto · Sin color = no jugado aún o incorrecto
      </div>
      {GK.map(g=>{
        const teams=GROUPS[g],matches=groupMatchList(g);
        const gPts=matches.reduce((acc,{pair:[i,j]})=>{
          return acc+scoreMatch(pd.t1?.gm?.[matchKey(g,i,j)],rr?.gm?.[matchKey(g,i,j)]).pts;
        },0);
        return <Card key={g} sx={{marginBottom:8}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <span style={{fontWeight:800,color:C.gold,fontSize:13}}>Grupo {g}</span>
            {gPts>0&&<span style={{fontSize:12,color:C.grn,fontWeight:700}}>+{gPts} pts</span>}
          </div>
          {matches.map(({pair:[i,j]})=>{
            const k=matchKey(g,i,j);
            const pred=pd.t1?.gm?.[k],real=rr?.gm?.[k];
            const{pts,exact}=scoreMatch(pred,real);
            const hasPred=pred?.h!=null&&pred?.a!=null&&pred.h!==''&&pred.a!=='';
            const hasReal=real?.h!=null&&real?.a!=null&&real.h!==''&&real.a!=='';
            const correct=pts>0;
            return <div key={k} style={{display:'flex',alignItems:'center',padding:'6px 0',borderTop:`1px solid ${C.brd}`}}>
              <span style={{flex:1,fontSize:11,textAlign:'right',paddingRight:6,color:C.muted}}>{teams[i]}</span>
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:90}}>
                <span style={{fontSize:13,fontWeight:700,color:exact?C.gold:correct?C.grn:hasPred?C.muted+'88':C.muted+'44'}}>
                  {hasPred?`${pred.h} : ${pred.a}`:'— : —'}
                </span>
                {hasReal&&<span style={{fontSize:9,color:C.muted,marginTop:1}}>real: {real.h}:{real.a}</span>}
              </div>
              <span style={{flex:1,fontSize:11,paddingLeft:6,color:C.muted}}>{teams[j]}</span>
              <span style={{minWidth:32,textAlign:'right',fontSize:11,fontWeight:700,color:exact?C.gold:correct?C.grn:C.muted+'33'}}>
                {hasReal?(pts>0?`+${pts}`:'0'):''}
              </span>
            </div>;
          })}
        </Card>;
      })}
      <div style={{background:C.card2,border:`1px solid ${C.brd}`,borderRadius:10,padding:'12px 14px',marginTop:4,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:13,color:C.muted}}>Total por marcadores</span>
        <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:C.gold}}>{score.total} pts</span>
      </div>
    </div>}

    {tab==='r32'&&<div>
      <Card sx={{marginBottom:10}}>
        <Lbl text="1ros y 2dos de grupo (24 equipos — automático)"/>
        <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:6}}>
          {GK.flatMap(g=>[st[g]?.[0],st[g]?.[1]]).filter(s=>s?.team).map(s=>{
            const real=rr?.cl?.r32all||[];
            const ok=real.length>0&&real.includes(s.team);
            const wrong=real.length>0&&!real.includes(s.team);
            return <span key={s.team} style={{background:ok?'#1a3a10':wrong?'#2a0a0a':C.card2,color:ok?C.grn:wrong?C.red:C.txt,border:`1px solid ${ok?C.grn:wrong?C.red:C.brd}33`,borderRadius:5,padding:'3px 8px',fontSize:11}}>{s.team}</span>;
          })}
        </div>
      </Card>
      <Card sx={{marginBottom:10}}>
        <Lbl text="8 mejores terceros"/>
        <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:6}}>
          {b8.map(s=>{
            const real=rr?.cl?.r32all||[];
            const ok=real.length>0&&real.includes(s.team);
            const wrong=real.length>0&&!real.includes(s.team);
            return <span key={s.team} style={{background:ok?'#1a3a10':wrong?'#2a0a0a':C.card2,color:ok?C.grn:wrong?C.red:'#a3d977',border:`1px solid ${ok?C.grn:wrong?C.red:'#a3d977'}33`,borderRadius:5,padding:'3px 8px',fontSize:11}}>{s.team} <span style={{opacity:.6,fontSize:10}}>{s.pts}p</span></span>;
          })}
        </div>
      </Card>
      <div style={{background:C.card2,border:`1px solid ${C.brd}`,borderRadius:10,padding:'12px 14px',fontSize:12,color:C.muted}}>
        <span style={{color:C.gold,fontWeight:700}}>¿Qué sigue? </span>
        Cuando la FIFA publique los cruces (aprox. 27 junio) se abrirá el Tiempo 2 para predicciones eliminatorias.
      </div>
    </div>}
  </div>;
}

// ── TIEMPO 1 FORM ─────────────────────────────────────────────
function T1Form({pd,save,rr}){
  const [step,setStep]=useState(0);
  const [gm,setGmState]=useState(()=>({...pd.t1?.gm}));
  const [saving,setSaving]=useState(false),[confirm,setConfirm]=useState(false);
  const allStandings=useMemo(()=>calcAllStandings(gm),[gm]);
  const best8=useMemo(()=>calcBest8Thirds(gm),[gm]);
  const r32teams=useMemo(()=>{
    const list=[];
    GK.forEach(g=>{if(allStandings[g]?.[0]?.team)list.push(allStandings[g][0].team);if(allStandings[g]?.[1]?.team)list.push(allStandings[g][1].team);});
    best8.forEach(t=>list.push(t.team));return list;
  },[allStandings,best8]);
  const setGM=(k,v)=>setGmState(p=>({...p,[k]:v}));
  const submit=async()=>{setSaving(true);await save({...pd,t1:{gm,standings:allStandings,r32teams,submitted:true}});setSaving(false);};
  const isLast=step===GK.length;
  const pct=Math.round(step/GK.length*100);
  return <div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
      <span style={{fontSize:11,color:C.muted}}>{isLast?'Revisión final':`Grupo ${GK[step]} (${step+1}/12)`}</span>
      <span style={{fontSize:11,color:C.gold,fontWeight:700}}>{pct}%</span>
    </div>
    <div style={{background:C.card,borderRadius:4,height:5,marginBottom:16}}>
      <div style={{background:C.gold,height:'100%',borderRadius:4,width:pct+'%',transition:'width .3s'}}/>
    </div>
    {!isLast&&<GroupForm g={GK[step]} gm={gm} setGM={setGM} standings={allStandings[GK[step]]} rrGm={rr?.gm||{}}/>}
    {isLast&&<ReviewFinal allStandings={allStandings} best8={best8} r32teams={r32teams} confirm={confirm} setConfirm={setConfirm} saving={saving} onSubmit={submit}/>}
    <div style={{display:'flex',gap:8,marginTop:14}}>
      {step>0&&<Btn v="dark" full={false} label="← Anterior" onClick={()=>setStep(s=>s-1)}/>}
      {!isLast&&<Btn v="green" label={step===GK.length-1?'Ver resumen →':'Siguiente grupo →'} sx={{marginLeft:'auto'}} onClick={()=>setStep(s=>s+1)}/>}
    </div>
  </div>;
}

function GroupForm({g,gm,setGM,standings,rrGm}){
  const teams=GROUPS[g],matches=groupMatchList(g);
  const filled=matches.filter(({pair:[i,j]})=>{const v=gm[matchKey(g,i,j)];return v&&v.h!=null&&v.a!=null&&v.h!==''&&v.a!=='';}).length;
  const played=matches.filter(({pair:[i,j]})=>{const v=(rrGm||{})[matchKey(g,i,j)];return v&&v.h!=null&&v.a!=null&&v.h!==''&&v.a!=='';}).length;
  return <div>
    <Card sx={{marginBottom:10}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <Title text={`GRUPO ${g}`} sz={22}/>
        <span style={{fontSize:11,color:filled===6?C.grn:C.muted,fontWeight:700}}>{filled}/6 partidos</span>
      </div>
      <div style={{fontSize:12,color:C.muted,marginBottom:14}}>{teams.join(' · ')}</div>
      {played>0&&<div style={{background:'#1a1a0a',border:`1px solid ${C.gold}33`,borderRadius:7,padding:'8px 12px',marginBottom:12,fontSize:11,color:C.gold}}>
        ⚠ {played} partido{played>1?'s':''} ya jugado{played>1?'s':''} — no puedes modificarlo{played>1?'s':''}.
      </div>}
      {[1,2,3].map(j=><div key={j}>
        <div style={{fontSize:10,color:C.muted,textTransform:'uppercase',letterSpacing:.5,marginTop:j>1?14:0,marginBottom:8}}>Jornada {j}</div>
        {matches.filter(m=>m.jornada===j).map(({pair:[i,k]})=>{
          const mk=matchKey(g,i,k),val=gm[mk]||{};
          const realVal=(rrGm||{})[mk];
          const isPlayed=realVal&&realVal.h!=null&&realVal.a!=null&&realVal.h!==''&&realVal.a!=='';
          const ok=val.h!=null&&val.a!=null&&val.h!==''&&val.a!==''&&!isNaN(+val.h)&&!isNaN(+val.a);
          const h=ok?+val.h:null,a=ok?+val.a:null;
          return <div key={mk} style={{display:'flex',alignItems:'center',padding:'9px 0',borderBottom:`1px solid ${C.brd}`,opacity:isPlayed?.6:1}}>
            <span style={{flex:1,fontSize:12,textAlign:'right',paddingRight:10,fontWeight:ok&&h>a?700:400,color:ok&&h>a?C.txt:C.muted}}>{teams[i]}</span>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
              <ScoreBox val={val} set={v=>setGM(mk,v)} dis={isPlayed}/>
              {isPlayed&&<span style={{fontSize:9,color:C.muted}}>real: {realVal.h}:{realVal.a}</span>}
            </div>
            <span style={{flex:1,fontSize:12,paddingLeft:10,fontWeight:ok&&a>h?700:400,color:ok&&a>h?C.txt:C.muted}}>{teams[k]}</span>
          </div>;
        })}
      </div>)}
    </Card>
    <Card>
      <Lbl text="Tabla — se actualiza automáticamente"/>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
        <thead><tr style={{color:C.muted,fontSize:10}}>
          <th style={{textAlign:'left',padding:'4px 0',fontWeight:400}}>#</th>
          <th style={{textAlign:'left',padding:'4px 6px',fontWeight:400}}>Equipo</th>
          <th style={{padding:'4px 8px',fontWeight:400}}>Pts</th>
          <th style={{padding:'4px 8px',fontWeight:400}}>DG</th>
          <th style={{padding:'4px 8px',fontWeight:400}}>GF</th>
          <th style={{padding:'4px 0',fontWeight:400}}></th>
        </tr></thead>
        <tbody>
          {(standings||[]).map((s,i)=><tr key={s.team} style={{borderTop:`1px solid ${C.brd}`}}>
            <td style={{padding:'6px 0',color:i<2?C.gold:C.muted,fontFamily:"'Bebas Neue',cursive",fontSize:16}}>{i+1}</td>
            <td style={{padding:'6px 6px',color:i<2?C.txt:C.muted,fontWeight:i<2?700:400}}>{s.team}</td>
            <td style={{padding:'6px 8px',textAlign:'center',color:i<2?C.gold:C.muted,fontWeight:700}}>{s.pts}</td>
            <td style={{padding:'6px 8px',textAlign:'center',color:C.muted}}>{s.gd>=0?'+':''}{s.gd}</td>
            <td style={{padding:'6px 8px',textAlign:'center',color:C.muted}}>{s.gf}</td>
            <td style={{padding:'6px 0',textAlign:'right'}}>{i<2&&<span style={{fontSize:9,fontWeight:700,color:C.grn,border:`1px solid ${C.grn}44`,borderRadius:4,padding:'2px 5px'}}>CLASIFICA</span>}</td>
          </tr>)}
        </tbody>
      </table>
    </Card>
  </div>;
}

function ReviewFinal({allStandings,best8,r32teams,confirm,setConfirm,saving,onSubmit}){
  return <div>
    <Card sx={{marginBottom:10}}>
      <Title text="RESUMEN FINAL" sz={20} sx={{marginBottom:12}}/>
      {GK.map(g=><div key={g} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:`1px solid ${C.brd}`,fontSize:12}}>
        <span style={{color:C.muted,minWidth:55}}>Grupo {g}</span>
        <span>
          <span style={{color:C.gold,fontWeight:700}}>{allStandings[g]?.[0]?.team||'?'}</span>
          <span style={{color:C.muted}}> · </span>
          {allStandings[g]?.[1]?.team||'?'}
          <span style={{color:C.muted,fontSize:10}}> · {allStandings[g]?.[2]?.team||'?'} · {allStandings[g]?.[3]?.team||'?'}</span>
        </span>
      </div>)}
    </Card>
    <Card sx={{marginBottom:10}}>
      <Lbl text={`Mis ${r32teams.length}/32 clasificados a dieciseisavos`}/>
      <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:4}}>
        {GK.flatMap(g=>[allStandings[g]?.[0],allStandings[g]?.[1]]).filter(s=>s?.team).map(s=><span key={s.team} style={{background:'#1a3a10',color:C.grn,border:`1px solid ${C.grn}33`,borderRadius:5,padding:'3px 7px',fontSize:11}}>{s.team}</span>)}
        {best8.map(s=><span key={s.team} style={{background:'#1a280a',color:'#a3d977',border:`1px solid #a3d97733`,borderRadius:5,padding:'3px 7px',fontSize:11}}>{s.team}<span style={{opacity:.6,fontSize:10}}> {s.pts}p</span></span>)}
      </div>
    </Card>
    <div style={{background:C.card2,border:`1px solid ${C.brd}`,borderRadius:10,padding:'12px 14px',marginBottom:14,fontSize:12,color:C.muted}}>
      <span style={{color:C.gold,fontWeight:700}}>¿Qué sigue? </span>
      Cuando la FIFA publique los cruces de dieciseisavos (aprox. 27 junio), se abrirá el Tiempo 2 para predicciones eliminatorias.
    </div>
    {!confirm
      ?<Btn label="📤 Enviar predicciones del Tiempo 1" onClick={()=>setConfirm(true)}/>
      :<Card hl sx={{padding:16}}>
        <div style={{color:C.gold,fontWeight:800,fontSize:14,marginBottom:6}}>⚠ ¿Confirmar envío?</div>
        <div style={{color:C.muted,fontSize:12,marginBottom:14}}>Una vez enviado no podrás cambiar nada.</div>
        <div style={{display:'flex',gap:8}}>
          <Btn v="green" label={saving?'Enviando...':'✓ Confirmar y enviar'} dis={saving} onClick={onSubmit}/>
          <Btn v="dark" label="Cancelar" onClick={()=>setConfirm(false)}/>
        </div>
      </Card>}
  </div>;
}

// ── LEADERBOARD (requiere login) ──────────────────────────────
function Leaderboard({cfg,back}){
  const [auth,setAuth]=useState(false),[name,setName]=useState(''),[pwd,setPwd]=useState(''),[err,setErr]=useState('');
  const [list,setList]=useState([]),[rr,setRr]=useState(null),[loading,setLoading]=useState(false);

  const login=async()=>{
    if(!name.trim()||!pwd.trim()){setErr('Ingresa nombre y contraseña');return;}
    const k=pk(name.trim()),ex=await S.get(k);
    if(!ex){setErr('No encontrado');return;}
    if(ex.pwd!==pwd){setErr('Contraseña incorrecta');return;}
    setAuth(true);setLoading(true);
    Promise.all([S.list('p:'),S.get('rr')]).then(async([keys,r])=>{
      const pl=await Promise.all(keys.map(k=>S.get(k)));
      setList(pl.filter(Boolean));setRr(r||{gm:{},cl:{}});setLoading(false);
    });
  };

  if(!auth)return <div style={{maxWidth:380,margin:'0 auto',padding:'40px 20px'}}>
    <Back go={back}/><Title text="LEADERBOARD"/>
    <div style={{color:C.muted,fontSize:13,marginBottom:16}}>Solo participantes registrados pueden ver el ranking.</div>
    <Card>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <div><Lbl text="Tu nombre"/><Inp val={name} set={setName} ph="Nombre completo..."/></div>
        <div><Lbl text="Contraseña"/><Inp val={pwd} set={setPwd} type="password" ph="Tu contraseña..."/></div>
      </div>
      {err&&<div style={{color:C.red,fontSize:12,marginTop:10}}>{err}</div>}
      <Btn label="Ver leaderboard" sx={{marginTop:14}} onClick={login}/>
    </Card>
  </div>;

  if(loading)return <div style={{padding:40,textAlign:'center',color:C.muted}}>Cargando...</div>;

  const ranked=list.filter(p=>p.t1?.submitted).map(p=>({...p,...calcTotal(p.t1,rr)}))
    .sort((a,b)=>b.total!==a.total?b.total-a.total:b.exactAll-a.exactAll).slice(0,20);
  const pending=list.filter(p=>!p.t1?.submitted);
  const medals=['🥇','🥈','🥉'];

  return <div style={{maxWidth:640,margin:'0 auto',padding:16}}>
    <Back go={back}/><Title text="LEADERBOARD"/>
    <div style={{color:C.muted,fontSize:12,marginBottom:16}}>{PLBL[cfg?.phase||'setup']} · Top 20</div>
    {ranked.length===0&&<Card><div style={{color:C.muted,textAlign:'center',padding:'30px 0'}}>Nadie ha enviado predicciones aún.</div></Card>}
    {ranked.map((p,i)=><div key={p.name} style={{display:'flex',alignItems:'center',gap:12,background:i===0?'#0f2208':C.card,border:`1px solid ${i===0?C.gold:C.brd}`,borderRadius:10,padding:'12px 16px',marginBottom:7}}>
      <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:i<3?C.gold:C.muted,width:32,textAlign:'center',lineHeight:1}}>{medals[i]||i+1}</div>
      <div style={{flex:1}}>
        <div style={{fontWeight:700,fontSize:14}}>{p.name}</div>
        <div style={{fontSize:11,color:C.muted,marginTop:2}}>{p.exactAll} exactos</div>
      </div>
      <div>
        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:42,color:C.gold,lineHeight:1,textAlign:'right'}}>{p.total}</div>
        <div style={{fontSize:10,color:C.muted,textAlign:'right'}}>puntos</div>
      </div>
    </div>)}
    {pending.length>0&&<div style={{marginTop:16}}>
      <div style={{fontSize:11,color:C.muted,marginBottom:8,textTransform:'uppercase',letterSpacing:.5}}>Pendientes ({pending.length})</div>
      {pending.map(p=><div key={p.name} style={{fontSize:13,color:C.muted+'88',padding:'5px 0',borderBottom:`1px solid ${C.brd}`}}>{p.name}</div>)}
    </div>}
    <div style={{marginTop:16,padding:'10px 14px',background:C.card,borderRadius:8,border:`1px solid ${C.brd}`,fontSize:11,color:C.muted}}>
      <span style={{color:C.txt,fontWeight:700}}>Desempate: </span>marcadores exactos · Tiempo 2 define el resto
    </div>
  </div>;
}

// ── APP ROOT ──────────────────────────────────────────────────
export default function App(){
  const [screen,setScreen]=useState('home'),[cfg,setCfg]=useState(null),[loading,setLoading]=useState(true);
  useEffect(()=>{S.get('cfg').then(c=>{setCfg(c||{adminPwd:'',phase:'setup',allowedNames:[],closingDate:'',requireAuth:false});setLoading(false);});},[]);
  const saveCfg=async nc=>{await S.set('cfg',nc);setCfg(nc);};
  if(loading)return <div style={{background:'#070f06',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Nunito',sans-serif",color:C.gold,fontSize:18}}>Cargando...</div>;
  return <>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Nunito:wght@400;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0;}input[type=number]::-webkit-inner-spin-button{opacity:1;}::-webkit-scrollbar{width:4px;height:4px;}::-webkit-scrollbar-thumb{background:#1c3419;border-radius:4px;}`}</style>
    <div style={{background:'#070f06',minHeight:'100vh',fontFamily:"'Nunito',sans-serif",color:'#f0f4ef'}}>
      {screen==='home'  &&<Home  cfg={cfg} nav={setScreen}/>}
      {screen==='admin' &&<Admin cfg={cfg} saveCfg={saveCfg} back={()=>setScreen('home')}/>}
      {screen==='part'  &&<Participant cfg={cfg} back={()=>setScreen('home')}/>}
      {screen==='lb'    &&<Leaderboard cfg={cfg} back={()=>setScreen('home')}/>}
    </div>
  </>;
}
