(function(){
  var o=document.getElementById('ldr');if(!o)return;
  for(var n=0;n<34;n++){
    var b=document.createElement('i'),z=4+Math.random()*8;
    b.style.cssText='left:'+(Math.random()*100)+'%;width:'+z+'px;height:'+z+'px;'+
      '--d:'+(1.6+Math.random()*1.4).toFixed(2)+'s;--t:'+(-Math.random()*2.5).toFixed(2)+'s;'+
      '--x:'+((Math.random()-.5)*60).toFixed(0)+'px;--o:'+(.35+Math.random()*.55).toFixed(2);
    o.appendChild(b);
  }
  // Icon: stacked 3D burst with the upward arrow. Arms extend clockwise.
  var ang=[-6,24,56,88,120,152,188,224,256,288,322,356],len=[190,140.6,174.8,129.2,182.4,136.8,171,125.4,190,136.8,176.7,148.2];
  var layers=[[376,'#b5654a'],[364,'#c98b72'],[358,'#d9a58c'],[354,'#e6b9a5'],[352,'#ebc1ad'],[350,'#fff7f1']];
  function arm(a,l,i){return '<g transform="rotate('+a+')"><path class="arm" style="--a:'+(0.35+i*0.11).toFixed(2)+'s" d="M-24.7,0 L-13.3,-'+l+' A13.3,13.3 0 0 1 13.3,-'+l+' L24.7,0 Z"/></g>'}
  var star='';
  layers.forEach(function(L){
    star+='<g transform="translate(256,'+L[0]+') scale(1,.46)" fill="'+L[1]+'">'+ang.map(function(a,i){return arm(a,len[i],i)}).join('')+'<circle r="36.1"/></g>';
  });
  var svg='<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><defs>'+
    '<linearGradient id="ldBg" x1=".1" y1="0" x2=".9" y2="1"><stop offset="0" stop-color="#e8906f"/><stop offset=".55" stop-color="#d97757"/><stop offset="1" stop-color="#bd5d3f"/></linearGradient>'+
    '<linearGradient id="ldSh" gradientUnits="userSpaceOnUse" x1="0" y1="350" x2="0" y2="136"><stop offset="0" stop-color="#d9a58c"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#fff"/></linearGradient>'+
    '<clipPath id="ldTile"><rect width="512" height="512" rx="112"/></clipPath></defs>'+
    '<g clip-path="url(#ldTile)"><rect width="512" height="512" fill="url(#ldBg)"/>'+
    '<ellipse cx="256" cy="384" rx="190" ry="44" fill="#4a170a" opacity=".4"/>'+star+
    '<ellipse cx="256" cy="350" rx="36" ry="15" fill="#7a2f18"/><ellipse cx="256" cy="350" rx="36" ry="15" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="3"/>'+
    '<g class="arw"><path d="M252,360 L260,360 L269,136 L243,136 Z" fill="url(#ldSh)"/><circle cx="256" cy="122" r="13" fill="#fff"/>'+
    '<path d="M-13,0 L-2.5,-84 A2.5,2.5 0 0 1 2.5,-84 L13,0 Z" transform="translate(256,122) rotate(225)" fill="#fff"/>'+
    '<path d="M-13,0 L-2.5,-84 A2.5,2.5 0 0 1 2.5,-84 L13,0 Z" transform="translate(256,122) rotate(135)" fill="#fff"/></g></g>'+
    '<rect x="3" y="3" width="506" height="506" rx="109" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="3"/></svg>';
  var ico=o.firstChild;ico.innerHTML=svg;
  // Particles lift off the arrow as it dissolves
  for(var k=0;k<16;k++){
    var q=document.createElement('b'),w=3+Math.random()*5;
    q.style.cssText='left:'+(44+Math.random()*12)+'%;top:'+(18+Math.random()*10)+'%;width:'+w+'px;height:'+w+'px;'+
      '--d:'+(0.9+Math.random()*0.7).toFixed(2)+'s;--t:'+(1.4+Math.random()*0.9).toFixed(2)+'s;--x:'+((Math.random()-.5)*50).toFixed(0)+'px';
    ico.appendChild(q);
  }
  var gone=false;
  function done(){if(gone)return;gone=true;o.classList.add('out');setTimeout(function(){o.remove()},500)}
  o.addEventListener('pointerdown',done);
  setTimeout(done,3000);
})();
