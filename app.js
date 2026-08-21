// Wishlist Studio v5.2 — ajout OAK + FORT du 20 août 2026
// Rebranché sur Supabase (voir db.js) à la place du localStorage — étape 5
// de la migration.

const ICON_SPARKLE='<svg class="icon-red" viewBox="0 0 24 24" width="15" height="15" fill="currentColor" style="vertical-align:-2px"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z"/></svg>';
const ICON_CART='<svg class="icon-red" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M2 3h2l2.6 12.4a1.8 1.8 0 0 0 1.8 1.6h8a1.8 1.8 0 0 0 1.8-1.4L21 7H5.5"/></svg>';
const ICON_CAMERA='<svg class="icon-red" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
const COLOR_SWATCH={'Noir':'#111','Blanc / écru':'#f2ede2','Brun / beige':'#8a6a4c','Bleu':'#3a5a8c','Rouge':'#c8283d','Orange':'#d97a34','Rose / violet':'#b06aa0','Vert / olive':'#6f7d4a','Jaune':'#d9b23c','Gris / métallisé':'#9a9a9a','Motifs / multicolore':'linear-gradient(135deg,#c8283d,#3a5a8c,#d9b23c)','Autre':'#6f6a63'};
const NAV=[['home','Accueil'],{group:'wishlist',label:'Wishlist',pages:[['catalog','Catalogue'],['shopping','Personal Shopper'],['purchases','Achats']],related:['cart','trash']},['wardrobe','Vestiaire'],['collections','Collections']];
let route={page:'home',filter:{}};
let collectionTarget=null;
let editTarget=null;
let transientImage='';
let quickImages=[];
let purchaseTargets=[];
let homeExploreTab='categories';
let filtersOpen=false;
let editorExtraImages=[];
let editorMainPreview='';
let editMode='wishlist';
let outfitEditTarget=null;
let outfitDraftPhotos=[];

// === État + synchronisation Supabase (remplace patches/customItems/localStorage) ===
let state=null;
let lastSynced=null;

async function persist(){
  try{ lastSynced=await DB.persistState(state,lastSynced); }
  catch(e){ console.error(e); toast('Erreur de synchronisation — réessaie dans un instant.'); }
}
function mergedItems(){return [...state.articles,...state.wardrobeItems]}
function liveItems(){return mergedItems().filter(x=>!state.trash.includes(x.uid))}
function locateItem(uid){
  let i=state.articles.findIndex(x=>x.uid===uid); if(i>=0) return {arr:state.articles,i};
  i=state.wardrobeItems.findIndex(x=>x.uid===uid); if(i>=0) return {arr:state.wardrobeItems,i};
  return null;
}
function byId(uid){const loc=locateItem(uid);return loc?loc.arr[loc.i]:null}
// Applique un patch à un article/pièce existant. Si le patch change son
// statut "possédé", l'objet change aussi de liste (wishlist <-> vestiaire) —
// c'est la seule vraie complexité ajoutée par le passage à deux tables
// séparées plutôt qu'un seul tas d'objets comme avant.
function applyItemPatch(uid,patch){
  const loc=locateItem(uid); if(!loc) return;
  const item=Object.assign({},loc.arr[loc.i],patch);
  const shouldBeWardrobe=item.owned===true;
  const currentlyWardrobe=loc.arr===state.wardrobeItems;
  if(shouldBeWardrobe!==currentlyWardrobe){
    loc.arr.splice(loc.i,1);
    (shouldBeWardrobe?state.wardrobeItems:state.articles).unshift(item);
  }else{
    loc.arr[loc.i]=item;
  }
}

function itemImages(x){const main=x?.image_url||'';const extras=Array.isArray(x?.images)?x.images:[];return [...new Set([main,...extras].filter(Boolean))]}
function mainImage(x){return itemImages(x)[0]||''}
function wardrobeDecision(x){return x?.wardrobe_status||(isPurchased(x)?'Garder':'À trier')}
function isInWardrobe(x){if(!x||x.wardrobe_active===false)return false;return !!(isPurchased(x)||x.owned===true)}
function outfitById(id){return (state.outfits||[]).find(o=>o.id===id||o.uid===id)}
function outfitsForItem(uid){return (state.outfits||[]).filter(o=>Array.isArray(o.itemIds)&&(o.itemIds||[]).includes(uid))}
function outfitCoverImages(o){if(!o)return[];const own=Array.isArray(o.photos)?o.photos.filter(Boolean):[];if(own.length)return own;return (o.itemIds||[]).map(byId).filter(Boolean).flatMap(x=>itemImages(x).slice(0,1)).filter(Boolean)}
function entityImage(e){return e?.entity_type==='outfit'?(outfitCoverImages(e)[0]||''):mainImage(e)}
function entityById(id){return byId(id)||outfitById(id)}

