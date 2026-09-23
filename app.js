"use strict";

const GAS_URL = "https://script.google.com/macros/s/AKfycbwWu0G4Woci939m6lvBZ2V8n5RkgrrFo3Fqplse8VPO7fltat0v-Fx0zSA00oUe2DI7/exec";
const DRAFT_KEY = "mps-plc-session-draft-v1";
const FIELD_MAP = Object.freeze({tajuk:"Tajuk",tahun:"Tahun",mataPelajaran:"Mata_Pelajaran",pengurusan:"Pengurusan",alatLain:"Alat_Lain",tarikhMula:"Tarikh_Mula",tarikhAkhir:"Tarikh_Akhir",focus:"Focus",improve:"Improve",share:"Share",disediakanOleh:"Disediakan_Oleh",disahkanOleh:"Disahkan_Oleh"});
const state = {staff:[],config:{domains:[],bidang:[],alat:[]},records:[],loaded:false,connected:false,loading:false,view:"home",step:0,editingId:"",dirty:false,saving:false,uncertain:false,group:"latest",limit:30,draft:null};
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const form = $("#plc-form");

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}
function array(value) {
  if (Array.isArray(value)) return value;
  try { const parsed=JSON.parse(value); return Array.isArray(parsed)?parsed:[]; } catch { return []; }
}
function dateInput(value) {
  if (!value) return "";
  const text=String(value);
  // Sheet dates arrive as UTC instants; convert back to the school's calendar date.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"":new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
}
function dateLabel(value) {
  const day=dateInput(value);
  return day?new Intl.DateTimeFormat("ms-MY",{day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Kuala_Lumpur"}).format(new Date(day+"T00:00:00+08:00")):"Tarikh belum tersedia";
}
function thisYear(){return Number(new Intl.DateTimeFormat("en",{year:"numeric",timeZone:"Asia/Kuala_Lumpur"}).format(new Date()));}
function staffName(id){return state.staff.find(person=>person.ID_Guru===String(id))?.Nama_Guru || String(id||"Belum ditetapkan");}
function memberId(member){return String(typeof member==="object"?(member.id||member.ID_Guru||""):member);}
function safePdfUrl(value){try{const url=new URL(value);return url.protocol==="https:"&&["drive.google.com","docs.google.com"].includes(url.hostname)?url.href:null;}catch{return null;}}
function pdfLink(url){const safe=safePdfUrl(url);if(!safe)return node("small","","PDF belum tersedia");const link=node("a","secondary","Buka PDF ↗");link.href=safe;link.target="_blank";link.rel="noopener noreferrer";return link;}
function option(value,label){const opt=node("option","",label);opt.value=String(value);return opt;}
function button(text,className,handler){const b=node("button",className,text);b.type="button";b.addEventListener("click",handler);return b;}
function toast(message){$("#toast").textContent=message;$("#toast").hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$("#toast").hidden=true,4500);}

// A text/plain JSON POST is a CORS simple request compatible with GAS doPost.
// Never use no-cors: an opaque response cannot confirm a save or return a PDF URL.
async function api(action, payload) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),payload?120000:30000);
  try {
    const url=new URL(GAS_URL);
    const options={signal:controller.signal,redirect:"follow",credentials:"omit",cache:"no-store"};
    if(payload){options.method="POST";options.headers={"Content-Type":"text/plain;charset=utf-8"};options.body=JSON.stringify({action,...payload});}
    else {url.searchParams.set("action",action);url.searchParams.set("_",Date.now());}
    const response=await fetch(url.href,options);
    if(!response.ok)throw new Error("Sambungan pelayan gagal ("+response.status+").");
    let data;
    try{data=await response.json();}catch{throw new Error("Pelayan tidak memulangkan data JSON. Semak URL dan akses deployment Apps Script.");}
    if(data.status!=="success"){const error=new Error(data.message||"Pelayan tidak dapat melengkapkan permintaan.");error.saveState=data.saveState;throw error;}
    return data;
  } catch(error) {
    if(error.name==="AbortError")throw new Error("Masa menunggu pelayan telah tamat.");
    throw error;
  } finally {clearTimeout(timer);}
}

