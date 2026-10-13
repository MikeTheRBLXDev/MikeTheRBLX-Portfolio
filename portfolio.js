(() => {
  const home = document.body.dataset.page === 'home';
  const categories = ['ui','scripting'];
  const folders = {ui:'UI',scripting:'Scripting'};
  const imageExt = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
  const videoExt = /\.(mp4|webm|ogg|mov|m4v)$/i;
  const assetURL = path => path.split('/').map(encodeURIComponent).join('/');
  const state = {category:'ui',manifest:{},ready:false,item:null,opener:null};
  const grid = document.getElementById(home?'home-work-grid':'portfolio-grid');
  const empty = document.getElementById('portfolio-empty');
  const panel = document.getElementById('portfolio-content');
  const tabs = [...document.querySelectorAll('.portfolio-tab')];
  const modal = document.getElementById('media-modal');
  const modalContent = document.getElementById('modal-content');
  const modalActions = document.getElementById('modal-actions');
  const modalTitle = document.getElementById('modal-title');
  const closeButton = document.getElementById('modal-close');
  function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className=className; if (text) node.textContent=text; return node; }
  function projectHash(item,category=state.category) { return `#${category}/${encodeURIComponent(item.slug)}`; }
  function projectHref(item) { return `${home?'portfolio.html':''}${projectHash(item)}`; }
  function projectURL(item) { const url=new URL('portfolio.html',location.href); url.hash=projectHash(item); return url.href; }
  function shareButton(item) {
    const button = element('button',home?'share-link':'share-link','Copy link'); button.type='button';
    button.setAttribute('aria-label',`Copy link to ${item.title}`);
    button.addEventListener('click',()=>window.portfolioCopy(projectURL(item),'Project link copied',button)); return button;
  }
  function hookPreview(link,item) {
    if (home) return;
    link.addEventListener('click',event=>{
      if (event.metaKey||event.ctrlKey||event.shiftKey||event.altKey) return;
      event.preventDefault(); state.opener=link;
      if (location.hash===projectHash(item)) openModal(item); else location.hash=projectHash(item);
    });
  }
  function thumbnail(item,eager) {
    const link=element('a','project-preview'); link.href=projectHref(item);
    const isVideo=item.type==='youtube'||videoExt.test(item.path||'');
    link.setAttribute('aria-label',`${isVideo?'Watch':'View'} ${item.title}`);
    let media;
    if (videoExt.test(item.path||'')) { media=element('video'); media.src=assetURL(item.path); media.muted=true; media.playsInline=true; media.preload='metadata'; }
    else {
      media=element('img'); media.src=item.type==='youtube'?`https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`:assetURL(item.path);
      media.alt=item.title; media.loading=eager?'eager':'lazy'; media.decoding='async'; media.width=1600; media.height=1000;
    }
    link.append(media);
    if (isVideo) { const play=element('span','youtube-play','▶'); play.setAttribute('aria-hidden','true'); link.append(play); }
    if(item.featured)link.append(element('span','feature-label','FEATURED PROJECT'));
    hookPreview(link,item); return link;
  }
  function card(item,index) {
    const article=element('article','work-card');
    const details=element('div','project-details');
    const isVideo=item.type==='youtube'||videoExt.test(item.path||'');
    const kind=state.category==='ui'?(isVideo?'UI DESIGN / MOTION':'ROBLOX UI DESIGN'):'ROBLOX SCRIPTING / DEMO';
    details.append(element('p','project-kind',kind),element(home?'h3':'h2','project-title',item.title));
    if(item.description) details.append(element('p','project-description',item.description));
    const actions=element('div','project-actions');
    const view=element('a','text-link',isVideo?'Watch the demo ↗':'Explore the interface ↗');view.href=projectHref(item);hookPreview(view,item);
    actions.append(view,shareButton(item)); details.append(actions);article.append(thumbnail(item,home&&index===0),details);return article;
  }
  function visible(category) { return (state.manifest[category]||[]).filter(item=>!item.hidden); }
  function render() {
    const items=visible(state.category);
    const featured=items.find(item=>item.featured);
    const sorted=featured?[featured,...items.filter(item=>item!==featured)]:items;
    grid.replaceChildren(...(home?sorted.slice(0,3):sorted).map(card));
    if(home){
      const status=document.getElementById('home-work-status');status.textContent=items.length?'':'New work is on the way. Get in touch to see examples.';status.hidden=items.length>0;grid.removeAttribute('aria-busy');
      const selected=featured||items[0], hero=document.getElementById('hero-project');
      if(selected){
        const img=document.getElementById('hero-project-image');
        if(selected.type==='youtube'){img.src=`https://i.ytimg.com/vi/${selected.id}/hqdefault.jpg`;img.alt=selected.title;}
        else if(imageExt.test(selected.path||'')){img.src=assetURL(selected.path);img.alt=selected.title;}
        else { const video=element('video');video.src=assetURL(selected.path);video.muted=true;video.playsInline=true;video.preload='metadata';video.setAttribute('aria-label',selected.title);hero.replaceChildren(video); }
        hero.href=`portfolio.html${projectHash(selected,'ui')}`;hero.setAttribute('aria-label',`View ${selected.title}`);document.getElementById('hero-project-title').textContent=selected.title;
      }else{document.querySelector('.hero-stage').hidden=true;}
      // Loading project cards changes the page height. Preserve the requested section.
      const anchor=location.hash.slice(1);
      if(['work','services','process','about'].includes(anchor))
        requestAnimationFrame(()=>document.getElementById(anchor)?.scrollIntoView({behavior:'instant',block:'start'}));
      return;
    }
    empty.hidden=items.length>0;
    document.getElementById('portfolio-count').textContent=`${items.length} ${items.length===1?'project':'projects'}`;
    document.getElementById('portfolio-context-copy').textContent=state.category==='ui'?'Like the direction? Your UI can be tailored to your game’s style, screens, and interactions.':'A deeper look at my Roblox development background. I can consider smaller scripting tasks alongside my main focus on UI.';
    panel.setAttribute('aria-labelledby',`tab-${state.category}`);
    for(const tab of tabs){const active=tab.dataset.category===state.category;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
  }
  function openModal(item) {
    if(state.item?.slug===item.slug&&modal.open)return;
    state.item=item;modalTitle.textContent=item.title;modalContent.replaceChildren();modalActions.replaceChildren();
    let media;
    if(item.type==='youtube'){
      media=element('iframe','youtube-frame');media.src=`https://www.youtube-nocookie.com/embed/${item.id}?autoplay=1&rel=0`;
      media.title=item.title;media.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';media.allowFullscreen=true;media.referrerPolicy='strict-origin-when-cross-origin';
    }else if(videoExt.test(item.path)){
      media=element('video');media.src=assetURL(item.path);media.controls=true;media.autoplay=true;media.playsInline=true;media.setAttribute('aria-label',item.title);
    }else{media=element('img');media.src=assetURL(item.path);media.alt=item.title;}
    modalContent.append(media); const desc=document.getElementById('modal-description');desc.textContent=item.description||'';desc.hidden=!item.description;
    const share=shareButton(item);share.className='button button-small';share.textContent='Copy project link';modalActions.append(share);
    const enquiry=element('a','button button-primary button-small','Discuss a similar project ↗');enquiry.href='contact.html';modalActions.append(enquiry);
    if(item.type==='youtube'){const external=element('a','button button-small','Watch on YouTube ↗');external.href=`https://www.youtube.com/watch?v=${item.id}`;external.target='_blank';external.rel='noopener noreferrer';modalActions.append(external);}
    if(!modal.open)modal.showModal();document.body.classList.add('modal-is-open');closeButton.focus({preventScroll:true});
  }
  function dismiss(updateHash=true) {
    if(!modal?.open)return;modal.close();state.item=null;modalContent.replaceChildren();document.body.classList.remove('modal-is-open');
    if(updateHash)history.replaceState(null,'',`#${state.category}`);
    const target=state.opener?.isConnected?state.opener:tabs.find(tab=>tab.dataset.category===state.category);target?.focus({preventScroll:true});state.opener=null;
  }
  function route() {
    let category,slug;
    try{
      const hash=location.hash.slice(1), separator=hash.indexOf('/');
      category=decodeURIComponent(separator<0?hash:hash.slice(0,separator));
      slug=separator<0?undefined:decodeURIComponent(hash.slice(separator+1));
    }catch{category='ui';}
    if(!categories.includes(category))category='ui';
    if(state.category!==category){dismiss(false);state.category=category;if(state.ready)render();}
    if(!state.ready)return;
    const item=visible(category).find(project=>project.slug===slug);
    if(item)openModal(item);else dismiss(false);
  }
  if(!home){
    closeButton.addEventListener('click',()=>dismiss());modal.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
    modal.addEventListener('click',event=>{if(event.target!==modal)return;const bounds=modal.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dismiss();});
    tabs.forEach((tab,index)=>{
      tab.addEventListener('click',()=>{location.hash=tab.dataset.category;});
      tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;if(next===undefined)return;event.preventDefault();tabs[next].focus();location.hash=tabs[next].dataset.category;});
    });window.addEventListener('hashchange',route);
  }
  async function load() {
    panel?.setAttribute('aria-busy','true');
    try{
      const response=await fetch('portfolio.json',{cache:'no-cache'});if(!response.ok)throw Error('Unavailable');const data=await response.json();
      for(const category of categories){
        const used=new Set();
        state.manifest[category]=(Array.isArray(data[category])?data[category]:[]).filter(item=>{
          if(!item||typeof item!=='object')return false;
          if(item.type==='youtube')return typeof item.id==='string'&&/^[A-Za-z0-9_-]{11}$/.test(item.id);
          return item.type==='media'&&typeof item.path==='string'&&item.path.startsWith(`assets/${folders[category]}/`)&&!/[\\\x00-\x1f]/.test(item.path)&&!item.path.split('/').some(part=>part==='..'||part==='.'||!part)&&(imageExt.test(item.path)||videoExt.test(item.path));
        }).map(item=>{
          const fallback=(typeof item.path==='string'?item.path.split('/').pop():'Roblox demo').replace(/\.[^.]+$/,'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ');
          const title=typeof item.title==='string'&&item.title.trim()?item.title:fallback;
          const base=typeof item.slug==='string'&&item.slug?item.slug:item.id||title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'project';
          let slug=base,n=2;while(used.has(slug))slug=`${base}-${n++}`;used.add(slug);
          return {...item,title,slug,description:typeof item.description==='string'?item.description:'',hidden:item.hidden===true};
        });
      }
      state.ready=true;if(!home)route();render();
    }catch{
      if(home){const status=document.getElementById('home-work-status');status.hidden=false;status.textContent='Previews are unavailable right now. Explore the work page or get in touch to see examples.';grid.removeAttribute('aria-busy');}
      else{empty.hidden=false;empty.querySelector('h3').textContent='Previews are unavailable right now.';empty.querySelector('p').textContent='Please try again shortly, or get in touch to see examples.';}
    }finally{panel?.removeAttribute('aria-busy');}
  }
  load();
})();