function esc(s=''){return String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
function safeUrl(u=''){try{const x=new URL(u);return ['http:','https:'].includes(x.protocol)?u:'#'}catch(e){return '#'}}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(window.__tt);window.__tt=setTimeout(()=>t.classList.remove('show'),1800)}
function navRender(){
  let activeGroup=null;
  document.getElementById('nav').innerHTML=NAV.map(e=>{
    if(e.group){
      const active=e.pages.some(([p])=>p===route.page)||e.related.includes(route.page);
      if(active)activeGroup=e;
      return `<button class="${active?'active':''}" onclick="go('${e.pages[0][0]}')">${e.label}</button>`;
    }
    const [p,l]=e;
    return `<button class="${route.page===p?'active':''}" onclick="go('${p}')">${l}</button>`;
  }).join('');
  const subnavEl=document.getElementById('subnav');
  subnavEl.classList.toggle('hide',!activeGroup);
  subnavEl.innerHTML=activeGroup?activeGroup.pages.map(([p,l])=>`<button class="${route.page===p?'active':''}" onclick="go('${p}')">${l}</button>`).join(''):'';
  const cc=state.cart.length,tc=state.trash.length;setCount('cartCount',cc);setCount('trashCount',tc)
}
function setCount(id,n){const el=document.getElementById(id);el.textContent=n;el.classList.toggle('hide',!n)}
function go(page,filter={}){route={page,filter};window.scrollTo({top:0,behavior:'smooth'});const v=document.getElementById('view');v.classList.add('view-out');setTimeout(()=>{render();v.classList.remove('view-out')},110)}
function render(){navRender();const v=document.getElementById('view'); if(route.page==='home')v.innerHTML=homeView();else if(route.page==='catalog')v.innerHTML=catalogView();else if(route.page==='wardrobe')v.innerHTML=wardrobeView();else if(route.page==='collections')v.innerHTML=collectionsView();else if(route.page==='purchases')v.innerHTML=purchasesView();else if(route.page==='cart')v.innerHTML=cartView();else if(route.page==='trash')v.innerHTML=trashView();else if(route.page==='outfit'){const o=outfitById(route.filter.id);v.innerHTML=o?outfitDetailView(o):'<div class="empty">Tenue introuvable.</div>';if(o)initMediaCarousels(v)}else if(route.page==='style'){v.innerHTML=`<div class="catalog-head"><div><h1>Mon Style</h1></div></div><div class="form" id="styleModalBody"><p style="color:var(--muted)">Chargement…</p></div>`;loadStyleView()}else if(route.page==='shopping'){v.innerHTML=`<div class="catalog-head"><div><h1>Personal Shopper</h1></div></div><div class="form" id="shoppingModalBody"></div>`;renderShoppingModal()}wireAfterRender()}
function countBy(arr,key){return arr.reduce((a,x)=>{const k=x[key]||'Autre';a[k]=(a[k]||0)+1;return a},{})}
function uniq(arr){return [...new Set(arr.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'fr'))}
function priceTotals(items){const t={};items.forEach(x=>{if(Number.isFinite(Number(x.price_num))){const c=x.currency&&x.currency!=='Non précisée'?x.currency:'?';t[c]=(t[c]||0)+Number(x.price_num)}});return t}
function isPurchased(x){return !!(x&&(x.purchased===true||x.status==='Acheté'))}
function hasNumeric(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))}
function pieceNumber(x){return typeof x?.id==='number'?x.id:(String(x?.id||'').match(/^\d+$/)?Number(x.id):null)}
function formatMoney(n,c){if(!hasNumeric(n))return '—';const num=Number(n);return `${num.toLocaleString('fr-CA',{minimumFractionDigits:num%1?2:0,maximumFractionDigits:2})} ${c&&c!=='Non précisée'?c:''}`.trim()}
function paidValue(x){return hasNumeric(x?.paid_price_num)?Number(x.paid_price_num):(isPurchased(x)&&hasNumeric(x?.price_num)?Number(x.price_num):null)}
function purchaseTotals(items){const t={};items.forEach(x=>{const n=paidValue(x);if(hasNumeric(n)){const c=(x.paid_currency||x.currency)&&((x.paid_currency||x.currency)!=='Non précisée')?(x.paid_currency||x.currency):'?';t[c]=(t[c]||0)+n}});return t}
function normalizeText(v=''){return String(v??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()}
function searchHaystack(x){const n=pieceNumber(x);const aliases=n!==null?[`piece ${n}`,`pièce ${n}`,`article ${n}`,`#${n}`,`${x.category||''} ${n}`,`${x.subcategory||''} ${n}`]:[];return normalizeText([x.name,x.brand,x.store,x.color,x.category,x.subcategory,x.supercategory,x.note,x.uid,x.id,(x.tags||[]).join(' '),...aliases].join(' '))}
const FAVORITES_COLLECTION={id:'__favorites',name:'Favoris',emoji:'♥',description:'',virtual:true};
function displayCollections(){return [FAVORITES_COLLECTION,...state.collections]}
function collectionIds(c){if(!c)return[];return c.id==='__favorites'?state.favorites:(c.items||[])}
function collectionItems(c){return collectionIds(c).map(byId).filter(x=>x&&!state.trash.includes(x.uid))}
function collectionOutfits(c){if(!c||c.id==='__favorites')return[];return collectionIds(c).map(outfitById).filter(Boolean)}
function collectionEntities(c){return [...collectionItems(c),...collectionOutfits(c)]}
function collectionById(id){return id==='__favorites'?FAVORITES_COLLECTION:state.collections.find(c=>c.id===id)}
function featuredHomeItem(items){
 const candidates=items.filter(x=>!isPurchased(x));
 const pool=candidates.length?candidates:items;
 return pool.slice().sort((a,b)=>{const d=(b.date_added||'').localeCompare(a.date_added||'');return d||String(b.uid).localeCompare(String(a.uid),undefined,{numeric:true})})[0]||null
}
function homeRepresentative(items,key,value){
 return items.filter(x=>x[key]===value).slice().sort((a,b)=>{const d=(b.date_added||'').localeCompare(a.date_added||'');return d||String(b.uid).localeCompare(String(a.uid),undefined,{numeric:true})})[0]||null
}
function setHomeExploreTab(tab){homeExploreTab=tab;render()}
function homeExploreView(items,supers,stores,cats){
 if(homeExploreTab==='stores'){
   const storeTop=Object.entries(stores).filter(([st,n])=>st&&n).sort((a,b)=>b[1]-a[1]).slice(0,12);
   return storeTop.map(([st,n])=>{const x=homeRepresentative(items,'store',st);const img=x?mainImage(x):'';return `<button class="home-nav-card" onclick="go('catalog',{store:'${esc(st)}'})">${img?`<img src="${img}" alt="">`:''}<span class="home-nav-overlay"></span><span class="home-nav-copy"><strong>${esc(st)}</strong><span>${n} article${n>1?'s':''}</span></span></button>`}).join('')
 }
 return cats.filter(c=>supers[c]).map(c=>{const x=homeRepresentative(items,'supercategory',c);const img=x?mainImage(x):'';const n=supers[c]||0;return `<button class="home-nav-card" onclick="go('catalog',{supercategory:'${esc(c)}'})">${img?`<img src="${img}" alt="">`:''}<span class="home-nav-overlay"></span><span class="home-nav-copy"><strong>${esc(c)}</strong><span>${n} article${n>1?'s':''}</span></span></button>`}).join('')
}
function homeView(){
 const items=liveItems(), supers=countBy(items,'supercategory'), stores=countBy(items,'store');
 const cats=['Vêtements','Chaussures','Bijoux','Accessoires','Technologies','Jeux','Livres','Maison','Beauté','Autre'];
 const featured=featuredHomeItem(items);
 const latest=items.slice().filter(x=>!featured||x.uid!==featured.uid).sort((a,b)=>{const d=(b.date_added||'').localeCompare(a.date_added||'');return d||String(b.uid).localeCompare(String(a.uid),undefined,{numeric:true})}).slice(0,12);
 const featureImg=featured?mainImage(featured):'';
 const num=featured?pieceNumber(featured):null;
 const featurePrice=featured?(featured.price||((featured.price_num!==null&&featured.price_num!==undefined)?`${featured.price_num} ${featured.currency||''}`:'Prix non précisé')):'';
 const featureQuery=num!==null?`pièce ${num}`:(featured?featured.name:'');
 return `<section class="home-focus">
   ${featured?`<div class="home-feature">${featureImg?`<img src="${featureImg}" alt="${esc(featured.name)}">`:''}<span class="home-feature-shade"></span><div class="home-feature-copy"><span class="eyebrow">${num!==null?`Pièce #${num} · `:''}Dernier ajout</span><h1>${esc(featured.name)}</h1><p>${esc(featured.brand||featured.store||'')} ${featurePrice?`· ${esc(featurePrice)}`:''}</p><div class="home-feature-actions"><button class="btn" onclick="go('catalog',{q:'${esc(featureQuery)}'})">Voir la pièce</button><button class="btn primary" onclick="openQuickAdd()">+ Ajouter</button></div></div></div>`:`<div class="home-feature"><div class="home-feature-copy"><h1>Aucun article pour l'instant</h1><div class="home-feature-actions"><button class="btn" onclick="openQuickAdd()">+ Ajouter</button></div></div></div>`}
   <div class="home-focus-side"><button class="home-kpi" onclick="go('catalog')"><b>${items.length}</b><span>articles actifs</span></button><button class="home-kpi" onclick="go('wardrobe')"><b>${items.filter(isInWardrobe).length}</b><span>pièces au vestiaire</span></button><button class="home-kpi" onclick="go('collections')"><b>${displayCollections().length}</b><span>collections</span></button><button class="home-add" onclick="openQuickAdd()">+ Ajouter un article</button></div>
 </section>
 <section class="section home-latest"><div class="section-head"><div><h2>Derniers ajouts</h2></div><button class="textbtn" onclick="go('catalog')">Tout voir</button></div><div class="pin-grid">${latest.map(pinCard).join('')}</div></section>
 <section class="section"><div class="section-head"><div><h2>Collections</h2></div><button class="textbtn" onclick="go('collections')">Tout voir</button></div><div class="collection-row">${displayCollections().slice(0,6).map(collectionCard).join('')}</div></section>
 <section class="section"><div class="section-head"><div><h2>Explorer</h2></div></div><div class="home-explore-box"><div class="home-explore-tabs"><button class="home-explore-tab ${homeExploreTab==='categories'?'active':''}" onclick="setHomeExploreTab('categories')">Catégories</button><button class="home-explore-tab ${homeExploreTab==='stores'?'active':''}" onclick="setHomeExploreTab('stores')">Magasins</button></div><div class="home-nav-grid">${homeExploreView(items,supers,stores,cats)}</div></div></section>`
}
function collectionCard(c,i=0){const its=collectionItems(c),outs=collectionOutfits(c),ents=[...its,...outs];const imgs=ents.slice(0,4).map(entityImage).filter(Boolean);const cells=[0,1,2,3].map(n=>imgs[n]?`<img src="${imgs[n]}" alt="">`:'<div></div>').join('');const desc=c.description||'';const meta=outs.length?`${its.length} pièce${its.length>1?'s':''} · ${outs.length} tenue${outs.length>1?'s':''}`:`${its.length} article${its.length>1?'s':''}`;return `<button class="collection-card" style="animation-delay:${Math.min(i,12)*40}ms" onclick="go('catalog',{collection:'${esc(c.id)}'})"><div class="collection-cover">${cells}</div><div class="collection-copy"><div class="collection-meta">${esc(c.emoji||'✦')} · ${meta}</div><strong>${esc(c.name)}</strong>${desc?`<p>${esc(desc)}</p>`:''}</div></button>`}
function catalogView(){
 const f=route.filter||{}; const items=filteredItems(); const activeCollection=f.collection?collectionById(f.collection):null; const collOutfits=activeCollection?collectionOutfits(activeCollection):[];
 const brands=uniq(liveItems().map(x=>x.brand)),subs=uniq(liveItems().map(x=>x.subcategory)),stores=uniq(liveItems().map(x=>x.store)),currencies=uniq(liveItems().map(x=>x.currency).filter(x=>x&&x!=='Non précisée'));
 const colors=['Noir','Blanc / écru','Brun / beige','Bleu','Rouge','Orange','Rose / violet','Vert / olive','Jaune','Gris / métallisé','Motifs / multicolore','Autre'];
 const title=f.collection?((collectionById(f.collection)||{}).name||'Collection'):f.supercategory||f.store||'Catalogue';
 const activeFilterCount=['brand','store','subcategory','status','purchase_type','currency','color_family','minPrice','maxPrice'].filter(k=>f[k]!==undefined&&f[k]!=='').length;
 return `<div class="catalog-head"><div><span class="eyebrow">${f.collection?'Collection':f.store?'Magasin':f.supercategory?'Catégorie':'Catalogue'}</span><h1>${esc(title)}</h1></div><div class="catalog-tools"><button class="btn ${f.favorite?'primary':''}" onclick="toggleFavoriteFilter()">♡ Favoris</button><button class="btn" onclick="toggleGrouping()">${state.settings.groupDuplicates?'✓ ':''}Grouper les vues</button><button class="btn" onclick="openDataModal()">Sauvegarde</button><button class="btn primary" onclick="openQuickAdd()">+ Ajouter</button></div></div>
 <button class="filter-toggle" onclick="toggleFiltersPanel()"><span>Filtres${activeFilterCount?` · ${activeFilterCount}`:''}</span><span class="chev">${filtersOpen?'▲ Fermer':'▼ Afficher'}</span></button>
 <div class="filter-panel ${filtersOpen?'open':''}">
 <div class="filterbar"><input class="search" id="q" placeholder="Rechercher nom, marque, tag, couleur, n° de pièce…" value="${esc(f.q||'')}"><select id="brandFilter"><option value="">Toutes marques</option>${brands.map(x=>`<option ${f.brand===x?'selected':''}>${esc(x)}</option>`).join('')}</select><select id="storeFilter"><option value="">Tous magasins</option>${stores.map(x=>`<option ${f.store===x?'selected':''}>${esc(x)}</option>`).join('')}</select><select id="subFilter"><option value="">Toutes sous-catégories</option>${subs.map(x=>`<option ${f.subcategory===x?'selected':''}>${esc(x)}</option>`).join('')}</select><select id="statusFilter"><option value="">Tous statuts</option>${['À compléter','À considérer','Favori','Attendre soldes','À essayer','Acheté','Écarté'].map(x=>`<option ${f.status===x?'selected':''}>${x}</option>`).join('')}</select><select id="typeFilter"><option value="">Tous types d'achat</option>${['Besoin','Upgrade','Plaisir','Collection','Cadeau','À surveiller'].map(x=>`<option ${f.purchase_type===x?'selected':''}>${x}</option>`).join('')}</select><input id="minPrice" type="number" step="0.01" min="0" placeholder="Prix min" value="${esc(f.minPrice??'')}"><input id="maxPrice" type="number" step="0.01" min="0" placeholder="Prix max" value="${esc(f.maxPrice??'')}"><select id="currencyFilter"><option value="">Toutes devises</option>${currencies.map(x=>`<option ${f.currency===x?'selected':''}>${esc(x)}</option>`).join('')}</select><select id="sortFilter"><option value="id">Ordre d'ajout</option><option value="priceAsc" ${f.sort==='priceAsc'?'selected':''}>Prix ↑</option><option value="priceDesc" ${f.sort==='priceDesc'?'selected':''}>Prix ↓</option><option value="brand" ${f.sort==='brand'?'selected':''}>Marque A–Z</option><option value="desire" ${f.sort==='desire'?'selected':''}>Envie ↓</option><option value="utility" ${f.sort==='utility'?'selected':''}>Utilité ↓</option></select></div>
 <div class="colorchips"><button class="colorchip ${!f.color_family?'active':''}" data-color="">Toutes couleurs</button>${colors.map(c=>`<button class="colorchip ${f.color_family===c?'active':''}" data-color="${esc(c)}"><span class="swatch-dot" style="background:${COLOR_SWATCH[c]||'#888'}"></span>${esc(c)}</button>`).join('')}</div>
 </div>
 <div class="statsline"><span class="pill">${items.length} affiché${items.length>1?'s':''}</span>${f.collection?'<span class="pill">board actif</span>':''}${f.supercategory?`<span class="pill">${esc(f.supercategory)}</span>`:''}${f.store?`<span class="pill">${esc(f.store)}</span>`:''}${f.currency?`<span class="pill">${esc(f.currency)}</span>`:''}${(f.minPrice!==undefined&&f.minPrice!=='')|| (f.maxPrice!==undefined&&f.maxPrice!=='')?`<span class="pill">prix ${esc(f.minPrice||'0')}–${esc(f.maxPrice||'∞')}</span>`:''}</div>
 ${collOutfits.length?`<section class="collection-outfits"><h2>Tenues</h2><div class="outfit-grid">${collOutfits.map(outfitCard).join('')}</div></section>`:''}
 ${items.length?`<div class="pin-grid">${items.map(pinCard).join('')}</div>`:collOutfits.length?'':'<div class="empty">Aucun élément ne correspond à ces filtres.</div>'}`
}
function filteredItems(){
 let xs=liveItems().slice();const f=route.filter||{};
 if(f.collection){const c=collectionById(f.collection);const ids=c?.id==='__favorites'?state.favorites:(c?.items||[]);xs=xs.filter(x=>ids.includes(x.uid))}
 if(f.supercategory)xs=xs.filter(x=>x.supercategory===f.supercategory);
 if(f.brand)xs=xs.filter(x=>x.brand===f.brand);if(f.store)xs=xs.filter(x=>x.store===f.store);if(f.subcategory)xs=xs.filter(x=>x.subcategory===f.subcategory);if(f.color_family)xs=xs.filter(x=>x.color_family===f.color_family);if(f.status)xs=xs.filter(x=>x.status===f.status);if(f.purchase_type)xs=xs.filter(x=>x.purchase_type===f.purchase_type);if(f.currency)xs=xs.filter(x=>x.currency===f.currency);if(f.favorite)xs=xs.filter(x=>state.favorites.includes(x.uid));
 if(f.minPrice!==undefined&&f.minPrice!==''){const mn=Number(f.minPrice);if(Number.isFinite(mn))xs=xs.filter(x=>hasNumeric(x.price_num)&&Number(x.price_num)>=mn)}
 if(f.maxPrice!==undefined&&f.maxPrice!==''){const mx=Number(f.maxPrice);if(Number.isFinite(mx))xs=xs.filter(x=>hasNumeric(x.price_num)&&Number(x.price_num)<=mx)}
 if(f.q){const tokens=normalizeText(f.q).split(/\s+/).filter(Boolean);xs=xs.filter(x=>{const hay=searchHaystack(x);return tokens.every(tok=>hay.includes(tok))})}
 if(state.settings.groupDuplicates){const seen=new Set();xs=xs.filter(x=>{const k=(x.url||x.name)+'|'+(x.color||'');if(seen.has(k))return false;seen.add(k);return true})}
 const s=f.sort||'id'; if(s==='priceAsc')xs.sort((a,b)=>(a.price_num??1e12)-(b.price_num??1e12));if(s==='priceDesc')xs.sort((a,b)=>(b.price_num??-1)-(a.price_num??-1));if(s==='brand')xs.sort((a,b)=>(a.brand||'').localeCompare(b.brand||'','fr'));if(s==='desire')xs.sort((a,b)=>(b.desire_score||0)-(a.desire_score||0));if(s==='utility')xs.sort((a,b)=>(b.utility_score||0)-(a.utility_score||0));
 return xs
}
function pinCard(x,i=0){const fav=state.favorites.includes(x.uid),cart=state.cart.includes(x.uid),purchased=isPurchased(x);const imgs=itemImages(x),img=imgs[0]||'';const pn=pieceNumber(x);const paid=paidValue(x);const paidCur=x.paid_currency||x.currency;const hoverBits=[x.store||'',x.size?`Taille ${x.size}`:'',x.color||x.color_family||'',x.priority&&x.priority!=='Moyenne'?`Priorité ${x.priority}`:'',x.desire_score?`Envie ${x.desire_score}/5`:''].filter(Boolean);return `<article class="pin" style="animation-delay:${Math.min(i,14)*35}ms"><div class="pin-img"><img src="${img}" alt="${esc(x.name)}">${pn!==null?`<span class="piece-badge">N° ${pn}</span>`:''}${x.sale==='Oui'?'<span class="sale-badge">SOLDE</span>':''}${purchased?'<span class="purchased-badge">✓ ACHETÉ</span>':x.owned===true?'<span class="purchased-badge">VESTIAIRE</span>':x.status==='À compléter'?'<span class="draft-badge">À COMPLÉTER</span>':''}${imgs.length>1?`<span class="photo-count">${imgs.length} photos</span>`:''}<div class="pin-hover-info"><div class="hover-price-row"><span class="hover-price">${esc(x.price||(x.owned?'':'Prix à renseigner'))}</span>${x.original?`<span class="hover-old">${esc(x.original)}</span>`:''}${x.discount?`<span class="hover-discount">${esc(x.discount)}</span>`:x.sale==='Oui'?'<span class="hover-discount">SOLDE</span>':''}</div>${hoverBits.length?`<div class="hover-meta">${hoverBits.slice(0,5).map(v=>`<span>${esc(v)}</span>`).join('')}</div>`:''}</div><div class="pin-actions" onclick="event.stopPropagation()"><button class="circle ${fav?'fav-active':''}" title="${fav?'Retirer des favoris':'Ajouter aux favoris'}" onclick="toggleFavorite('${x.uid}')">${fav?'♥':'♡'}</button><button class="circle ${cart?'cart-active':''}" title="${cart?'Retirer du panier':'Ajouter au panier'}" onclick="toggleCart('${x.uid}')">${ICON_CART}</button><button class="circle ${purchased?'bought-active':''}" title="${purchased?'Modifier les infos d’achat':'Marquer comme acheté'}" onclick="openPurchaseModal(['${x.uid}'])"><span class="purchase-icon-label">✓</span></button><button class="circle" title="Modifier l'article" onclick="openItemEditor('${x.uid}')">⋯</button></div></div><div class="pin-copy"><div class="pin-brand">${esc(x.brand||'Sans marque / Vintage')} · ${esc(x.store||'')}</div><div class="pin-name">${esc(x.name)}</div><div><span class="pin-price">${esc(x.price||(x.owned?'':'Prix à renseigner'))}</span>${x.original?`<span class="old">${esc(x.original)}</span>`:''}</div><div class="pin-tags"><span class="tag">${esc(x.subcategory||x.category||'Autre')}</span><span class="tag">${esc(x.color_family||x.color||'')}</span>${(x.tags||[]).slice(0,2).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>${purchased&&paid!==null?`<div class="purchase-mini">Payé ${esc(formatMoney(paid,paidCur))}${x.purchase_date?' · '+esc(x.purchase_date):''}</div>`:''}<div class="pin-footer"><button onclick="openCollectionPicker('${x.uid}')">+ Collection</button>${imgs.length>1?`<button onclick="openItemPhotos('${x.uid}')">Photos · ${imgs.length}</button>`:''}${x.url?`<a href="${safeUrl(x.url)}" target="_blank" rel="noopener">Article ↗</a>`:''}</div></div></article>`}

function setWardrobeStatus(uid,status){const x=byId(uid);if(!x)return;applyItemPatch(uid,{owned:true,wardrobe_active:true,wardrobe_status:status});persist();render();toast('Vestiaire mis à jour')}
function setWardrobeFilter(status=''){go('wardrobe',status?{wardrobe_status:status}:{})}
function removeFromWardrobe(uid){const x=byId(uid);if(!x)return;if(!confirm(`Retirer « ${x.name} » du vestiaire ?`))return;applyItemPatch(uid,{wardrobe_active:false});persist();render();toast('Retiré du vestiaire')}
function wardrobeItemCard(x,i=0){const imgs=itemImages(x),decision=wardrobeDecision(x),linked=outfitsForItem(x.uid);return `<article class="wardrobe-card" style="animation-delay:${Math.min(i,14)*35}ms"><div class="wardrobe-card-media"><img src="${imgs[0]||''}" alt="${esc(x.name)}"><span class="wardrobe-badge">${isPurchased(x)?'ACHETÉ':'DÉJÀ POSSÉDÉ'}</span>${imgs.length>1?`<span class="photo-count">${imgs.length} photos</span>`:''}</div><div class="wardrobe-card-copy"><div class="pin-brand">${esc(x.brand||'Sans marque / Vintage')}</div><h3>${esc(x.name)}</h3><p>${esc(x.subcategory||x.category||'')} ${x.color_family?`· ${esc(x.color_family)}`:''}</p>${linked.length?`<button class="wardrobe-usage" onclick="openItemOutfits('${x.uid}')">Dans ${linked.length} tenue${linked.length>1?'s':''} · voir</button>`:''}<select class="wardrobe-decision" onchange="setWardrobeStatus('${x.uid}',this.value)">${['À trier','Garder','Peut-être','Donner / vendre','Réparer / retoucher'].map(v=>`<option ${decision===v?'selected':''}>${v}</option>`).join('')}</select><div class="wardrobe-card-foot">${imgs.length>1?`<button onclick="openItemPhotos('${x.uid}')">Photos · ${imgs.length}</button>`:''}${linked.length?`<button onclick="openItemOutfits('${x.uid}')">Tenues · ${linked.length}</button>`:''}<button onclick="openCollectionPicker('${x.uid}')">+ Collection</button><button onclick="openItemEditor('${x.uid}')">Modifier</button><button onclick="removeFromWardrobe('${x.uid}')">Retirer</button></div></div></article>`}
function wardrobeView(){const all=liveItems().filter(isInWardrobe).sort((a,b)=>(b.purchase_date||b.date_added||'').localeCompare(a.purchase_date||a.date_added||''));const filter=route.filter?.wardrobe_status||'';const xs=filter?all.filter(x=>wardrobeDecision(x)===filter):all;const outfits=(state.outfits||[]).slice().sort((a,b)=>(b.date_added||'').localeCompare(a.date_added||''));const toSort=all.filter(x=>wardrobeDecision(x)==='À trier').length;return `<div class="catalog-head"><div><h1>Vestiaire</h1></div><div class="catalog-tools"><button class="btn" onclick="openOwnedItemEditor()">+ Pièce déjà possédée</button><button class="btn primary" onclick="openOutfitEditor()">+ Créer une tenue</button></div></div><div class="wardrobe-summary"><div class="wardrobe-stat"><span>Pièces</span><b>${all.length}</b></div><div class="wardrobe-stat"><span>À trier</span><b>${toSort}</b></div><div class="wardrobe-stat"><span>Tenues</span><b>${outfits.length}</b></div></div><div class="wardrobe-filters">${['','À trier','Garder','Peut-être','Donner / vendre','Réparer / retoucher'].map(v=>`<button class="pillbtn ${filter===v?'active':''}" onclick="setWardrobeFilter('${esc(v)}')">${v||'Tout'}</button>`).join('')}</div><div class="wardrobe-section-head"><h2>Tenues</h2><div class="wardrobe-section-actions"><button class="btn" onclick="openOutfitEditor()">+ Nouvelle tenue</button></div></div>${outfits.length?`<div class="outfit-grid">${outfits.map(outfitCard).join('')}</div>`:'<div class="empty">Aucune tenue enregistrée pour le moment. Tu peux en créer une à partir des pièces de ton vestiaire.</div>'}<div class="wardrobe-section-head"><h2>Pièces</h2><div class="wardrobe-section-actions"><span class="pill">${xs.length} affichée${xs.length>1?'s':''}</span></div></div>${xs.length?`<div class="wardrobe-grid">${xs.map(wardrobeItemCard).join('')}</div>`:'<div class="empty">Aucune pièce dans ce filtre.</div>'}`}
function openOwnedItemEditor(){openItemEditor(null,'owned')}
function outfitCard(o){const imgs=outfitCoverImages(o).slice(0,4);const n=(o.itemIds||[]).length;return `<article class="outfit-card" style="position:relative"><button class="circle" title="Conseils IA" onclick="event.stopPropagation();openOutfitAdvice('${o.id}')" style="position:absolute;right:9px;top:9px;z-index:2">${ICON_SPARKLE}</button><button style="border:0;padding:0;background:none;width:100%;text-align:left" onclick="closeModal('galleryModal');go('outfit',{id:'${o.id}'})"><div class="outfit-cover ${imgs.length<=1?'one':''}">${imgs.length?imgs.map(img=>`<img src="${img}" alt="">`).join(''):'<div></div>'}<span class="outfit-cover-shade"></span><span class="outfit-cover-copy"><span>TENUE · ${n} pièce${n>1?'s':''}</span><strong>${esc(o.name||'Tenue sans titre')}</strong></span></div><div class="outfit-copy"><p>${esc((o.tags||[]).join(' · '))}</p></div></button><div class="outfit-copy" style="padding-top:0"><div class="outfit-actions"><button onclick="closeModal('galleryModal');go('outfit',{id:'${o.id}'})">Voir</button><button onclick="openCollectionPicker('${o.id}')">+ Collection</button><button onclick="openOutfitEditor('${o.id}')">Modifier</button></div></div></article>`}
function renderOutfitPhotoPreview(){const el=document.getElementById('outfitPhotoPreview');if(!el)return;el.innerHTML=outfitDraftPhotos.map((img,i)=>`<div class="image-preview"><img src="${img}" alt=""><button onclick="removeOutfitPhoto(${i})">×</button></div>`).join('')}
function removeOutfitPhoto(i){outfitDraftPhotos.splice(i,1);renderOutfitPhotoPreview()}
async function addOutfitFiles(files){for(const f of files){if(!f.type?.startsWith('image/'))continue;outfitDraftPhotos.push(await compressImageFile(f,1200,.8))}renderOutfitPhotoPreview();toast(`${files.length} photo${files.length>1?'s':''} ajoutée${files.length>1?'s':''}`)}
function openOutfitEditor(id=null){outfitEditTarget=id;const o=id?outfitById(id):{name:'',itemIds:[],photos:[],tags:[],note:'',date_added:new Date().toISOString().slice(0,10)};if(!o)return;outfitDraftPhotos=[...(o.photos||[])];const wardrobe=liveItems().filter(isInWardrobe);document.getElementById('outfitModalTitle').textContent=id?'Modifier la tenue':'Créer une tenue';document.getElementById('outfitModalBody').innerHTML=`<div class="form"><label class="full"><span>Nom de la tenue</span><input id="oName" value="${esc(o.name||'')}" placeholder="Ex. Bureau gothique, dîner été…"></label><label><span>Date</span><input id="oDate" type="date" value="${esc(o.date_added||new Date().toISOString().slice(0,10))}"></label><label><span>Tags</span><input id="oTags" value="${esc((o.tags||[]).join(', '))}" placeholder="bureau, pluie, date night…"></label><label class="full"><span>Note</span><textarea id="oNote">${esc(o.note||'')}</textarea></label><div class="full dropzone" id="outfitPasteZone" tabindex="0"><input id="outfitPhotoInput" type="file" accept="image/*" multiple><input id="outfitPhotoCaptureInput" type="file" accept="image/*" capture="environment" style="display:none"><div>Photo de la tenue facultative : importe, glisse ou colle une ou plusieurs images.</div><button type="button" class="btn" style="margin-top:8px" onclick="event.stopPropagation();document.getElementById('outfitPhotoCaptureInput').click()">${ICON_CAMERA} Prendre une photo</button></div><div class="full image-preview-grid" id="outfitPhotoPreview"></div><div class="full"><span class="eyebrow">Pièces de la tenue</span><div class="outfit-picker">${wardrobe.map(x=>`<div class="outfit-pick"><input type="checkbox" data-outfit-item="${x.uid}" ${(o.itemIds||[]).includes(x.uid)?'checked':''}><img src="${mainImage(x)}" alt=""><label>${esc(x.name)}</label></div>`).join('')}</div></div></div>${id?`<div style="margin-top:14px"><button class="btn danger" onclick="deleteOutfit('${id}')">Supprimer la tenue</button></div>`:''}`;openModal('outfitModal');renderOutfitPhotoPreview();document.getElementById('outfitPhotoInput')?.addEventListener('change',e=>addOutfitFiles([...e.target.files]));document.getElementById('outfitPhotoCaptureInput')?.addEventListener('change',e=>addOutfitFiles([...e.target.files]));const zone=document.getElementById('outfitPasteZone');if(zone){zone.onpaste=async(e)=>{const fs=[];for(const it of (e.clipboardData?.items||[])){if(it.type?.startsWith('image/')){const f=it.getAsFile();if(f)fs.push(f)}}if(fs.length){e.preventDefault();await addOutfitFiles(fs)}};zone.ondragover=e=>e.preventDefault();zone.ondrop=async(e)=>{e.preventDefault();await addOutfitFiles([...e.dataTransfer.files])}}}
function saveOutfitForm(){const itemIds=[...document.querySelectorAll('[data-outfit-item]:checked')].map(x=>x.dataset.outfitItem);const data={name:val('oName').trim()||'Tenue sans titre',date_added:val('oDate')||new Date().toISOString().slice(0,10),tags:val('oTags').split(',').map(x=>x.trim()).filter(Boolean),note:val('oNote').trim(),itemIds,photos:[...new Set(outfitDraftPhotos.filter(Boolean))]};if(outfitEditTarget){const i=state.outfits.findIndex(o=>o.uid===outfitEditTarget);if(i>=0)state.outfits[i]=Object.assign({},state.outfits[i],data)}else{data.uid='outfit-'+Date.now().toString(36);data.id=data.uid;state.outfits.unshift(data)}persist();closeModal('outfitModal');render();toast(outfitEditTarget?'Tenue modifiée':'Tenue créée');outfitEditTarget=null;outfitDraftPhotos=[]}
function deleteOutfit(id){const o=outfitById(id);if(!o||!confirm(`Supprimer la tenue « ${o.name} » ?`))return;state.outfits=state.outfits.filter(x=>x.uid!==o.uid);state.collections.forEach(c=>c.items=(c.items||[]).filter(x=>x!==id));persist();closeModal('outfitModal');closeModal('outfitAdviceModal');if(route.page==='outfit'&&route.filter.id===id)go('wardrobe');else render();toast('Tenue supprimée')}
let mediaCarouselSeq=0;
function mediaCarousel(images,alt='',extraClass=''){
 const imgs=[...new Set((images||[]).filter(Boolean))];
 if(!imgs.length)return '';
 const id=`mediaCarousel_${++mediaCarouselSeq}`;
 if(imgs.length===1)return `<div class="media-carousel ${extraClass}"><div class="media-carousel-viewport"><div class="media-carousel-track" id="${id}_track"><div class="media-carousel-slide"><img src="${imgs[0]}" alt="${esc(alt)}"></div></div></div></div>`;
 return `<div class="media-carousel ${extraClass}" id="${id}" data-carousel-current="0"><div class="media-carousel-viewport"><div class="media-carousel-track" id="${id}_track" data-carousel-id="${id}" onscroll="syncMediaCarousel(this)">${imgs.map((img,i)=>`<div class="media-carousel-slide" data-slide-index="${i}"><img src="${img}" alt="${esc(alt)} · photo ${i+1}"></div>`).join('')}</div><button class="media-carousel-arrow prev" type="button" aria-label="Photo précédente" onclick="moveMediaCarousel('${id}',-1)">‹</button><button class="media-carousel-arrow next" type="button" aria-label="Photo suivante" onclick="moveMediaCarousel('${id}',1)">›</button><span class="media-carousel-count" id="${id}_count">1 / ${imgs.length}</span></div><div class="media-carousel-dots" aria-label="${imgs.length} photos">${imgs.map((_,i)=>`<button type="button" class="media-carousel-dot ${i===0?'active':''}" aria-label="Voir la photo ${i+1}" onclick="goToMediaCarousel('${id}',${i})"></button>`).join('')}</div></div>`
}
function mediaCarouselIndex(id){const root=document.getElementById(id),track=document.getElementById(`${id}_track`);if(!root||!track)return 0;const w=track.clientWidth||1;return Math.max(0,Math.min(track.children.length-1,Math.round(track.scrollLeft/w)))}
function updateMediaCarousel(id,index){const root=document.getElementById(id),track=document.getElementById(`${id}_track`);if(!root||!track)return;const n=track.children.length;const i=Math.max(0,Math.min(n-1,index));root.dataset.carouselCurrent=String(i);root.querySelectorAll('.media-carousel-dot').forEach((d,j)=>d.classList.toggle('active',j===i));const count=document.getElementById(`${id}_count`);if(count)count.textContent=`${i+1} / ${n}`;const prev=root.querySelector('.media-carousel-arrow.prev'),next=root.querySelector('.media-carousel-arrow.next');if(prev)prev.disabled=i<=0;if(next)next.disabled=i>=n-1}
function goToMediaCarousel(id,index){const track=document.getElementById(`${id}_track`);if(!track)return;const i=Math.max(0,Math.min(track.children.length-1,index));track.scrollTo({left:i*track.clientWidth,behavior:'smooth'});updateMediaCarousel(id,i)}
function moveMediaCarousel(id,delta){goToMediaCarousel(id,mediaCarouselIndex(id)+delta)}
function syncMediaCarousel(track){const id=track?.dataset?.carouselId;if(!id)return;clearTimeout(track.__carouselSync);track.__carouselSync=setTimeout(()=>updateMediaCarousel(id,mediaCarouselIndex(id)),45)}
function initMediaCarousels(root=document){root.querySelectorAll?.('.media-carousel[id]').forEach(el=>updateMediaCarousel(el.id,Number(el.dataset.carouselCurrent||0)))}
function outfitDetailView(o){
 const comps=(o.itemIds||[]).map(byId).filter(Boolean);
 return `<div class="catalog-head"><div><button class="textbtn" onclick="go('wardrobe')">← Vestiaire</button><h1>${esc(o.name||'Tenue')}</h1></div><div class="catalog-tools"><button class="btn primary" onclick="openOutfitAdvice('${o.id}')">${ICON_SPARKLE} Conseils IA</button><button class="btn" onclick="openCollectionPicker('${o.id}')">+ Collection</button><button class="btn" onclick="openOutfitEditor('${o.id}')">Modifier</button></div></div>${(o.photos||[]).length?`<div class="outfit-detail-photo"><span class="eyebrow">Photo${o.photos.length>1?'s':''} de la tenue</span>${mediaCarousel(o.photos,o.name||'Tenue')}</div>`:''}${comps.length?`<span class="eyebrow">Pièces de la tenue</span>${comps.map(x=>{const imgs=itemImages(x);return `<section class="outfit-component"><h3>${esc(x.name)}</h3><p>${esc(x.brand||'Sans marque / Vintage')} · ${esc(x.subcategory||x.category||'')}${imgs.length>1?` · ${imgs.length} photos`:''}</p>${mediaCarousel(imgs,x.name)}</section>`}).join('')}`:'<div class="empty">Cette tenue ne contient encore aucune pièce.</div>'}`
}
function addItemToOutfit(outfitUid,itemUid){
 const o=state.outfits.find(x=>x.uid===outfitUid);if(!o)return;
 o.itemIds=o.itemIds||[];
 if(!o.itemIds.includes(itemUid))o.itemIds.push(itemUid);
 persist();
 if(outfitAdviceTarget&&outfitAdviceTarget.uid===outfitUid)outfitAdviceTarget=o;
 if(route.page==='outfit'&&route.filter.id===outfitUid){const v=document.getElementById('view');v.innerHTML=outfitDetailView(o);initMediaCarousels(v)}
 toast('Pièce ajoutée à la tenue')
}
function removeItemFromOutfit(outfitUid,itemUid){
 const o=state.outfits.find(x=>x.uid===outfitUid);if(!o)return;
 o.itemIds=(o.itemIds||[]).filter(x=>x!==itemUid);
 persist();
 if(outfitAdviceTarget&&outfitAdviceTarget.uid===outfitUid)outfitAdviceTarget=o;
 if(route.page==='outfit'&&route.filter.id===outfitUid){const v=document.getElementById('view');v.innerHTML=outfitDetailView(o);initMediaCarousels(v)}
 toast('Pièce retirée de la tenue')
}
function addSuggestionToCart(uid){
 if(!state.cart.includes(uid))state.cart.push(uid);
 persist();
 toast('Ajouté au panier')
}

// === Conseils IA (par tenue) : avis + suggestions ancrées, historique ======
let outfitAdviceTarget=null;
let outfitAdviceHistoryCache=[];
let outfitAdviceDeepConfirmed=false;
const OUTFIT_ADVICE_CONFIRM_THRESHOLD_USD=0.01;

async function openOutfitAdvice(id){
 const o=outfitById(id);if(!o)return;
 outfitAdviceTarget=o;
 document.getElementById('outfitAdviceModalTitle').textContent=`Conseils IA · ${o.name||'Tenue'}`;
 document.getElementById('outfitAdviceModalBody').innerHTML='<p style="color:var(--muted)">Chargement…</p>';
 openModal('outfitAdviceModal');
 try{ outfitAdviceHistoryCache=await DB.listOutfitAdviceGenerations(id); }
 catch(e){ console.error(e); outfitAdviceHistoryCache=[]; }
 renderOutfitAdviceModal();
}
function outfitSuggestionCard(pick,kind){
 const x=byId(pick.uid);if(!x)return '';
 const actionBtn=kind==='remove'
   ?`<button class="btn danger" onclick="removeItemFromOutfit('${outfitAdviceTarget.uid}','${pick.uid}')">Retirer de la tenue</button>`
   :kind==='add-wardrobe'
     ?`<button class="btn" onclick="addItemToOutfit('${outfitAdviceTarget.uid}','${pick.uid}')">Ajouter à cette tenue</button>`
     :`<button class="btn" onclick="addSuggestionToCart('${pick.uid}')">Ajouter au panier</button>`;
 return `<div class="listitem"><img src="${mainImage(x)}" alt=""><div><h3>${esc(x.name)}</h3><p style="color:var(--muted);font-size:11px">${esc(pick.reason||'')}</p></div><div class="list-actions">${actionBtn}</div></div>`;
}
function outfitAdviceResultHTML(result){
 const additions=(result.additions||[]).filter(a=>byId(a.uid));
 const removals=(result.removals||[]).filter(r=>byId(r.uid));
 return `<p style="color:var(--muted);font-size:13px;white-space:pre-line">${esc(result.advice||'')}</p>${additions.length?`<div style="margin-top:12px"><span class="eyebrow">Suggestions d'ajout</span><div class="listview" style="margin-top:8px">${additions.map(a=>outfitSuggestionCard(a,a.source==='wardrobe'?'add-wardrobe':'add-wishlist')).join('')}</div></div>`:''}${removals.length?`<div style="margin-top:12px"><span class="eyebrow">Suggestions de retrait</span><div class="listview" style="margin-top:8px">${removals.map(r=>outfitSuggestionCard(r,'remove')).join('')}</div></div>`:''}`;
}
function outfitAdviceFormHTML(){
 return `<div style="margin-top:20px;border-top:1px solid var(--line);padding-top:16px">
  <span class="eyebrow">Relancer une analyse</span>
  <div style="margin:10px 0 6px"><label class="checkline" style="display:inline-flex;margin:4px 8px 4px 0"><input type="radio" name="oaSource" value="wardrobe" checked onchange="onOutfitAdviceInputChange()"> Mon vestiaire</label><label class="checkline" style="display:inline-flex;margin:4px 8px"><input type="radio" name="oaSource" value="wishlist" onchange="onOutfitAdviceInputChange()"> Ma wishlist</label><label class="checkline" style="display:inline-flex;margin:4px 8px"><input type="radio" name="oaSource" value="both" onchange="onOutfitAdviceInputChange()"> Les deux</label></div>
  <div class="form" style="grid-template-columns:1fr 1fr;margin-top:6px">
   <label class="full"><span>Occasion / contexte</span><input id="oaOccasion" placeholder="Ex. bureau, soirée, voyage…" oninput="onOutfitAdviceInputChange()"></label>
   <label><span>Budget max (suggestions wishlist)</span><input id="oaBudget" type="number" min="0" step="1" placeholder="Facultatif" oninput="onOutfitAdviceInputChange()"></label>
   <label><span>Devise</span><input id="oaCurrency" value="CAD"></label>
   <label class="full"><span>Précisions (facultatif)</span><textarea id="oaQuery" placeholder="Ce que tu veux changer, une contrainte particulière…" oninput="onOutfitAdviceInputChange()"></textarea></label>
  </div>
  <div id="outfitAdviceEstimateBox" style="margin:8px 0 10px;font-size:12px;color:var(--muted)"></div>
  <button class="btn primary" id="outfitAdviceBtn" onclick="runOutfitAdviceGenerate()">${ICON_SPARKLE} Lancer une nouvelle analyse</button>
 </div>`;
}
function renderOutfitAdviceModal(){
 const latest=outfitAdviceHistoryCache[0];
 const body=document.getElementById('outfitAdviceModalBody');
 body.innerHTML=`<div id="outfitAdviceLatest">${latest?outfitAdviceResultHTML(latest.result):'<div class="empty">Aucune analyse pour l’instant.</div>'}</div>${outfitAdviceFormHTML()}<div id="outfitAdviceHistoryBox"></div>`;
 onOutfitAdviceInputChange();
 renderOutfitAdviceHistoryCarousel();
}
let outfitAdviceHistorySeq=0;
function renderOutfitAdviceHistoryCarousel(){
 const box=document.getElementById('outfitAdviceHistoryBox');if(!box)return;
 if(outfitAdviceHistoryCache.length<2){box.innerHTML='';return}
 const id=`outfitAdviceHistory_${++outfitAdviceHistorySeq}`;
 box.innerHTML=`<div style="margin-top:26px;border-top:1px solid var(--line);padding-top:16px"><span class="eyebrow">Analyses précédentes (${outfitAdviceHistoryCache.length})</span><div class="history-carousel" id="${id}"><button class="media-carousel-arrow prev" type="button" aria-label="Analyses plus récentes" onclick="moveHistoryCarousel('${id}',-1)">‹</button><div class="history-carousel-track" id="${id}_track">${outfitAdviceHistoryCache.map(outfitAdviceHistoryCard).join('')}</div><button class="media-carousel-arrow next" type="button" aria-label="Analyses plus anciennes" onclick="moveHistoryCarousel('${id}',1)">›</button></div></div>`;
}
function outfitAdviceHistoryCard(h){
 const n=(h.result?.additions?.length||0)+(h.result?.removals?.length||0);
 const img=(h.result?.additions||[]).map(a=>mainImage(byId(a.uid))).filter(Boolean)[0]||'';
 const date=new Date(h.created_at).toLocaleDateString('fr-CA',{day:'numeric',month:'short'});
 const title=(h.occasion||h.query||`Analyse du ${date}`).slice(0,60);
 return `<button class="history-card" onclick="openOutfitAdviceHistoryDetail(${h.id})"><div class="history-card-imgs">${img?`<img src="${img}" alt="">`:''}</div><div class="history-card-copy"><b>${esc(title)}</b><span>${esc(date)} · ${n} suggestion${n>1?'s':''}</span></div></button>`;
}
function openOutfitAdviceHistoryDetail(id){
 const h=outfitAdviceHistoryCache.find(x=>x.id===id);if(!h)return;
 const date=new Date(h.created_at).toLocaleDateString('fr-CA',{day:'numeric',month:'long',year:'numeric'});
 document.getElementById('galleryTitle').textContent=`Analyse du ${date}`;
 document.getElementById('galleryBody').innerHTML=`${h.occasion||h.query?`<p style="color:var(--muted);font-size:12px;margin-top:0">${esc([h.occasion,h.query].filter(Boolean).join(' · '))}</p>`:''}${outfitAdviceResultHTML(h.result)}<div class="full" style="margin-top:14px"><button class="btn danger" onclick="deleteOutfitAdviceHistoryEntry(${h.id})">Supprimer cet historique</button></div>`;
 openModal('galleryModal');
}
async function deleteOutfitAdviceHistoryEntry(id){
 if(!confirm('Supprimer cette analyse de l’historique ?'))return;
 try{
  await DB.deleteOutfitAdviceGeneration(id);
  outfitAdviceHistoryCache=outfitAdviceHistoryCache.filter(h=>h.id!==id);
  closeModal('galleryModal');
  renderOutfitAdviceModal();
  toast('Historique supprimé');
 }catch(e){toast(e.message||'Erreur de suppression')}
}
function estimateOutfitAdviceLocal(){
 const o=outfitAdviceTarget;
 const outfitItemCount=o?(o.itemIds||[]).length:0;
 const source=document.querySelector('input[name="oaSource"]:checked')?.value||'wardrobe';
 const wardrobeItemCount=source!=='wishlist'?10:0;
 const wishlistItemCount=source!=='wardrobe'?10:0;
 const queryChars=(val('oaQuery')||'').length+(val('oaOccasion')||'').length;
 const outfitTokens=outfitItemCount*45,wardrobeTokens=wardrobeItemCount*45,wishlistTokens=wishlistItemCount*45,styleTokens=250+6*850,queryTokens=Math.ceil(queryChars/4),promptOverhead=300;
 const inputTokens=outfitTokens+wardrobeTokens+wishlistTokens+styleTokens+queryTokens+promptOverhead,outputTokens=2600;
 const costUSD=(inputTokens/1e6)*0.25+(outputTokens/1e6)*2.00;
 return {inputTokens,outputTokens,costUSD};
}
function onOutfitAdviceInputChange(){
 outfitAdviceDeepConfirmed=false;
 const btn=document.getElementById('outfitAdviceBtn'),box=document.getElementById('outfitAdviceEstimateBox');
 if(!btn)return;
 const est=estimateOutfitAdviceLocal();
 if(box)box.innerHTML=`Estimation : ≈ ${est.inputTokens+est.outputTokens} tokens, environ <b>${est.costUSD.toFixed(4)} $</b>.`;
 btn.innerHTML=est.costUSD>OUTFIT_ADVICE_CONFIRM_THRESHOLD_USD?'Voir le coût et confirmer':`${ICON_SPARKLE} Lancer une nouvelle analyse`;
}
async function runOutfitAdviceGenerate(){
 const o=outfitAdviceTarget;if(!o)return;
 const comps=(o.itemIds||[]).map(byId).filter(Boolean);
 const source=document.querySelector('input[name="oaSource"]:checked')?.value||'wardrobe';
 const occasion=val('oaOccasion').trim();
 const budgetRaw=val('oaBudget');const budget=budgetRaw===''?null:Number(budgetRaw);
 const currency=(val('oaCurrency')||'CAD').trim()||'CAD';
 const query=val('oaQuery').trim();
 const btn=document.getElementById('outfitAdviceBtn'),box=document.getElementById('outfitAdviceEstimateBox');
 const est=estimateOutfitAdviceLocal();

 if(est.costUSD>OUTFIT_ADVICE_CONFIRM_THRESHOLD_USD&&!outfitAdviceDeepConfirmed){
  btn.disabled=true;btn.textContent='Calcul de l\'estimation…';
  try{
   const serverEst=await DB.estimateOutfitCost({outfitItemCount:comps.length,wardrobeItemCount:source!=='wishlist'?10:0,wishlistItemCount:source!=='wardrobe'?10:0,queryChars:(query+occasion).length});
   box.innerHTML=`Cette demande coûte plus que la normale : <b>≈ ${serverEst.inputTokens+serverEst.outputTokens} tokens</b>, environ <b>${serverEst.costUSD.toFixed(4)} $</b>.`;
   btn.textContent=`Confirmer et lancer (~${serverEst.costUSD.toFixed(4)} $)`;
   outfitAdviceDeepConfirmed=true;
  }catch(e){box.textContent='Erreur estimation : '+e.message}
  btn.disabled=false;
  return;
 }

 btn.disabled=true;btn.textContent='Analyse en cours…';
 try{
  const result=await DB.getOutfitAdvice({outfitName:o.name,outfitItems:comps.map(x=>({uid:x.uid,name:x.name,brand:x.brand,category:x.category||x.subcategory,color:x.color||x.color_family})),wardrobeItemLimit:source!=='wishlist'?10:0,wishlistItemLimit:source!=='wardrobe'?10:0,occasion,budget,currency,query});
  const saved=await DB.saveOutfitAdviceGeneration({outfitUid:o.uid,query,source,occasion,budget,currency,result});
  outfitAdviceHistoryCache.unshift(saved);
  renderOutfitAdviceModal();
  toast('Analyse enregistrée');
 }catch(e){toast(e.message||'Erreur IA')}
 finally{outfitAdviceDeepConfirmed=false;btn.disabled=false;btn.textContent=`${ICON_SPARKLE} Lancer une nouvelle analyse`}
}
function openItemPhotos(uid){
 const x=byId(uid);if(!x)return;
 const imgs=itemImages(x),linked=outfitsForItem(uid);
 document.getElementById('galleryTitle').textContent=x.name||'Photos';
 document.getElementById('galleryBody').innerHTML=`${mediaCarousel(imgs,x.name,'gallery-modal-carousel')}${linked.length?`<div class="item-outfit-links"><h3>Tenues avec cette pièce</h3><div class="item-outfit-chips">${linked.map(o=>`<button onclick="closeModal('galleryModal');go('outfit',{id:'${o.id}'})">${esc(o.name||'Tenue')}</button>`).join('')}</div></div>`:''}`;
 openModal('galleryModal');initMediaCarousels(document.getElementById('galleryBody'))
}
function openItemOutfits(uid){const x=byId(uid);if(!x)return;const linked=outfitsForItem(uid);document.getElementById('galleryTitle').textContent=`Tenues avec ${x.name||'cette pièce'}`;document.getElementById('galleryBody').innerHTML=linked.length?`<div class="outfit-grid">${linked.map(outfitCard).join('')}</div>`:'<div class="empty">Cette pièce n’est encore utilisée dans aucune tenue.</div>';openModal('galleryModal')}

function collectionsView(){return `<div class="catalog-head"><div><h1>Collections</h1></div><div class="catalog-tools"><button class="btn primary" onclick="openNewCollection()">+ Nouvelle collection</button></div></div><div class="collection-row">${displayCollections().map((c,i)=>{const card=collectionCard(c,i);if(c.virtual)return `<div style="position:relative">${card}</div>`;return `<div style="position:relative"><div style="position:absolute;z-index:4;right:10px;top:10px;display:flex;gap:5px"><button class="circle" onclick="event.stopPropagation();editCollection('${c.id}')">✎</button><button class="circle" onclick="event.stopPropagation();deleteCollection('${c.id}')">×</button></div>${card}</div>`}).join('')}</div>`}
function purchasesView(){const xs=liveItems().filter(isPurchased).sort((a,b)=>(b.purchase_date||b.date_added||'').localeCompare(a.purchase_date||a.date_added||''));const tot=purchaseTotals(xs);return `<div class="catalog-head"><div><h1>Mes achats</h1></div><div class="catalog-tools"><button class="btn" onclick="go('catalog',{status:'Acheté'})">Voir dans le catalogue</button><button class="btn primary" onclick="openQuickAdd()">+ Ajouter</button></div></div><div class="purchase-summary"><div class="purchase-stat"><span>Articles achetés</span><b>${xs.length}</b></div>${Object.entries(tot).map(([c,v])=>`<div class="purchase-stat"><span>Dépensé · ${esc(c)}</span><b>${esc(formatMoney(v,c))}</b></div>`).join('')}</div>${xs.length?`<div class="listview">${xs.map(purchaseListItem).join('')}</div>`:'<div class="empty">Aucun achat enregistré pour le moment. Utilise l’icône ✓ sur une pièce, ou sélectionne plusieurs articles depuis le panier.</div>'}`}
function purchaseListItem(x){const paid=paidValue(x);const pn=pieceNumber(x);const paidCur=x.paid_currency||x.currency;return `<div class="listitem"><img src="${mainImage(x)}" alt=""><div><h3>${esc(x.name)}</h3><p>${esc(x.brand)} · ${pn!==null?'N° '+pn+' · ':''}${paid!==null?'payé '+esc(formatMoney(paid,paidCur)):'prix payé à renseigner'}</p><div class="purchase-list-meta">${x.purchase_date?'Acheté le '+esc(x.purchase_date):'Date d’achat non renseignée'}${x.price_num!==null&&x.price_num!==undefined&&paid!==null&&Number(x.price_num)!==Number(paid)?` · prix wishlist ${esc(formatMoney(x.price_num,x.currency))}`:''}</div></div><div class="list-actions"><button class="btn" onclick="openPurchaseModal(['${x.uid}'])">Modifier l’achat</button>${x.url?`<a class="btn" href="${safeUrl(x.url)}" target="_blank" rel="noopener">Article ↗</a>`:''}<button class="btn" onclick="togglePurchased('${x.uid}',false)">Annuler « acheté »</button></div></div>`}
function openAllCartLinks(){
  const links=state.cart.map(byId).filter(x=>x&&!state.trash.includes(x.uid)&&x.url).map(x=>safeUrl(x.url));
  if(!links.length){toast('Aucun lien dans le panier');return}
  links.forEach(u=>window.open(u,'_blank','noopener'));
  toast(`${links.length} lien${links.length>1?'s':''} ouvert${links.length>1?'s':''}`)
}
function cartView(){const xs=state.cart.map(byId).filter(x=>x&&!state.trash.includes(x.uid)),tot=priceTotals(xs);return `<div class="catalog-head"><div><h1>Panier</h1></div><div class="catalog-tools"><button class="btn primary" onclick="go('shopping')">${ICON_SPARKLE} Personal Shopper</button><button class="btn" onclick="openAllCartLinks()">Ouvrir tous les liens ↗</button><button class="btn" onclick="state.cart=[];persist();render()">Vider le panier</button></div></div><div class="totals">${Object.entries(tot).map(([c,v])=>`<div class="totalchip"><span>Total ${esc(c)}</span><b>${v.toFixed(2)}</b></div>`).join('')||'<span class="pill">Aucun prix additionnable</span>'}<div class="totalchip"><span>Articles</span><b>${xs.length}</b></div></div>${xs.length?`<div class="cart-batchbar"><label><input id="selectAllCart" type="checkbox" onchange="toggleAllCartSelections(this.checked)"> Tout sélectionner</label><span class="cart-selected-count" id="cartSelectedCount">0 sélectionné</span><button class="btn primary" onclick="openBatchPurchaseFromCart()">✓ Marquer comme acheté</button></div><div class="listview">${xs.map(x=>listItem(x,'cart')).join('')}</div>`:'<div class="empty">Ton panier est vide.</div>'}`}
function trashView(){const xs=state.trash.map(byId).filter(Boolean);return `<div class="catalog-head"><div><h1>Corbeille</h1></div><div class="catalog-tools"><button class="btn danger" onclick="emptyTrash()">Vider définitivement</button></div></div>${xs.length?`<div class="listview">${xs.map(x=>listItem(x,'trash')).join('')}</div>`:'<div class="empty">La corbeille est vide.</div>'}`}
function listItem(x,mode){if(mode==='cart')return `<div class="listitem cart-listitem"><label class="cart-select" title="Sélectionner"><input type="checkbox" data-cart-select="${x.uid}" onchange="updateCartSelectedCount()"></label><img src="${mainImage(x)}" alt=""><div><h3>${esc(x.name)}</h3><p>${esc(x.brand)} · ${esc(x.store)} · ${esc(x.price||'')}</p></div><div class="list-actions">${x.url?`<a class="btn" href="${safeUrl(x.url)}" target="_blank" rel="noopener">Voir l'article ↗</a>`:''}<button class="btn" onclick="openItemEditor('${x.uid}')">Modifier</button><button class="btn" onclick="openPurchaseModal(['${x.uid}'])">✓ Acheté</button><button class="btn" onclick="toggleCart('${x.uid}')">Retirer du panier</button><button class="btn danger" onclick="trashItem('${x.uid}')">Corbeille</button></div></div>`;return `<div class="listitem"><img src="${mainImage(x)}" alt=""><div><h3>${esc(x.name)}</h3><p>${esc(x.brand)} · ${esc(x.store)} · ${esc(x.price||'')}</p></div><div class="list-actions"><button class="btn primary" onclick="restoreItem('${x.uid}')">Restaurer</button><button class="btn danger" onclick="deleteForever('${x.uid}')">Supprimer</button></div></div>`}
function wireAfterRender(){
 const q=document.getElementById('q');
 q?.addEventListener('input',()=>{route.filter=Object.assign({},route.filter,{q:q.value});clearTimeout(window.__searchTimer);window.__searchTimer=setTimeout(()=>{document.getElementById('view').innerHTML=catalogView();wireAfterRender();const nq=document.getElementById('q');if(nq){nq.focus();nq.setSelectionRange(nq.value.length,nq.value.length)}},260)});
 ['brandFilter','storeFilter','subFilter','statusFilter','typeFilter','currencyFilter','sortFilter'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>{route.filter=Object.assign({},route.filter,{brand:document.getElementById('brandFilter')?.value||'',store:document.getElementById('storeFilter')?.value||'',subcategory:document.getElementById('subFilter')?.value||'',status:document.getElementById('statusFilter')?.value||'',purchase_type:document.getElementById('typeFilter')?.value||'',currency:document.getElementById('currencyFilter')?.value||'',minPrice:document.getElementById('minPrice')?.value||'',maxPrice:document.getElementById('maxPrice')?.value||'',sort:document.getElementById('sortFilter')?.value||'id'});document.getElementById('view').innerHTML=catalogView();wireAfterRender()}));
 ['minPrice','maxPrice'].forEach(id=>document.getElementById(id)?.addEventListener('input',()=>{route.filter=Object.assign({},route.filter,{minPrice:document.getElementById('minPrice')?.value||'',maxPrice:document.getElementById('maxPrice')?.value||''});clearTimeout(window.__priceTimer);window.__priceTimer=setTimeout(()=>{document.getElementById('view').innerHTML=catalogView();wireAfterRender();document.getElementById(id)?.focus()},320)}));
 document.querySelectorAll('.colorchip').forEach(el=>el.addEventListener('click',()=>{route.filter=Object.assign({},route.filter,{color_family:el.dataset.color||''});document.getElementById('view').innerHTML=catalogView();wireAfterRender()}));
}
function toggleFiltersPanel(){filtersOpen=!filtersOpen;document.getElementById('view').innerHTML=catalogView();wireAfterRender()}
function toggleFavoriteFilter(){route.filter=Object.assign({},route.filter,{favorite:!route.filter.favorite});document.getElementById('view').innerHTML=catalogView();wireAfterRender()}
function toggleGrouping(){state.settings.groupDuplicates=!state.settings.groupDuplicates;persist();render()}
function toggleFavorite(uid){const i=state.favorites.indexOf(uid);i>=0?state.favorites.splice(i,1):state.favorites.push(uid);persist();render();toast(i>=0?'Retiré des favoris':'Ajouté aux favoris')}
function toggleCart(uid){const i=state.cart.indexOf(uid);i>=0?state.cart.splice(i,1):state.cart.push(uid);persist();render();toast(i>=0?'Retiré du panier':'Ajouté au panier')}

function purchaseEditorCard(x,i){const paid=hasNumeric(x.paid_price_num)?Number(x.paid_price_num):(hasNumeric(x.price_num)?Number(x.price_num):'');const currency=x.paid_currency||((x.currency&&x.currency!=='Non précisée')?x.currency:'CAD');const date=x.purchase_date||new Date().toISOString().slice(0,10);return `<div class="purchase-edit-card" data-purchase-uid="${x.uid}"><img src="${mainImage(x)}" alt=""><div><div class="purchase-edit-head"><div><h3>${esc(x.name)}</h3><p>${esc(x.brand||'Sans marque / Vintage')}${pieceNumber(x)!==null?' · N° '+pieceNumber(x):''}</p></div><span class="tag">${esc(x.price||(x.owned?'':'Prix wishlist à renseigner'))}</span></div><div class="purchase-fields"><label><span>Prix final payé</span><input id="buyPaid_${i}" type="number" step="0.01" min="0" value="${paid}"></label><label><span>Devise payée</span><input id="buyCurrency_${i}" value="${esc(currency)}"></label><label><span>Date d’achat</span><input id="buyDate_${i}" type="date" value="${esc(date)}"></label><label><span>Taille / variante achetée</span><input id="buySize_${i}" value="${esc(x.purchased_size||x.size||'')}"></label><label class="full"><span>Magasin / plateforme</span><input id="buyStore_${i}" value="${esc(x.purchase_store||x.store||'')}"></label><label class="full"><span>Note d’achat</span><textarea id="buyNote_${i}" placeholder="Ex. frais de port inclus, retour possible, cadeau…">${esc(x.purchase_note||'')}</textarea></label></div></div></div>`}
function openPurchaseModal(uids){purchaseTargets=(uids||[]).map(byId).filter(Boolean);if(!purchaseTargets.length){toast('Aucun article sélectionné');return}document.getElementById('purchaseModalTitle').textContent=purchaseTargets.length>1?`Marquer ${purchaseTargets.length} articles comme achetés`:(isPurchased(purchaseTargets[0])?'Modifier l’achat':'Marquer comme acheté');document.getElementById('purchaseModalMeta').textContent=purchaseTargets.length>1?`${purchaseTargets.length} articles sélectionnés`:'';document.getElementById('purchaseModalBody').innerHTML=`<div class="purchase-edit-list">${purchaseTargets.map(purchaseEditorCard).join('')}</div>`;openModal('purchaseModal')}
function savePurchaseModal(){if(!purchaseTargets.length)return;purchaseTargets.forEach((x,i)=>{const paidRaw=document.getElementById(`buyPaid_${i}`)?.value??'';const paid=paidRaw===''?null:Number(paidRaw);const patch={purchased:true,status:'Acheté',owned:true,wardrobe_active:true,ownership_origin:'purchased',wardrobe_status:x.wardrobe_status||'Garder',paid_price_num:Number.isFinite(paid)?paid:null,paid_currency:(document.getElementById(`buyCurrency_${i}`)?.value||x.paid_currency||x.currency||'CAD').trim(),purchase_date:document.getElementById(`buyDate_${i}`)?.value||new Date().toISOString().slice(0,10),purchased_size:(document.getElementById(`buySize_${i}`)?.value||'').trim(),purchase_store:(document.getElementById(`buyStore_${i}`)?.value||'').trim(),purchase_note:(document.getElementById(`buyNote_${i}`)?.value||'').trim()};applyItemPatch(x.uid,patch);state.cart=state.cart.filter(v=>v!==x.uid)});const n=purchaseTargets.length;purchaseTargets=[];persist();closeModal('purchaseModal');render();toast(n>1?`${n} achats enregistrés`:'Achat enregistré')}
function updateCartSelectedCount(){const boxes=[...document.querySelectorAll('[data-cart-select]')],n=boxes.filter(x=>x.checked).length;const label=document.getElementById('cartSelectedCount');if(label)label.textContent=`${n} sélectionné${n>1?'s':''}`;const all=document.getElementById('selectAllCart');if(all){all.checked=boxes.length>0&&n===boxes.length;all.indeterminate=n>0&&n<boxes.length}}
function toggleAllCartSelections(checked){document.querySelectorAll('[data-cart-select]').forEach(x=>x.checked=checked);updateCartSelectedCount()}
function openBatchPurchaseFromCart(){const ids=[...document.querySelectorAll('[data-cart-select]:checked')].map(x=>x.dataset.cartSelect);if(!ids.length){toast('Sélectionne au moins un article du panier');return}openPurchaseModal(ids)}

function togglePurchased(uid,checked){const x=byId(uid);if(!x)return;const patch={purchased:!!checked};if(checked){patch.status='Acheté';patch.owned=true;patch.wardrobe_active=true;patch.ownership_origin='purchased';patch.wardrobe_status=x.wardrobe_status||'Garder';if(!hasNumeric(x.paid_price_num)&&hasNumeric(x.price_num))patch.paid_price_num=Number(x.price_num);if(!x.purchase_date)patch.purchase_date=new Date().toISOString().slice(0,10);state.cart=state.cart.filter(v=>v!==uid)}else if(x.status==='Acheté'){patch.status='À considérer';if(x.ownership_origin==='purchased'){patch.owned=false;patch.wardrobe_active=false}}applyItemPatch(uid,patch);persist();render();toast(checked?'Achat enregistré':'Marque « acheté » retirée')}
function trashItem(uid){if(!state.trash.includes(uid))state.trash.push(uid);state.cart=state.cart.filter(x=>x!==uid);persist();render();toast('Envoyé dans la corbeille')}
function restoreItem(uid){state.trash=state.trash.filter(x=>x!==uid);persist();render();toast('Article restauré')}
function removeEverywhere(uid){
 const loc=locateItem(uid); if(loc) loc.arr.splice(loc.i,1);
 state.trash=state.trash.filter(x=>x!==uid);
 state.cart=state.cart.filter(x=>x!==uid);
 state.favorites=state.favorites.filter(x=>x!==uid);
 state.collections.forEach(c=>c.items=(c.items||[]).filter(x=>x!==uid));
 state.outfits.forEach(o=>o.itemIds=(o.itemIds||[]).filter(x=>x!==uid));
}
function deleteForever(uid){if(!confirm('Supprimer définitivement cet article ?'))return; removeEverywhere(uid); persist();render()}
function emptyTrash(){if(!state.trash.length||!confirm('Vider définitivement toute la corbeille ?'))return;[...state.trash].forEach(removeEverywhere);persist();render()}
function openLightbox(uid){const x=byId(uid);if(!x)return;document.getElementById('lightboxImg').src=mainImage(x);document.getElementById('lightbox').classList.add('open')}
function closeLightbox(){document.getElementById('lightbox').classList.remove('open')}
function closeModal(id){document.getElementById(id).classList.remove('open')}
function openModal(id){document.getElementById(id).classList.add('open');requestAnimationFrame(()=>initMediaCarousels(document.getElementById(id)))}

function openQuickAdd(){
  quickImages=[];renderQuickImages();openModal('quickAddModal');
  const linkInput=document.getElementById('quickLinkInput');if(linkInput)linkInput.value='';
  const linkStatus=document.getElementById('quickLinkStatus');if(linkStatus)linkStatus.textContent='';
  const zone=document.getElementById('quickPasteZone');const input=document.getElementById('quickFileInput');
  if(zone){zone.onpaste=handleQuickPaste;zone.ondragover=(e)=>{e.preventDefault();zone.classList.add('drag')};zone.ondragleave=()=>zone.classList.remove('drag');zone.ondrop=(e)=>{e.preventDefault();zone.classList.remove('drag');handleQuickFiles([...e.dataTransfer.files])};setTimeout(()=>zone.focus(),80)}
  if(input)input.onchange=(e)=>handleQuickFiles([...e.target.files]);
  const captureInput=document.getElementById('quickCaptureInput');if(captureInput)captureInput.onchange=(e)=>handleQuickFiles([...e.target.files]);
}
function quickManualAdd(){closeModal('quickAddModal');openItemEditor()}
async function quickLinkAdd(){
  const input=document.getElementById('quickLinkInput');
  const statusEl=document.getElementById('quickLinkStatus');
  const url=(input?.value||'').trim();
  if(!url){ if(statusEl) statusEl.textContent='Colle un lien d’abord.'; return; }
  if(statusEl) statusEl.textContent='Récupération en cours…';
  try{
    const res=await fetch('/api/fetch-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
    const data=await res.json();
    if(!res.ok) throw new Error(data.error||'Erreur serveur');
    closeModal('quickAddModal');
    openItemEditor();
    transientImage=data.images?.[0]||'';
    editorExtraImages=(data.images||[]).slice(1);
    editorMainPreview='';
    renderEditorImagePreview();
    const nameField=document.getElementById('fName');if(nameField&&data.title)nameField.value=data.title;
    const urlField=document.getElementById('fUrl');if(urlField)urlField.value=url;
    if(input)input.value='';
    toast(data.images?.length?'Fiche préremplie depuis le lien':'Lien ajouté, mais aucune photo trouvée sur cette page');
  }catch(e){
    console.error(e);
    if(statusEl) statusEl.textContent="Impossible de récupérer cette page. Essaie une capture d'écran à la place.";
  }
}
function handleQuickPaste(e){const files=[];if(e.clipboardData?.items){for(const it of e.clipboardData.items){if(it.type&&it.type.startsWith('image/')){const f=it.getAsFile();if(f)files.push(f)}}}if(!files.length&&e.clipboardData?.files){files.push(...[...e.clipboardData.files].filter(f=>f.type?.startsWith('image/')))}if(files.length){e.preventDefault();handleQuickFiles(files)}else toast('Aucune image trouvée dans le presse-papiers')}
async function handleQuickFiles(files){const imgs=files.filter(f=>f&&f.type&&f.type.startsWith('image/'));if(!imgs.length){toast('Choisis des fichiers image');return}for(const f of imgs){try{const data=await compressImageFile(f,1200,.78);quickImages.push({data,name:f.name||'image'});renderQuickImages()}catch(err){console.warn(err)}}toast(`${imgs.length} image${imgs.length>1?'s':''} ajoutée${imgs.length>1?'s':''}`)}
function compressImageFile(file,max=1200,quality=.78){return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=reject;r.onload=()=>{const img=new Image();img.onerror=reject;img.onload=()=>{const scale=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);{const webp=c.toDataURL('image/webp',quality);resolve(webp.startsWith('data:image/webp')?webp:c.toDataURL('image/jpeg',quality))}};img.src=r.result};r.readAsDataURL(file)})}
function renderQuickImages(){const p=document.getElementById('quickPreview'),c=document.getElementById('quickCount'),b=document.getElementById('quickCreateBtn'),a=document.getElementById('quickAnalyzeBtn');if(p)p.innerHTML=quickImages.map((x,i)=>`<div class="quick-thumb"><img src="${x.data}" alt=""><button title="Retirer" onclick="event.stopPropagation();removeQuickImage(${i})">×</button></div>`).join('');if(c)c.textContent=quickImages.length?`${quickImages.length} image${quickImages.length>1?'s':''} prête${quickImages.length>1?'s':''}`:'Aucune image sélectionnée';if(b){b.disabled=!quickImages.length;b.textContent=quickImages.length?`Créer ${quickImages.length} brouillon${quickImages.length>1?'s':''}`:'Créer les brouillons'}if(a)a.disabled=!quickImages.length}
async function quickAnalyzeAI(){
  if(!quickImages.length){toast('Ajoute au moins une image d\'abord');return}
  const btn=document.getElementById('quickAnalyzeBtn');const original=btn?.innerHTML;
  if(btn){btn.disabled=true;btn.textContent='Analyse en cours…'}
  try{
    const fiche=await DB.analyzeImageAI(quickImages[0].data);
    const mainImg=quickImages[0].data,extras=quickImages.slice(1).map(x=>x.data);
    clearQuickImages();closeModal('quickAddModal');openItemEditor();
    transientImage=mainImg;editorExtraImages=extras;editorMainPreview='';renderEditorImagePreview();
    const set=(id,v)=>{const el=document.getElementById(id);if(el&&v!==null&&v!==undefined&&v!=='')el.value=v};
    set('fName',fiche.name);set('fBrand',fiche.brand);set('fStore',fiche.store);
    if(fiche.category)set('fSuper',fiche.category);
    set('fSub',fiche.subcategory);set('fColor',fiche.color);
    if(fiche.color_family)set('fColorFamily',fiche.color_family);
    if(fiche.price_num!=null){
      set('fPriceNum',fiche.price_num);
      set('fPrice',`${fiche.price_num}${fiche.currency?' '+fiche.currency:''}`);
    }
    if(fiche.original_price_num!=null)set('fOriginal',`${fiche.original_price_num}${fiche.currency?' '+fiche.currency:''}`);
    if(fiche.currency)set('fCurrency',fiche.currency);
    if(fiche.sale)set('fSale','Oui');
    if(fiche.url)set('fUrl',fiche.url);
    if(fiche.tags?.length)set('fTags',fiche.tags.join(', '));
    toast('Fiche préremplie par l\'IA — vérifie avant d\'enregistrer');
  }catch(e){
    console.error(e);toast(e.message||'Erreur pendant l\'analyse IA');
  }finally{
    if(btn){btn.disabled=!quickImages.length;btn.innerHTML=original}
  }
}
function removeQuickImage(i){quickImages.splice(i,1);renderQuickImages()}
function clearQuickImages(){quickImages=[];const i=document.getElementById('quickFileInput');if(i)i.value='';renderQuickImages()}
function createQuickDrafts(){if(!quickImages.length)return;const now=Date.now(),date=new Date().toISOString().slice(0,10);const drafts=quickImages.map((im,i)=>{const uid=`c-${now.toString(36)}-${i}`;return {uid,id:uid,name:`À compléter ${i+1}`,brand:'',store:'',supercategory:'Autre',subcategory:'À classer',category:'À classer',color:'',color_family:'Autre',price:'',price_num:null,original:'',discount:'',currency:'CAD',sale:'Non',purchase_type:'Plaisir',status:'À compléter',priority:'Moyenne',size:'',date_added:date,desire_score:3,utility_score:3,purchased:false,paid_price_num:null,purchase_date:'',tags:['à compléter'],url:'',image_url:im.data,note:'Ajout rapide depuis une image.'}});state.articles.unshift(...drafts);persist();clearQuickImages();closeModal('quickAddModal');go('catalog',{status:'À compléter'});toast(`${drafts.length} brouillon${drafts.length>1?'s':''} créé${drafts.length>1?'s':''}`)}

function openItemEditor(uid=null,mode='wishlist'){editTarget=uid;editMode=mode;transientImage='';const x=uid?byId(uid):{supercategory:'Vêtements',subcategory:'Tops',purchase_type:'Plaisir',status:'À considérer',priority:'Moyenne',desire_score:3,utility_score:3,currency:'CAD',sale:'Non',tags:[],owned:mode==='owned',wardrobe_active:mode==='owned',wardrobe_status:mode==='owned'?'À trier':''};editorExtraImages=[...(x?.images||[])];editorMainPreview=mainImage(x);document.getElementById('itemModalTitle').textContent=uid?'Modifier l’article':mode==='owned'?'Ajouter au vestiaire':'Ajouter un article';document.getElementById('itemFormWrap').innerHTML=itemForm(x);openModal('itemModal');renderEditorImagePreview();const up=document.getElementById('imageUpload');up?.addEventListener('change',handleImageUpload);document.getElementById('imageCaptureUpload')?.addEventListener('change',handleImageUpload);const zone=document.getElementById('singlePasteZone');if(zone){zone.onpaste=async(e)=>{const fs=[];for(const it of (e.clipboardData?.items||[])){if(it.type?.startsWith('image/')){const f=it.getAsFile();if(f)fs.push(f)}}if(fs.length){e.preventDefault();await addEditorFiles(fs)}};zone.ondragover=e=>e.preventDefault();zone.ondrop=async(e)=>{e.preventDefault();await addEditorFiles([...e.dataTransfer.files])}}}
function itemForm(x){const supers=['Vêtements','Chaussures','Bijoux','Accessoires','Technologies','Jeux','Livres','Maison','Beauté','Autre'];const types=['Besoin','Upgrade','Plaisir','Collection','Cadeau','À surveiller'];const statuses=['À compléter','À considérer','Favori','Attendre soldes','À essayer','Écarté'];const editStatus=isPurchased(x)?'À considérer':x.status;const priorities=['Basse','Moyenne','Haute','Obsédée'];const decisions=['À trier','Garder','Peut-être','Donner / vendre','Réparer / retoucher'];return `<div class="form"><label class="full"><span>Nom de l'article</span><input id="fName" value="${esc(x.name||'')}"></label><label><span>Marque</span><input id="fBrand" value="${esc(x.brand||'')}"></label><label><span>Magasin / plateforme</span><input id="fStore" value="${esc(x.store||'')}"></label><label><span>Grande catégorie</span><select id="fSuper">${supers.map(v=>`<option ${x.supercategory===v?'selected':''}>${v}</option>`).join('')}</select></label><label><span>Sous-catégorie</span><input id="fSub" value="${esc(x.subcategory||x.category||'')}"></label><label><span>Couleur exacte</span><input id="fColor" value="${esc(x.color||'')}"></label><label><span>Famille de couleur</span><select id="fColorFamily">${['Noir','Blanc / écru','Brun / beige','Bleu','Rouge','Orange','Rose / violet','Vert / olive','Jaune','Gris / métallisé','Motifs / multicolore','Autre'].map(v=>`<option ${x.color_family===v?'selected':''}>${v}</option>`).join('')}</select></label><label><span>Prix actuel</span><input id="fPrice" value="${esc(x.price||'')}"></label><label><span>Prix numérique (pour tri)</span><input id="fPriceNum" type="number" step="0.01" value="${x.price_num??''}"></label><label><span>Prix initial</span><input id="fOriginal" value="${esc(x.original||'')}"></label><label><span>Remise</span><input id="fDiscount" value="${esc(x.discount||'')}" placeholder="Ex. -50 %"></label><label><span>Devise</span><input id="fCurrency" value="${esc(x.currency||'CAD')}"></label><label><span>Soldé</span><select id="fSale"><option ${x.sale==='Non'?'selected':''}>Non</option><option ${x.sale==='Oui'?'selected':''}>Oui</option></select></label><label><span>Type d'achat</span><select id="fPurchaseType">${types.map(v=>`<option ${x.purchase_type===v?'selected':''}>${v}</option>`).join('')}</select></label><label><span>Statut</span><select id="fStatus">${statuses.map(v=>`<option ${editStatus===v?'selected':''}>${v}</option>`).join('')}</select></label><label><span>Priorité</span><select id="fPriority">${priorities.map(v=>`<option ${x.priority===v?'selected':''}>${v}</option>`).join('')}</select></label><label><span>Taille / variante visée</span><input id="fSize" value="${esc(x.size||'')}" placeholder="Ex. XL, 40, 512 Go…"></label><label><span>Date d'ajout</span><input id="fDateAdded" type="date" value="${esc(x.date_added||new Date().toISOString().slice(0,10))}"></label><div class="owned-toggle"><label class="checkline"><input id="fOwned" type="checkbox" ${(x.owned===true||isPurchased(x)||editMode==='owned')?'checked':''}> Dans mon vestiaire / déjà possédé</label><label><span>Décision vestiaire</span><select id="fWardrobeStatus">${decisions.map(v=>`<option ${wardrobeDecision(x)===v?'selected':''}>${v}</option>`).join('')}</select></label></div><label><span>Score envie (1–5)</span><div class="rangebox"><input id="fDesire" type="range" min="1" max="5" value="${x.desire_score||3}" oninput="this.nextElementSibling.textContent=this.value"><b>${x.desire_score||3}</b></div></label><label><span>Score utilité (1–5)</span><div class="rangebox"><input id="fUtility" type="range" min="1" max="5" value="${x.utility_score||3}" oninput="this.nextElementSibling.textContent=this.value"><b>${x.utility_score||3}</b></div></label><label class="full"><span>Tags (séparés par des virgules)</span><input id="fTags" value="${esc((x.tags||[]).join(', '))}" placeholder="goth, drapé, bureau, Japon, fripe…"></label><label class="full"><span>Lien vers l'article</span><input id="fUrl" value="${esc(x.url||'')}" placeholder="https://…"></label><label class="full"><span>Image principale par URL</span><input id="fImage" value="${esc(x.image_url||'')}" placeholder="https://…"></label><label class="full"><span>Images supplémentaires par URL (une par ligne)</span><textarea id="fImageUrls" placeholder="https://…\nhttps://…">${esc((x.images||[]).filter(v=>/^https?:/i.test(v)).join('\n'))}</textarea></label><div class="full dropzone" id="singlePasteZone" tabindex="0"><input id="imageUpload" type="file" accept="image/*" multiple><input id="imageCaptureUpload" type="file" accept="image/*" capture="environment" style="display:none"><div>Importe, glisse ou colle une ou plusieurs images. Plusieurs fichiers et plusieurs images du presse-papiers sont acceptés.</div><button type="button" class="btn" style="margin-top:8px" onclick="event.stopPropagation();document.getElementById('imageCaptureUpload').click()">${ICON_CAMERA} Prendre une photo</button></div><div class="full image-preview-grid" id="editorImagePreview"></div><label class="full"><span>Note perso</span><textarea id="fNote">${esc(x.note||'')}</textarea></label></div>${uidTrashButton(x.uid||'')}`}
function uidTrashButton(uid){return uid?`<div style="margin-top:14px"><button class="btn danger" onclick="closeModal('itemModal');trashItem('${uid}')">Envoyer dans la corbeille</button></div>`:''}
function renderEditorImagePreview(){const el=document.getElementById('editorImagePreview');if(!el)return;const parts=[];if(editorMainPreview||transientImage)parts.push(`<div class="image-preview main"><img src="${transientImage||editorMainPreview}" alt=""></div>`);editorExtraImages.forEach((img,i)=>parts.push(`<div class="image-preview"><img src="${img}" alt=""><button onclick="removeEditorImage(${i})">×</button></div>`));el.innerHTML=parts.join('')}
function removeEditorImage(i){editorExtraImages.splice(i,1);renderEditorImagePreview()}
async function addEditorFiles(files){const valid=[...files].filter(f=>f.type?.startsWith('image/'));for(const f of valid){const data=await compressImageFile(f,1100,.78);if(!editorMainPreview&&!transientImage)transientImage=data;else editorExtraImages.push(data)}renderEditorImagePreview();if(valid.length)toast(`${valid.length} photo${valid.length>1?'s':''} ajoutée${valid.length>1?'s':''}`)}
async function handleImageUpload(e){await addEditorFiles([...e.target.files])}
function val(id){return document.getElementById(id)?.value||''}
function saveItemForm(){const current=editTarget?byId(editTarget):null;const alreadyPurchased=isPurchased(current);const currentPrice=val('fPriceNum')===''?null:Number(val('fPriceNum'));const urlExtras=val('fImageUrls').split(/\n+/).map(x=>x.trim()).filter(Boolean);let main=transientImage||val('fImage').trim()||current?.image_url||'';let extras=[...new Set([...editorExtraImages,...urlExtras].filter(Boolean))];if(!main&&extras.length)main=extras.shift();extras=extras.filter(x=>x!==main);const owned=document.getElementById('fOwned')?.checked||false;const data={name:val('fName').trim()||'Sans titre',brand:val('fBrand').trim(),store:val('fStore').trim(),supercategory:val('fSuper'),subcategory:val('fSub').trim()||'Autre',category:val('fSub').trim()||'Autre',color:val('fColor').trim(),color_family:val('fColorFamily').trim()||'Autre',price:val('fPrice').trim(),price_num:currentPrice,original:val('fOriginal').trim(),discount:val('fDiscount').trim(),currency:val('fCurrency').trim(),sale:val('fSale'),purchase_type:val('fPurchaseType'),status:alreadyPurchased?'Acheté':val('fStatus'),priority:val('fPriority'),size:val('fSize').trim(),date_added:val('fDateAdded')||new Date().toISOString().slice(0,10),desire_score:Number(val('fDesire')||3),utility_score:Number(val('fUtility')||3),tags:val('fTags').split(',').map(x=>x.trim()).filter(Boolean),url:val('fUrl').trim(),image_url:main,images:extras,owned:alreadyPurchased?true:owned,wardrobe_active:alreadyPurchased?true:owned,wardrobe_status:val('fWardrobeStatus')||'À trier',ownership_origin:alreadyPurchased?(current?.ownership_origin||'purchased'):(owned?(current?.ownership_origin||'existing'):(current?.ownership_origin||'')),note:val('fNote').trim()};if(editTarget){applyItemPatch(editTarget,data)}else{data.uid='c-'+Date.now().toString(36);data.id=data.uid;data.purchased=false;data.paid_price_num=null;data.purchase_date='';(data.owned?state.wardrobeItems:state.articles).unshift(data)}persist();closeModal('itemModal');render();toast(editTarget?'Article modifié':owned?'Ajouté au vestiaire':'Article ajouté');editorExtraImages=[];editorMainPreview='';transientImage=''}
function openCollectionPicker(uid){collectionTarget=uid;document.getElementById('collectionModalBody').innerHTML=`<div class="collection-checks">${state.collections.map(c=>`<label class="checkcard"><input type="checkbox" data-coll="${c.id}" ${(c.items||[]).includes(uid)?'checked':''}><span><strong>${esc(c.emoji||'✦')} ${esc(c.name)}</strong></span></label>`).join('')||'<div class="empty">Aucune collection personnelle.</div>'}</div>`;openModal('collectionModal')}
function saveCollectionMembership(){if(!collectionTarget)return;document.querySelectorAll('#collectionModalBody [data-coll]').forEach(ch=>{const c=state.collections.find(x=>x.id===ch.dataset.coll);if(!c)return;c.items=c.items||[];if(ch.checked&&!c.items.includes(collectionTarget))c.items.push(collectionTarget);if(!ch.checked)c.items=c.items.filter(x=>x!==collectionTarget)});collectionTarget=null;persist();closeModal('collectionModal');render();toast('Collections mises à jour')}
function newCollectionFromModal(){closeModal('collectionModal');openNewCollection(true)}
function openNewCollection(preserveTarget=false){if(!preserveTarget)collectionTarget=null;document.getElementById('newCollName').value='';document.getElementById('newCollEmoji').value='✦';document.getElementById('newCollDesc').value='';openModal('newCollectionModal')}
function createCollection(){const name=val('newCollName').trim();if(!name){toast('Donne un nom à la collection');return}const c={id:'coll-'+Date.now().toString(36),name,emoji:val('newCollEmoji')||'✦',description:val('newCollDesc'),items:[]};if(collectionTarget)c.items.push(collectionTarget);state.collections.unshift(c);persist();closeModal('newCollectionModal');render();toast('Collection créée')}
function editCollection(id){const c=state.collections.find(x=>x.id===id);if(!c)return;const name=prompt('Nom de la collection',c.name);if(name===null)return;const desc=prompt('Description',c.description||'');c.name=name.trim()||c.name;c.description=desc??c.description;persist();render()}
function deleteCollection(id){const c=state.collections.find(x=>x.id===id);if(!c||!confirm(`Supprimer la collection « ${c.name} » ? Les éléments resteront disponibles dans l’app.`))return;state.collections=state.collections.filter(x=>x.id!==id);persist();render()}
async function openDataModal(){
  document.getElementById('dataModalBody').innerHTML=`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px"><button class="btn primary" onclick="exportData()">Exporter mes données</button><button class="btn danger" onclick="Auth.logout()">Se déconnecter</button></div><div class="full"><span class="eyebrow">IA — ta clé personnelle</span><p style="color:var(--muted);font-size:12px;margin:6px 0 10px">Chaque compte utilise sa propre clé OpenAI (jamais partagée, jamais visible dans le code). <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">Créer une clé ↗</a></p><input id="aiKeyInput" type="password" placeholder="sk-..." style="width:100%;border:1px solid var(--line);background:var(--card);border-radius:13px;padding:11px 12px;margin-bottom:8px"><button class="btn primary" onclick="saveAIKey()">Enregistrer la clé</button><span id="aiKeyStatus" style="margin-left:8px;font-size:12px;color:var(--muted)"></span></div>`;
  openModal('dataModal');
  const s=await DB.getSettings();
  const input=document.getElementById('aiKeyInput');
  if(input&&s.openai_api_key)input.placeholder='Clé enregistrée (••••'+s.openai_api_key.slice(-4)+')';
}
async function saveAIKey(){
  const key=document.getElementById('aiKeyInput')?.value.trim();
  const status=document.getElementById('aiKeyStatus');
  if(!key){if(status)status.textContent='Colle une clé d\'abord.';return}
  try{await DB.saveOpenAIKey(key);if(status)status.textContent='✓ Clé enregistrée';document.getElementById('aiKeyInput').value='';toast('Clé IA enregistrée')}
  catch(e){if(status)status.textContent='Erreur : '+e.message}
}

// === Mon Style (profil texte + Pinterest, garde-fous de coût IA) ==========
let styleImages=[];
let styleDeepConfirmed=false;

async function loadStyleView(){
  const profile=await DB.getStyleProfile();
  styleImages=profile.images;
  renderStyleModal(profile.style_text);
}
function styleMaxWishlistItems(){return Math.min(100,state.articles.filter(a=>!state.trash.includes(a.uid)&&!a.purchased).length)}
function renderStyleModal(text){
  const hasText=!!(text&&text.trim());
  const n=styleImages.length;
  const maxItems=styleMaxWishlistItems();
  const defItems=0;
  const defPin=n;
  document.getElementById('styleModalBody').innerHTML=`
    <label class="full"><span>Mon style, décrit avec mes mots</span><textarea id="styleText" style="min-height:140px" onblur="saveStyleTextOnly()">${esc(text||'')}</textarea></label>
    <div class="full" style="margin:2px 0 16px"><button class="btn primary" onclick="saveStyleTextOnly()">Enregistrer le texte</button></div>
    <div class="full"><span class="eyebrow">Captures Pinterest / inspirations (${n})</span>
      <div class="image-preview-grid" id="stylePhotoGrid">${styleImages.map(p=>`<div class="image-preview"><img src="${p.url}" alt=""><button onclick="removeStylePhoto(${p.id})">×</button></div>`).join('')}</div>
      <div class="dropzone" id="stylePasteZone" tabindex="0" style="margin-top:10px;cursor:pointer"><input id="styleFileInput" type="file" accept="image/*" multiple style="display:none"><div>Importe, glisse ou colle une ou plusieurs captures.</div></div>
    </div>
    <div class="full" style="margin-top:20px;border-top:1px solid var(--line);padding-top:16px">
      <span class="eyebrow">Générer / améliorer avec l'IA</span>
      <div style="margin:10px 0">
      ${hasText?`<label class="checkline" style="margin:6px 0"><input type="radio" name="styleMode" value="keep" checked> Améliorer le texte actuel</label><label class="checkline" style="margin:6px 0"><input type="radio" name="styleMode" value="scratch"> Repartir de zéro</label>`:''}
      <label class="checkline" style="margin:6px 0;align-items:flex-start"><input type="checkbox" id="styleUseWishlist" onchange="onStyleSliderChange()" style="margin-top:2px"><span>Utiliser un résumé léger de ma wishlist<br><small style="color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0">marques/couleurs/catégories les plus fréquentes</small></span></label>
      <p style="font-size:11px;color:var(--muted);margin:12px 0 2px">En complément du résumé ci-dessus (chiffres globaux), le curseur suivant ajoute le détail de pièces précises :</p>
      <div style="margin:6px 0 6px">
        <label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px">Pièces récentes envisagées à l'achat, en détail : <b id="styleItemCountLabel">${defItems}</b> / ${maxItems}</label>
        <input type="range" id="styleItemSlider" min="0" max="${maxItems}" value="${defItems}" oninput="onStyleSliderChange()" style="width:100%" ${maxItems?'':'disabled'}>
      </div>
      <div style="margin:14px 0 6px">
        <label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px">Captures Pinterest à utiliser : <b id="stylePinterestCountLabel">${defPin}</b> / ${n}</label>
        <input type="range" id="stylePinterestSlider" min="0" max="${n}" value="${defPin}" oninput="onStyleSliderChange()" style="width:100%" ${n?'':'disabled'}>
      </div>
      </div>
      <div id="styleEstimateBox" style="margin:4px 0 10px;font-size:12px;color:var(--muted)"></div>
      <button class="btn primary" id="styleGenerateBtn" onclick="runStyleGenerate()">${ICON_SPARKLE} Générer</button>
    </div>`;
  wireStylePasteZone();
  onStyleSliderChange();
}
// Miroir client (léger) de l'estimation serveur — juste pour un retour
// instantané pendant qu'on bouge les curseurs, sans appel réseau à chaque
// mouvement. Le serveur refait le vrai calcul de toute façon.
function estimateStyleLocal({textChars,imageCount,useWishlistSummary,wishlistItemCount}){
  const textTokens=Math.ceil(textChars/4);
  const imageTokens=imageCount*850;
  const summaryTokens=useWishlistSummary?500:0;
  const itemTokens=wishlistItemCount*45;
  const inputTokens=textTokens+imageTokens+summaryTokens+itemTokens+300;
  const outputTokens=3000;
  const costUSD=(inputTokens/1e6)*0.25+(outputTokens/1e6)*2.00;
  return {inputTokens,outputTokens,costUSD};
}
const STYLE_CONFIRM_THRESHOLD_USD=0.01;
function onStyleSliderChange(){
  const itemSlider=document.getElementById('styleItemSlider'),pinSlider=document.getElementById('stylePinterestSlider');
  const itemLabel=document.getElementById('styleItemCountLabel'),pinLabel=document.getElementById('stylePinterestCountLabel');
  if(itemLabel&&itemSlider)itemLabel.textContent=itemSlider.value;
  if(pinLabel&&pinSlider)pinLabel.textContent=pinSlider.value;
  styleDeepConfirmed=false;
  const btn=document.getElementById('styleGenerateBtn'),box=document.getElementById('styleEstimateBox');
  if(!btn)return;
  const text=document.getElementById('styleText')?.value||'';
  const useWishlistSummary=document.getElementById('styleUseWishlist')?.checked||false;
  const wishlistItemCount=Number(itemSlider?.value||0);
  const imageCount=Number(pinSlider?.value||0);
  const est=estimateStyleLocal({textChars:text.length,imageCount,useWishlistSummary,wishlistItemCount});
  if(box)box.innerHTML=`Estimation : ≈ ${est.inputTokens+est.outputTokens} tokens, environ <b>${est.costUSD.toFixed(4)} $</b>.`;
  btn.innerHTML=est.costUSD>STYLE_CONFIRM_THRESHOLD_USD?`Voir le coût et confirmer`:`${ICON_SPARKLE} Générer`;
}
function wireStylePasteZone(){
  const zone=document.getElementById('stylePasteZone');const input=document.getElementById('styleFileInput');
  if(input)input.onchange=e=>handleStyleFiles([...e.target.files]);
  if(zone){
    zone.onclick=()=>input?.click();
    zone.onpaste=async(e)=>{const fs=[];for(const it of (e.clipboardData?.items||[])){if(it.type?.startsWith('image/')){const f=it.getAsFile();if(f)fs.push(f)}}if(fs.length){e.preventDefault();await handleStyleFiles(fs)}};
    zone.ondragover=e=>e.preventDefault();
    zone.ondrop=async(e)=>{e.preventDefault();await handleStyleFiles([...e.dataTransfer.files])};
    setTimeout(()=>zone.focus(),80);
  }
}
async function handleStyleFiles(files){
  const imgs=files.filter(f=>f.type?.startsWith('image/'));
  if(!imgs.length)return;
  const currentText=document.getElementById('styleText')?.value||'';
  for(const f of imgs){const data=await compressImageFile(f,1200,.78);await DB.addStyleImage(data)}
  const profile=await DB.getStyleProfile();styleImages=profile.images;
  renderStyleModal(currentText);
  toast(`${imgs.length} image${imgs.length>1?'s':''} ajoutée${imgs.length>1?'s':''}`);
}
async function removeStylePhoto(id){
  const currentText=document.getElementById('styleText')?.value||'';
  await DB.removeStyleImage(id);
  const profile=await DB.getStyleProfile();styleImages=profile.images;
  renderStyleModal(currentText);
}
async function saveStyleTextOnly(){
  await DB.saveStyleText(document.getElementById('styleText')?.value||'');
  toast('Style enregistré');
}
async function runStyleGenerate(){
  const text=document.getElementById('styleText')?.value||'';
  const modeEl=document.querySelector('input[name="styleMode"]:checked');
  const mode=modeEl?modeEl.value:'scratch';
  const useWishlistSummary=document.getElementById('styleUseWishlist')?.checked||false;
  const wishlistItemCount=Number(document.getElementById('styleItemSlider')?.value||0);
  const imageCount=Number(document.getElementById('stylePinterestSlider')?.value||0);
  const btn=document.getElementById('styleGenerateBtn'),box=document.getElementById('styleEstimateBox');
  const est=estimateStyleLocal({textChars:text.length,imageCount,useWishlistSummary,wishlistItemCount});

  if(est.costUSD>STYLE_CONFIRM_THRESHOLD_USD&&!styleDeepConfirmed){
    btn.disabled=true;btn.textContent='Calcul de l\'estimation…';
    try{
      const serverEst=await DB.estimateStyleCost({textChars:text.length,imageCount,useWishlistSummary,wishlistItemCount});
      box.innerHTML=`Cette demande coûte plus que la normale : <b>≈ ${serverEst.inputTokens+serverEst.outputTokens} tokens</b>, environ <b>${serverEst.costUSD.toFixed(4)} $</b>.`;
      btn.textContent=`Confirmer et lancer (~${serverEst.costUSD.toFixed(4)} $)`;
      styleDeepConfirmed=true;
    }catch(e){box.textContent='Erreur estimation : '+e.message}
    btn.disabled=false;
    return;
  }

  btn.disabled=true;btn.textContent='Génération en cours…';
  try{
    const imagesToSend=styleImages.slice(-imageCount).map(p=>p.url);
    const result=await DB.generateStyle({currentText:text,mode,images:imagesToSend,useWishlistSummary,wishlistItemCount});
    document.getElementById('styleText').value=result.styleText;
    await DB.saveStyleText(result.styleText);
    toast('Texte généré — relis et enregistre si ça te convient');
  }catch(e){toast(e.message||'Erreur IA')}
  finally{btn.disabled=false;styleDeepConfirmed=false;box.innerHTML='';onStyleSliderChange()}
}

// === Assistant shopping (panier budget-aware, choisi dans la vraie wishlist) ===
let shoppingDeepConfirmed=false;
let lastShoppingResult=null;
let shoppingHistoryCache=[];
function shoppingMaxCandidates(){return Math.min(150,state.articles.filter(a=>!state.trash.includes(a.uid)&&!a.purchased).length)}
function wishlistCountSince(months){
  const cutoff=new Date();cutoff.setMonth(cutoff.getMonth()-months);
  const cutoffStr=cutoff.toISOString().slice(0,10);
  return state.articles.filter(a=>!state.trash.includes(a.uid)&&!a.purchased&&a.date_added&&a.date_added>=cutoffStr).length;
}
function setShoppingItemPreset(months){
  const max=shoppingMaxCandidates();
  const n=months?Math.min(max,wishlistCountSince(months)):max;
  const slider=document.getElementById('shopItemSlider');
  if(slider)slider.value=Math.max(1,n||1);
  onShoppingSliderChange();
}
function renderShoppingModal(){
  const max=shoppingMaxCandidates();
  const def=max;
  document.getElementById('shoppingModalBody').innerHTML=`
    <p style="color:var(--muted);font-size:12px;margin:0 0 14px">L'IA choisit uniquement parmi tes vrais articles de wishlist (jamais de produit inventé), en tenant compte de ton style, de ton vestiaire, et de ce que tu cherches ci-dessous.</p>
    <label class="full"><span>Ce que je recherche (type de vêtement, style, occasion... — libre)</span><textarea id="shopQuery" placeholder="Ex. une veste chaude et élégante pour l'hiver, plutôt sobre"></textarea></label>
    <div class="full"><button type="button" class="btn" onclick="document.getElementById('shopAdvanced').classList.toggle('hide')">Critères avancés (facultatif) ▾</button></div>
    <div class="full hide" id="shopAdvanced" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">
      <label><span>Budget</span><input id="shopBudget" type="number" min="1" step="1" placeholder="laisser vide = pas de limite" oninput="onShoppingSliderChange()"></label>
      <label><span>Devise</span><input id="shopCurrency" value="CAD" oninput="onShoppingSliderChange()"></label>
      <label><span>Catégorie</span><input id="shopCategory" placeholder="Ex. manteau, robe, chaussures…"></label>
      <label><span>Couleur souhaitée</span><input id="shopColor" placeholder="Ex. bordeaux, noir…"></label>
      <label><span>Occasion / saison</span><input id="shopOccasion" placeholder="Ex. hiver, soirée, quotidien…"></label>
      <label><span>Marque préférée</span><input id="shopBrand" placeholder="Facultatif"></label>
    </div>
    <div class="full" style="margin:14px 0 6px">
      <label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px">Pièces de wishlist à considérer : <b id="shopItemCountLabel">${def}</b> / ${max}</label>
      <input type="range" id="shopItemSlider" min="1" max="${max||1}" value="${def||1}" oninput="onShoppingSliderChange()" style="width:100%" ${max?'':'disabled'}>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
        <button type="button" class="btn" onclick="setShoppingItemPreset(1)">Ajoutées il y a -1 mois</button>
        <button type="button" class="btn" onclick="setShoppingItemPreset(3)">-3 mois</button>
        <button type="button" class="btn" onclick="setShoppingItemPreset(6)">-6 mois</button>
        <button type="button" class="btn" onclick="setShoppingItemPreset(0)">Toutes les pièces</button>
      </div>
    </div>
    <div id="shoppingEstimateBox" class="full" style="margin:4px 0 10px;font-size:12px;color:var(--muted)"></div>
    <div class="full"><button class="btn primary" id="shoppingGenerateBtn" onclick="runShoppingGenerate()">${ICON_SPARKLE} Générer un panier</button></div>
    <div class="full" id="shoppingResults" style="margin-top:18px"></div>
    <div class="full" id="shoppingHistoryBox"></div>
  `;
  onShoppingSliderChange();
  loadShoppingHistory();
}
async function loadShoppingHistory(){
  try{
    shoppingHistoryCache=await DB.listShoppingGenerations(30);
    renderShoppingHistoryCarousel();
  }catch(e){console.error(e)}
}
let shoppingHistorySeq=0;
function renderShoppingHistoryCarousel(){
  const box=document.getElementById('shoppingHistoryBox');if(!box)return;
  if(!shoppingHistoryCache.length){box.innerHTML='';return}
  const id=`shoppingHistory_${++shoppingHistorySeq}`;
  box.innerHTML=`<div style="margin-top:26px;border-top:1px solid var(--line);padding-top:16px">
    <span class="eyebrow">Paniers générés précédemment (${shoppingHistoryCache.length})</span>
    <div class="history-carousel" id="${id}">
      <button class="media-carousel-arrow prev" type="button" aria-label="Paniers plus récents" onclick="moveHistoryCarousel('${id}',-1)">‹</button>
      <div class="history-carousel-track" id="${id}_track">${shoppingHistoryCache.map(shoppingHistoryCard).join('')}</div>
      <button class="media-carousel-arrow next" type="button" aria-label="Paniers plus anciens" onclick="moveHistoryCarousel('${id}',1)">›</button>
    </div>
  </div>`;
}
function shoppingHistoryCard(h){
  const picks=h.result?.picks||[];
  const img=picks.map(p=>mainImage(byId(p.uid))).filter(Boolean)[0]||'';
  const totals=Object.entries(h.result?.totalsByCurrency||{}).map(([c,v])=>`${v.toFixed(0)} ${c}`).join(' + ')||'—';
  const date=new Date(h.created_at).toLocaleDateString('fr-CA',{day:'numeric',month:'short'});
  const title=h.query?h.query.slice(0,60):`Panier du ${date}`;
  return `<button class="history-card" onclick="openShoppingHistoryDetail(${h.id})">
    <div class="history-card-imgs">${img?`<img src="${img}" alt="">`:''}</div>
    <div class="history-card-copy"><b>${esc(title)}</b><span>${esc(date)} · ${esc(totals)} · ${picks.length} pièce${picks.length>1?'s':''}</span></div>
  </button>`;
}
function moveHistoryCarousel(id,delta){
  const track=document.getElementById(`${id}_track`);if(!track)return;
  track.scrollBy({left:delta*(track.clientWidth-40),behavior:'smooth'});
}
function openShoppingHistoryDetail(id){
  const h=shoppingHistoryCache.find(x=>x.id===id);if(!h)return;
  lastShoppingResult=h.result;
  const date=new Date(h.created_at).toLocaleDateString('fr-CA',{day:'numeric',month:'long',year:'numeric'});
  document.getElementById('galleryTitle').textContent=`Panier du ${date}`;
  document.getElementById('galleryBody').innerHTML=`${h.query?`<p style="color:var(--muted);font-size:12px;margin-top:0">${esc(h.query)}</p>`:''}${shoppingResultHTML(h.result)}<div class="full" style="margin-top:14px"><button class="btn danger" onclick="deleteShoppingHistoryEntry(${h.id})">Supprimer cet historique</button></div>`;
  openModal('galleryModal');
}
async function deleteShoppingHistoryEntry(id){
  if(!confirm('Supprimer ce panier de l\'historique ?'))return;
  try{
    await DB.deleteShoppingGeneration(id);
    shoppingHistoryCache=shoppingHistoryCache.filter(h=>h.id!==id);
    closeModal('galleryModal');
    renderShoppingHistoryCarousel();
    toast('Historique supprimé');
  }catch(e){toast(e.message||'Erreur de suppression')}
}
function estimateShoppingLocal(candidateCount){
  const candidateTokens=candidateCount*45,wardrobeSummaryTokens=500,wardrobeAndOutfitsTokens=400,styleTokens=250,promptOverhead=300;
  const inputTokens=candidateTokens+wardrobeSummaryTokens+wardrobeAndOutfitsTokens+styleTokens+promptOverhead,outputTokens=3000;
  const costUSD=(inputTokens/1e6)*0.25+(outputTokens/1e6)*2.00;
  return {inputTokens,outputTokens,costUSD};
}
const SHOPPING_CONFIRM_THRESHOLD_USD=0.01;
function onShoppingSliderChange(){
  const slider=document.getElementById('shopItemSlider'),label=document.getElementById('shopItemCountLabel');
  if(label&&slider)label.textContent=slider.value;
  shoppingDeepConfirmed=false;
  const btn=document.getElementById('shoppingGenerateBtn'),box=document.getElementById('shoppingEstimateBox');
  if(!btn)return;
  const est=estimateShoppingLocal(Number(slider?.value||0));
  if(box)box.innerHTML=`Estimation : ≈ ${est.inputTokens+est.outputTokens} tokens, environ <b>${est.costUSD.toFixed(4)} $</b>.`;
  btn.innerHTML=est.costUSD>SHOPPING_CONFIRM_THRESHOLD_USD?'Voir le coût et confirmer':`${ICON_SPARKLE} Générer un panier`;
}
async function runShoppingGenerate(){
  const budget=Number(document.getElementById('shopBudget')?.value||0);
  const currency=(document.getElementById('shopCurrency')?.value||'CAD').trim()||'CAD';
  const extra=[['Catégorie','shopCategory'],['Couleur souhaitée','shopColor'],['Occasion / saison','shopOccasion'],['Marque préférée','shopBrand']]
    .map(([label,id])=>{const v=document.getElementById(id)?.value.trim();return v?`${label} : ${v}`:''}).filter(Boolean).join(' · ');
  const query=[(document.getElementById('shopQuery')?.value||'').trim(),extra].filter(Boolean).join('\n');
  const itemLimit=Number(document.getElementById('shopItemSlider')?.value||0);
  const btn=document.getElementById('shoppingGenerateBtn'),box=document.getElementById('shoppingEstimateBox'),results=document.getElementById('shoppingResults');
  if(!budget&&!query){
    toast('Indique un budget ou ce que tu recherches');
    const qEl=document.getElementById('shopQuery');
    if(qEl){qEl.focus();qEl.style.borderColor='var(--sale)';setTimeout(()=>{qEl.style.borderColor=''},2200)}
    return
  }
  const est=estimateShoppingLocal(itemLimit);

  if(est.costUSD>SHOPPING_CONFIRM_THRESHOLD_USD&&!shoppingDeepConfirmed){
    btn.disabled=true;btn.textContent='Calcul de l\'estimation…';
    try{
      const serverEst=await DB.estimateShoppingCost({candidateCount:itemLimit});
      box.innerHTML=`Cette demande coûte plus que la normale : <b>≈ ${serverEst.inputTokens+serverEst.outputTokens} tokens</b>, environ <b>${serverEst.costUSD.toFixed(4)} $</b>.`;
      btn.textContent=`Confirmer et lancer (~${serverEst.costUSD.toFixed(4)} $)`;
      shoppingDeepConfirmed=true;
    }catch(e){box.textContent='Erreur estimation : '+e.message}
    btn.disabled=false;
    return;
  }

  btn.disabled=true;btn.textContent='Génération en cours…';results.innerHTML='';
  try{
    const result=await DB.runShoppingAssistant({budget,currency,itemLimit,query});
    lastShoppingResult=result;
    renderShoppingResults(result);
    toast('Panier proposé — relis avant d\'ajouter au panier réel');
    try{
      const saved=await DB.saveShoppingGeneration({query,budget:budget||null,currency,result});
      shoppingHistoryCache.unshift(saved);
      renderShoppingHistoryCarousel();
    }catch(e){console.error('Sauvegarde historique échouée:',e)}
  }catch(e){toast(e.message||'Erreur IA')}
  finally{btn.disabled=false;shoppingDeepConfirmed=false;box.innerHTML='';onShoppingSliderChange()}
}
function shoppingResultHTML(result){
  const picks=(result.picks||[]).map(p=>({...p,item:byId(p.uid)})).filter(p=>p.item);
  const totals=Object.entries(result.totalsByCurrency||{}).map(([c,v])=>`${v.toFixed(2)} ${c}`).join(' + ')||'—';
  return `<div style="border-top:1px solid var(--line);padding-top:14px">
      <p style="color:var(--muted);font-size:13px">${esc(result.note||'')}</p>
      <div class="statsline"><span class="pill">Total : ${esc(totals)}</span><span class="pill">Budget visé : ${esc(String(result.budget?.amount||''))} ${esc(result.budget?.currency||'')}</span></div>
      <div class="listview" style="margin-top:10px">${picks.map(p=>{const tag=p.item.url?'a':'div';const attrs=p.item.url?`href="${safeUrl(p.item.url)}" target="_blank" rel="noopener"`:'';return `<${tag} class="listitem" ${attrs}><img src="${mainImage(p.item)}" alt=""><div><h3>${esc(p.item.name)}</h3><p>${esc(p.item.brand||'')} · ${esc(p.item.price||'')}</p><p style="color:var(--muted);font-size:11px">${esc(p.reason||'')}</p>${p.outfit_note?`<p style="font-size:11px;margin-top:4px"><b>${ICON_SPARKLE} Avec ton vestiaire :</b> ${esc(p.outfit_note)}</p>`:''}</div></${tag}>`}).join('')||'<div class="empty">Aucune suggestion.</div>'}</div>
      ${picks.length?`<div class="full" style="margin-top:12px"><button class="btn primary" onclick="addShoppingPicksToCart()">Ajouter ces ${picks.length} pièces au panier</button></div>`:''}
    </div>`;
}
function renderShoppingResults(result){
  document.getElementById('shoppingResults').innerHTML=shoppingResultHTML(result);
}
function addShoppingPicksToCart(){
  if(!lastShoppingResult)return;
  (lastShoppingResult.picks||[]).forEach(p=>{if(!state.cart.includes(p.uid))state.cart.push(p.uid)});
  persist();
  toast('Ajouté au panier');
  go('cart');
}

function exportData(){const blob=new Blob([JSON.stringify({version:4,exportedAt:new Date().toISOString(),state},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='wishlist-studio-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(a.href);toast('Backup exporté')}

// === Démarrage : attend la session avant d'afficher quoi que ce soit ======
Auth.onReady(async (session)=>{
  const gate=document.getElementById('authGate');
  const root=document.getElementById('appRoot');
  if(!session){ gate.classList.add('open'); root.classList.add('hide'); return; }
  gate.classList.remove('open'); root.classList.remove('hide');
  if(!state){
    state=await DB.loadState();
    lastSynced=DB.snapshot(state);
    render();
  }
});