function cleanRecord(record){
  const result={...record,ID_PLC:String(record.ID_PLC||""),Domain_Kompetensi:array(record.Domain_Kompetensi),Alat_Kolaboratif:array(record.Alat_Kolaboratif),Ahli_Kumpulan:array(record.Ahli_Kumpulan)};
  result.Tarikh_Mula=dateInput(record.Tarikh_Mula);result.Tarikh_Akhir=dateInput(record.Tarikh_Akhir);
  return result;
}
async function loadMaster(initial=false) {
  if(state.loading)return false;
  state.loading=true;
  $("#retry-bootstrap").disabled=true;
  $("#refresh-data").disabled=true;
  $("#reload-home").disabled=true;
  $("#connection").textContent="Menyelaraskan";
  $("#loader-status").textContent="Memuatkan rekod, guru dan tetapan…";
  $("#app-loader").classList.remove("connection-error");
  try {
    const data=await api("getMasterData");
    if(!Array.isArray(data.staff)||!Array.isArray(data.records)||!data.config||!["domains","bidang","alat"].every(k=>Array.isArray(data.config[k])))throw new Error("Struktur data pelayan tidak sepadan dengan backend PLC.");
    const current=state.loaded?collect():null;
    state.staff=data.staff.map(person=>({ID_Guru:String(person.ID_Guru||""),Nama_Guru:String(person.Nama_Guru||""),Jawatan:String(person.Jawatan||"")})).filter(p=>p.ID_Guru&&p.Nama_Guru);
    state.config=Object.fromEntries(["domains","bidang","alat"].map(key=>[key,data.config[key].map(item=>({kod:String(item.kod||""),label:String(item.label||"")})).filter(item=>item.label)]));
    state.records=data.records.map(cleanRecord).filter(r=>r.ID_PLC);
    state.loaded=true;state.connected=true;
    renderOptions();
    if(current)hydrate(current);else resetForm();
    renderFilters();renderDashboard();renderArchive();
    $("#connection").textContent="Disambungkan";$("#connection").className="connection online";
    $("#connection-banner").hidden=true;$("#app-loader").hidden=true;
    checkMasterReady();
    return true;
  } catch(error) {
    state.connected=false;$("#connection").textContent="Tiada sambungan";$("#connection").className="connection offline";
    $("#connection-message").textContent=(state.loaded?"Data terakhir masih dipaparkan. ":"")+"Sambungan belum tersedia. "+error.message;
    $("#connection-banner").hidden=false;
    $("#loader-status").textContent="Portal belum dapat disambungkan. "+error.message;
    $("#app-loader").classList.add("connection-error");
    $("#retry-bootstrap").hidden=false;$("#browse-shell").hidden=false;
    if(!state.loaded){renderDashboard();renderArchive();}
    if(!initial)toast("Data belum dapat disegarkan. Cuba semula apabila sambungan tersedia.");
    return false;
  } finally {state.loading=false;$("#retry-bootstrap").disabled=false;$("#refresh-data").disabled=false;$("#reload-home").disabled=false;updateSubmit();}
}
function checkMasterReady(){
  const missing=[];
  if(state.staff.length<2)missing.push("sekurang-kurangnya dua guru aktif");
  if(!state.config.domains.length)missing.push("Domain Kompetensi");
  if(!state.config.bidang.length)missing.push("Bidang PLC");
  if(!state.config.alat.length)missing.push("Alat Kolaboratif");
  if(missing.length){$("#connection-message").textContent="Lengkapkan data induk: "+missing.join(", ")+". Kemudian segarkan data.";$("#connection-banner").hidden=false;}
  return !missing.length;
}
function updateSubmit(){ $("#submit-report").disabled=!state.connected||state.saving||state.uncertain||!state.loaded||state.staff.length<2||!["domains","bidang","alat"].every(k=>state.config[k].length); $("#uncertain-banner").hidden=!state.uncertain; }
function selected(name){return $$("input[name='"+name+"']:checked",form).map(input=>input.value);}
function choices(container,items,name,type){
  $(container).replaceChildren();
  for(const item of items){const label=node("label","choice");const input=node("input");input.type=type;input.name=name;input.value=item.label;input.dataset.code=item.kod;label.append(input,node("span","",item.label));$(container).append(label);}
}
let pickerSequence=0;
function populateStaff(select,value="",placeholder="Taip nama guru…"){
  select.replaceChildren(option("",placeholder));
  state.staff.forEach(person=>select.append(option(person.ID_Guru,person.Nama_Guru)));
  if(value&&!state.staff.some(p=>p.ID_Guru===value))select.append(option(value,value+" · tidak aktif / tiada dalam senarai"));
  select.value=value;
  if(!select._picker){
    const wrapper=node("span","staff-picker");
    const input=node("input","staff-search");
    const list=node("span","staff-suggestions");
    const id="staff-suggestions-"+(++pickerSequence);
    input.type="text";input.autocomplete="off";input.placeholder="Taip nama guru…";
    input.setAttribute("role","combobox");input.setAttribute("aria-autocomplete","list");input.setAttribute("aria-expanded","false");input.setAttribute("aria-controls",id);
    list.id=id;list.setAttribute("role","listbox");list.hidden=true;
    select.hidden=true;select.tabIndex=-1;
    select.after(wrapper);wrapper.append(input,list);
    const picker={input,list,active:-1,matches:[]};select._picker=picker;
    function close(){list.hidden=true;input.setAttribute("aria-expanded","false");input.removeAttribute("aria-activedescendant");picker.active=-1;}
    function choose(person){select.value=person.ID_Guru;input.value=person.Nama_Guru;input.setCustomValidity("");close();select.dispatchEvent(new Event("change",{bubbles:true}));input.focus();}
    function highlight(){[...list.children].forEach((el,i)=>el.setAttribute("aria-selected",String(i===picker.active)));if(picker.active>=0){input.setAttribute("aria-activedescendant",list.children[picker.active].id);list.children[picker.active].scrollIntoView({block:"nearest"});}}
    function suggest(){
      const query=input.value.trim().toLocaleLowerCase("ms");list.replaceChildren();picker.active=-1;
      picker.matches=query?state.staff.filter(p=>p.Nama_Guru.toLocaleLowerCase("ms").includes(query)).slice(0,8):[];
      if(!query){close();return;}
      picker.matches.forEach((person,i)=>{const item=node("span","staff-option",person.Nama_Guru);item.id=id+"-"+i;item.setAttribute("role","option");item.setAttribute("aria-selected","false");item.addEventListener("pointerdown",e=>e.preventDefault());item.addEventListener("click",()=>choose(person));list.append(item);});
      if(!picker.matches.length)list.append(node("span","staff-no-match","Tiada padanan. Cuba nama lain."));
      list.hidden=false;input.setAttribute("aria-expanded","true");input.removeAttribute("aria-activedescendant");
    }
    input.addEventListener("input",()=>{select.value="";input.setCustomValidity(input.value.trim()?"Pilih nama daripada cadangan.":"");suggest();});
    input.addEventListener("focus",suggest);
    input.addEventListener("blur",()=>{close();input.setCustomValidity(input.value.trim()&&!select.value?"Pilih nama daripada cadangan.":"");});
    input.addEventListener("keydown",e=>{if(e.key==="Escape"){close();return;}if(["ArrowDown","ArrowUp"].includes(e.key)){e.preventDefault();if(list.hidden)suggest();if(!picker.matches.length)return;picker.active=(picker.active+(e.key==="ArrowDown"?1:-1)+picker.matches.length)%picker.matches.length;highlight();}else if(e.key==="Enter"&&!list.hidden){e.preventDefault();if(picker.active>=0)choose(picker.matches[picker.active]);}});
  }
  const input=select._picker.input;input.value=value?staffName(value):"";input.required=select.required;input.setCustomValidity("");select._picker.list.hidden=true;input.setAttribute("aria-expanded","false");
  input.setAttribute("aria-label",select.name==="member"?"Nama ahli":select.id==="disediakanOleh"?"Disediakan oleh":"Disahkan oleh");
}
function renderOptions(){
  choices("#domain-options",state.config.domains,"domainKompetensi","checkbox");
  choices("#bidang-options",state.config.bidang,"bidangPLC","radio");
  choices("#alat-options",state.config.alat,"alatKolaboratif","checkbox");
  populateStaff($("#disediakanOleh"));populateStaff($("#disahkanOleh"),"","Belum ditetapkan");
}
function ensureChoices(name,values){
  const container={domainKompetensi:"#domain-options",bidangPLC:"#bidang-options",alatKolaboratif:"#alat-options"}[name];
  values.forEach(value=>{if(!$$("input[name='"+name+"']",form).some(input=>input.value===value)){const label=node("label","choice legacy");const input=node("input");input.name=name;input.type=name==="bidangPLC"?"radio":"checkbox";input.value=value;label.append(input,node("span","",value+" · pilihan rekod terdahulu"));$(container).append(label);}});
  $$("input[name='"+name+"']",form).forEach(input=>input.checked=values.includes(input.value));
}
function conditionalFields(){
  const bidang=selected("bidangPLC")[0]||"";
  const selectedInput=$("input[name='bidangPLC']:checked",form);
  const code=selectedInput?.dataset.code;
  const subject=code==="B01"||code==="B03"||/pengajaran|pembelajaran|pdp/i.test(bidang);
  const management=code==="B02"||code==="B03"||/pengurusan/i.test(bidang);
  const other=$$("input[name='alatKolaboratif']:checked",form).some(input=>input.dataset.code==="A13"||/lain/i.test(input.value));
  [["subject-wrap","mataPelajaran",subject],["management-wrap","pengurusan",management],["other-wrap","alatLain",other]].forEach(([wrap,id,show])=>{$("#"+wrap).hidden=!show;$("#"+id).disabled=!show;$("#"+id).required=show;});
  $("#focus-date").textContent=$("#tarikhMula").value?dateLabel($("#tarikhMula").value):"";
  $("#share-date").textContent=$("#tarikhAkhir").value?dateLabel($("#tarikhAkhir").value):"";
  $("#tarikhAkhir").min=$("#tarikhMula").value;
}
function addMember(value=""){
  const row=node("div","member-row");const label=node("label");const caption=node("span");const select=node("select");select.name="member";select.required=true;label.append(caption,select);populateStaff(select,value);
  row.append(label,button("×","",()=>{row.remove();numberMembers();markDirty();}));$("#member-list").append(row);numberMembers();
}
function numberMembers(){$$(".member-row").forEach((row,index)=>{$("label>span",row).textContent="Ahli "+(index+1);$(".staff-search",row).setAttribute("aria-label","Ahli "+(index+1));$("button",row).setAttribute("aria-label","Buang ahli "+(index+1));$("button",row).disabled=$$(".member-row").length<=2;});}
function collect(){
  const data={idPLC:state.editingId};
  Object.keys(FIELD_MAP).forEach(key=>{data[key]=$("#"+key).disabled?"":$("#"+key).value.trim();});
  return {...data,domainKompetensi:selected("domainKompetensi"),bidangPLC:selected("bidangPLC")[0]||"",alatKolaboratif:selected("alatKolaboratif"),ahliKumpulan:$$("select[name='member']").map(select=>select.value).filter(Boolean)};
}
function resetForm(){
  form.reset();populateStaff($("#disediakanOleh"));populateStaff($("#disahkanOleh"));state.editingId="";state.dirty=false;state.uncertain=false;
  $$(".legacy",form).forEach(el=>el.remove());
  $("#tahun").value=thisYear();$("#member-list").replaceChildren();addMember();addMember();
  $("#edit-banner").hidden=true;$("#submit-report").textContent="Simpan & jana PDF";
  $("#form-error").hidden=true;conditionalFields();setStep(0,false);updateSubmit();showDraftBanner();
}
function hydrate(data){
  state.editingId=String(data.idPLC||"");
  Object.keys(FIELD_MAP).forEach(key=>$("#"+key).value=data[key]??"");
  ensureChoices("domainKompetensi",array(data.domainKompetensi));ensureChoices("bidangPLC",data.bidangPLC?[data.bidangPLC]:[]);ensureChoices("alatKolaboratif",array(data.alatKolaboratif));
  populateStaff($("#disediakanOleh"),String(data.disediakanOleh||""));populateStaff($("#disahkanOleh"),String(data.disahkanOleh||""),"Belum ditetapkan");
  $("#member-list").replaceChildren();array(data.ahliKumpulan).forEach(id=>addMember(memberId(id)));while($$(".member-row").length<2)addMember();
  $("#edit-banner").textContent="Mengemas kini · "+state.editingId;$("#edit-banner").hidden=!state.editingId;
  $("#submit-report").textContent=state.editingId?"Kemas kini & jana PDF":"Simpan & jana PDF";conditionalFields();updateSubmit();
}
function readDraft(){try{return JSON.parse(sessionStorage.getItem(DRAFT_KEY));}catch{return null;}}
function writeDraft(){
  const draft={data:collect(),step:state.step,uncertain:state.uncertain,savedAt:new Date().toISOString()};state.draft=draft;
  try{sessionStorage.setItem(DRAFT_KEY,JSON.stringify(draft));$("#draft-status").textContent="Draf sesi disimpan · "+new Date().toLocaleTimeString("ms-MY",{hour:"2-digit",minute:"2-digit"});}catch{$("#draft-status").textContent="Draf tidak dapat disimpan. Pastikan tab ini kekal terbuka.";}
}
function clearDraft(){state.draft=null;try{sessionStorage.removeItem(DRAFT_KEY);}catch{}$("#draft-banner").hidden=true;}
function markDirty(){if(state.saving)return;state.dirty=true;$("#form-error").hidden=true;conditionalFields();writeDraft();}
function showDraftBanner(){$("#draft-banner").hidden=!state.draft||state.dirty||!!state.editingId;}
function restoreDraft(){if(!state.loaded){toast("Sambungkan portal sebelum menyambung draf.");return;}const draft=state.draft;if(!draft?.data)return;hydrate(draft.data);state.dirty=true;state.uncertain=!!draft.uncertain;setStep(Math.min(3,Math.max(0,Number(draft.step)||0)),false);$("#draft-banner").hidden=true;updateSubmit();if(state.uncertain)showUncertain();}
function setStep(step,focus=true){
  state.step=step;$$("[data-panel]").forEach(panel=>panel.hidden=Number(panel.dataset.panel)!==step);
  $$("[data-step]").forEach(b=>{if(Number(b.dataset.step)===step)b.setAttribute("aria-current","step");else b.removeAttribute("aria-current");});
  $("#previous-step").hidden=step===0;$("#next-step").hidden=step===3;$("#submit-report").hidden=step!==3;$("#step-count").textContent="Bahagian "+(step+1)+" daripada 4";
  if(focus){const heading=$("[data-panel='"+step+"'] h2");heading.tabIndex=-1;heading.focus();heading.scrollIntoView({block:"start",behavior:"smooth"});}
}
function fail(message,step,element){setStep(step,false);const box=$("#form-error");box.textContent=message;box.hidden=false;box.focus();box.scrollIntoView({block:"center"});if(element)element.setAttribute("aria-invalid","true");return false;}
function validateStep(step){
  $("#form-error").hidden=true;$$("[aria-invalid]",form).forEach(el=>el.removeAttribute("aria-invalid"));
  const panel=$("[data-panel='"+step+"']");
  for(const input of $$("input,select,textarea",panel)){
    if(input.disabled||["radio","checkbox"].includes(input.type))continue;
    if((input.required&&!input.value.trim())||!input.checkValidity())return fail("Sila lengkapkan medan wajib dengan nilai yang sah: "+(input.labels?.[0]?.textContent.trim()||input.name)+".",step,input);
  }
  if(step===0&&!selected("domainKompetensi").length)return fail("Pilih sekurang-kurangnya satu Domain Kompetensi.",step);
  if(step===0&&!selected("bidangPLC").length)return fail("Pilih satu Bidang KPP / PLC.",step);
  if(step===1&&!selected("alatKolaboratif").length)return fail("Pilih sekurang-kurangnya satu Alat Kolaboratif.",step);
  if(step===1&&$("#tarikhAkhir").value<$("#tarikhMula").value)return fail("Tarikh akhir tidak boleh sebelum tarikh mula.",step,$("#tarikhAkhir"));
  if(step===3){const members=collect().ahliKumpulan;if(new Set(members).size<2)return fail("Pilih sekurang-kurangnya dua orang ahli berbeza.",step);if(new Set(members).size!==members.length)return fail("Nama ahli yang sama telah dipilih lebih daripada sekali.",step);}
  return true;
}
function confirmLeave(){
  return new Promise(resolve=>{const dialog=$("#confirm-dialog");dialog.showModal();const finish=value=>{dialog.close();$("#confirm-leave").onclick=null;$("#confirm-cancel").onclick=null;dialog.oncancel=null;resolve(value);};$("#confirm-leave").onclick=()=>finish(true);$("#confirm-cancel").onclick=()=>finish(false);dialog.oncancel=e=>{e.preventDefault();finish(false);};});
}
async function navigate(view){
  if(state.saving)return;
  if(view===state.view){if(view==="form")showDraftBanner();return;}
  if(state.view==="form"&&state.dirty){writeDraft();if(!await confirmLeave())return;}
  if(view==="form"&&!state.dirty)resetForm();
  state.view=view;
  $$(".view").forEach(section=>section.hidden=section.id!==view+"-view");
  $$(".nav-link").forEach(link=>{link.classList.toggle("active",link.dataset.nav===view);if(link.dataset.nav===view)link.setAttribute("aria-current","page");else link.removeAttribute("aria-current");});
  $("#main-nav").classList.remove("open");$("#menu-button").setAttribute("aria-expanded","false");
  if(view==="form")showDraftBanner();if(view==="archive")renderArchive();
  window.scrollTo({top:0,behavior:"instant"});$("#main").focus({preventScroll:true});
}
function renderDashboard(){
  const yearRecords=state.records.filter(record=>Number(record.Tahun)===thisYear());
  const teachers=new Set(yearRecords.flatMap(record=>record.Ahli_Kumpulan.map(memberId)).filter(Boolean));
  [["stat-year",yearRecords.length],["stat-teachers",teachers.size],["stat-total",state.records.length],["stat-staff",state.staff.length]].forEach(([id,value])=>$("#"+id).textContent=state.loaded?value:"—");
  const list=$("#recent-list");list.replaceChildren();
  if(!state.loaded){list.append(node("p","empty-state","Sambungkan portal untuk memuatkan aktiviti sekolah."));return;}
  const recent=sortedRecords().slice(0,5);
  if(!recent.length){const empty=node("div","empty-state");empty.append(node("strong","","Belum ada laporan PLC."),node("p","","Mulakan dokumentasi pembelajaran bersama anda."),button("+ Cipta laporan pertama","text-button",()=>navigate("form")));list.append(empty);return;}
  recent.forEach(record=>{const row=node("div","recent-row"),copy=node("div"),actions=node("div","record-actions");copy.append(node("span","record-title",record.Tajuk),node("span","record-meta",dateLabel(record.Tarikh_Mula)+" · "+staffName(record.Disediakan_Oleh)));actions.append(pdfLink(record.PDF_URL));row.append(copy,actions);list.append(row);});
}
function sortedRecords(){return [...state.records].sort((a,b)=>new Date(b.Tarikh_Kemaskini||b.Timestamp||0)-new Date(a.Tarikh_Kemaskini||a.Timestamp||0));}
function fillFilter(id,values,placeholder){const select=$(id),previous=select.value;select.replaceChildren(option("",placeholder));[...new Set(values.filter(Boolean).map(String))].sort((a,b)=>id==="#filter-year"?Number(b)-Number(a):a.localeCompare(b,"ms")).forEach(value=>select.append(option(value,value)));select.value=previous;}
function renderFilters(){fillFilter("#filter-year",state.records.map(r=>r.Tahun),"Semua tahun");fillFilter("#filter-bidang",[...state.config.bidang.map(i=>i.label),...state.records.map(r=>r.Bidang_PLC)],"Semua bidang");fillFilter("#filter-alat",[...state.config.alat.map(i=>i.label),...state.records.flatMap(r=>r.Alat_Kolaboratif)],"Semua alat");}
function filteredRecords(){
  const query=$("#archive-search").value.trim().toLocaleLowerCase("ms");
  return sortedRecords().filter(record=>{
    const haystack=[record.Tajuk,record.ID_PLC,staffName(record.Disediakan_Oleh),...record.Ahli_Kumpulan.map(m=>typeof m==="object"?m.nama||staffName(memberId(m)):staffName(m))].join(" ").toLocaleLowerCase("ms");
    return (!query||haystack.includes(query))&&(!$("#filter-year").value||String(record.Tahun)===$("#filter-year").value)&&(!$("#filter-bidang").value||record.Bidang_PLC===$("#filter-bidang").value)&&(!$("#filter-alat").value||record.Alat_Kolaboratif.includes($("#filter-alat").value));
  });
}
function archiveRow(record){
  const row=node("article","archive-row"),date=node("div","archive-date"),copy=node("div"),actions=node("div","record-actions");
  date.append(node("strong","",dateLabel(record.Tarikh_Mula)),node("span","",record.Tahun||""));copy.append(node("span","record-title",record.Tajuk),node("span","record-meta",staffName(record.Disediakan_Oleh)+" · "+record.Ahli_Kumpulan.length+" ahli · "+record.ID_PLC),node("span","record-meta",record.Alat_Kolaboratif.join(" · ")),node("span","badge",record.Bidang_PLC));
  actions.append(pdfLink(record.PDF_URL));const edit=button("Edit","secondary",()=>editRecord(record.ID_PLC));edit.setAttribute("aria-label","Edit "+record.Tajuk);actions.append(edit);row.append(date,copy,actions);return row;
}
function renderArchive(){
  const list=$("#archive-list");list.replaceChildren();
  if(!state.loaded){list.append(node("p","empty-state","Rekod belum dimuatkan. Sambungkan portal untuk melihat arkib."));$("#archive-count").textContent="";$("#load-more").hidden=true;return;}
  const all=filteredRecords(),records=all.slice(0,state.limit);$("#archive-count").textContent=all.length+" laporan";$("#load-more").hidden=records.length>=all.length;
  if(!records.length){const empty=node("div","empty-state");empty.append(node("strong","",state.records.length?"Tiada padanan ditemui.":"Arkib anda bermula di sini."),node("p","",state.records.length?"Cuba kata kunci atau penapis yang lain.":"Laporan yang disimpan akan dipaparkan di sini."));list.append(empty);return;}
  if(state.group==="latest"){records.forEach(record=>list.append(archiveRow(record)));return;}
  const groups=new Map();records.forEach(record=>{const key=state.group==="officer"?staffName(record.Disediakan_Oleh):(record.Bidang_PLC||"Belum ditetapkan");if(!groups.has(key))groups.set(key,[]);groups.get(key).push(record);});
  [...groups.keys()].sort((a,b)=>a.localeCompare(b,"ms")).forEach(key=>{list.append(node("h2","archive-group-title",key+" · "+groups.get(key).length));groups.get(key).forEach(record=>list.append(archiveRow(record)));});
}
function recordPayload(record){const data={idPLC:record.ID_PLC,domainKompetensi:record.Domain_Kompetensi,bidangPLC:record.Bidang_PLC,alatKolaboratif:record.Alat_Kolaboratif,ahliKumpulan:record.Ahli_Kumpulan.map(memberId)};Object.entries(FIELD_MAP).forEach(([key,column])=>data[key]=record[column]||"");return data;}
async function editRecord(id){
  if(state.saving)return;
  if(!state.connected){toast("Sambungkan portal untuk mendapatkan rekod terkini sebelum mengedit.");return;}
  if(state.dirty&&!await confirmLeave())return;
  showStatus("Memuatkan laporan.","Mendapatkan rekod terkini untuk dikemas kini.",true);
  try{const data=await apiGetRecord(id);if(!data.record||String(data.record.ID_PLC)!==id)throw new Error("Rekod yang diterima tidak sepadan.");state.dirty=false;await navigate("form");resetForm();hydrate(recordPayload(cleanRecord(data.record)));setStep(0,false);$("#draft-banner").hidden=true;$("#status-dialog").close();}
  catch(error){showStatus("Rekod belum dapat dibuka.",error.message,false);$("#status-actions").append(button("Tutup","secondary",()=>$("#status-dialog").close()));}
}
async function apiGetRecord(id){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{const url=new URL(GAS_URL);url.searchParams.set("action","getRecord");url.searchParams.set("id",id);url.searchParams.set("_",Date.now());const response=await fetch(url.href,{signal:controller.signal,credentials:"omit",redirect:"follow",cache:"no-store"});if(!response.ok)throw new Error("Rekod tidak dapat dimuatkan.");const data=await response.json();if(data.status!=="success")throw new Error(data.message||"Rekod tidak dijumpai.");return data;}finally{clearTimeout(timer);}
}
function showStatus(title,message,processing){
  $("#status-title").textContent=title;$("#status-message").textContent=message;$("#processing-indicator").hidden=!processing;$("#status-actions").replaceChildren();const dialog=$("#status-dialog");dialog.dataset.processing=String(processing);if(!dialog.open)dialog.showModal();
}
function showUncertain(message=""){
  showStatus("Status simpanan perlu disemak.",(message?message+" ":"")+"Laporan mungkin telah diproses oleh pelayan. Semak arkib sebelum menghantar sekali lagi untuk mengelakkan rekod berganda. Draf anda dikekalkan.",false);
  $("#status-actions").append(button("Semak arkib","primary",async()=>{const ok=await loadMaster();if(ok){$("#status-dialog").close();state.dirty=false;await navigate("archive");state.dirty=true;toast("Semak laporan terkini. Gunakan Edit jika laporan sudah tersedia.");}}),button("Kembali ke borang","secondary",()=>{$("#status-dialog").close();navigate("form");}),button("Saya telah semak; belum disimpan","text-button",()=>{state.uncertain=false;writeDraft();updateSubmit();$("#status-dialog").close();toast("Draf sedia untuk dihantar semula selepas semakan anda.");}));
}
async function saveReport(event){
  event.preventDefault();if(state.saving||!state.connected||!state.loaded)return;
  if(state.uncertain){showUncertain();return;}
  for(let step=0;step<4;step++)if(!validateStep(step))return;
  const payload=collect();state.saving=true;state.uncertain=true;writeDraft();updateSubmit();form.setAttribute("aria-busy","true");
  showStatus("Memproses laporan.","Laporan sedang dihantar untuk penjanaan PDF dan penyimpanan ke Google Drive. Sila tunggu sehingga pengesahan diterima.",true);
  const slow=setTimeout(()=>{$("#status-message").textContent="Pelayan masih memproses laporan. Penjanaan PDF boleh mengambil masa. Jangan hantar semula atau tutup tab ini.";},20000);
  try {
    const result=await api("savePLC",payload);
    if(!result.idPLC||!safePdfUrl(result.pdfUrl))throw new Error("Pengesahan simpanan atau pautan PDF tidak lengkap.");
    const old=state.records.find(r=>r.ID_PLC===String(result.idPLC));
    const record={ID_PLC:String(result.idPLC),Timestamp:old?.Timestamp||new Date().toISOString(),Tarikh_Kemaskini:new Date().toISOString(),Domain_Kompetensi:payload.domainKompetensi,Bidang_PLC:payload.bidangPLC,Alat_Kolaboratif:payload.alatKolaboratif,Ahli_Kumpulan:payload.ahliKumpulan.map(id=>({id,nama:staffName(id)})),PDF_URL:result.pdfUrl,PDF_File_ID:result.pdfFileId||""};
    Object.entries(FIELD_MAP).forEach(([key,column])=>record[column]=payload[key]);state.records=[cleanRecord(record),...state.records.filter(r=>r.ID_PLC!==record.ID_PLC)];
    state.uncertain=false;state.dirty=false;clearDraft();state.editingId=record.ID_PLC;hydrate({...payload,idPLC:record.ID_PLC});renderFilters();renderDashboard();renderArchive();
    showStatus("Laporan berjaya disimpan.","PDF telah dijana dan disimpan ke Google Drive. ID laporan: "+record.ID_PLC,false);
    $("#status-actions").append(pdfLink(result.pdfUrl),button("Lihat arkib","secondary",()=>{$("#status-dialog").close();navigate("archive");}),button("Laporan baharu","text-button",()=>{$("#status-dialog").close();resetForm();navigate("form");}));
  } catch(error){
    if(error.saveState==="not_saved"){
      state.uncertain=false;writeDraft();showStatus("Laporan belum disimpan.",error.message+" Draf anda dikekalkan. Betulkan masalah dan cuba semula.",false);
      $("#status-actions").append(button("Kembali ke borang","primary",()=>$("#status-dialog").close()));
    }else{writeDraft();showUncertain(error.message);}
  }
  finally {clearTimeout(slow);state.saving=false;form.removeAttribute("aria-busy");updateSubmit();}
}

function setup(){
  state.draft=readDraft();if(!state.draft?.data)state.draft=null;
  $("#tahun").value=thisYear();addMember();addMember();showDraftBanner();
  $$("[data-nav]").forEach(b=>b.addEventListener("click",e=>{e.preventDefault();navigate(b.dataset.nav);}));
  $$("[data-scroll]").forEach(b=>b.addEventListener("click",()=>$("#"+b.dataset.scroll).scrollIntoView({behavior:"smooth"})));
  $("#menu-button").addEventListener("click",()=>{const open=$("#main-nav").classList.toggle("open");$("#menu-button").setAttribute("aria-expanded",String(open));});
  $("#retry-bootstrap").addEventListener("click",()=>loadMaster(true));$("#browse-shell").addEventListener("click",()=>$("#app-loader").hidden=true);
  $("#refresh-data").addEventListener("click",()=>loadMaster());$("#reload-home").addEventListener("click",()=>loadMaster());
  form.addEventListener("input",markDirty);form.addEventListener("change",markDirty);form.addEventListener("submit",saveReport);
  $("#add-member").addEventListener("click",()=>{addMember();$$(".member-row .staff-search").at(-1).focus();markDirty();});
  $("#next-step").addEventListener("click",()=>{if(validateStep(state.step)){setStep(state.step+1);if(state.dirty)writeDraft();}});
  $("#previous-step").addEventListener("click",()=>setStep(state.step-1));
  $$("[data-step]").forEach(b=>b.addEventListener("click",()=>{const target=Number(b.dataset.step);if(target>state.step){for(let i=state.step;i<target;i++)if(!validateStep(i))return;}setStep(target);}));
  $("#restore-draft").addEventListener("click",restoreDraft);$("#discard-draft").addEventListener("click",clearDraft);
  $("#review-save-status").addEventListener("click",()=>showUncertain());
  ["archive-search","filter-year","filter-bidang","filter-alat"].forEach(id=>$("#"+id).addEventListener(id==="archive-search"?"input":"change",()=>{state.limit=30;renderArchive();}));
  $("#reset-filters").addEventListener("click",()=>{["archive-search","filter-year","filter-bidang","filter-alat"].forEach(id=>$("#"+id).value="");state.limit=30;renderArchive();});
  $$("[data-group]").forEach(b=>b.addEventListener("click",()=>{state.group=b.dataset.group;$$("[data-group]").forEach(el=>el.setAttribute("aria-pressed",String(el===b)));renderArchive();}));
  $("#load-more").addEventListener("click",()=>{state.limit+=30;renderArchive();});
  $("#status-dialog").addEventListener("cancel",e=>{if($("#status-dialog").dataset.processing==="true")e.preventDefault();});
  window.addEventListener("beforeunload",e=>{if(state.dirty||state.saving){e.preventDefault();e.returnValue="";}});
  loadMaster(true);
}
setup();
