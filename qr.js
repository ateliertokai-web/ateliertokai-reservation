/* QRコード（外部ライブラリなし）。お客様画面・お連れ様・アルバム・管理画面で共通に使う */
/* ---------- QRコード（外部ライブラリなし。バイトモード・誤り訂正M・型番1〜10） ---------- */
window.QR=(function(){
  var ECC=[0,10,16,26,18,24,16,18,22,22,26],BLK=[0,1,1,1,2,2,4,4,4,5,5];
  function raw(v){var r=(16*v+128)*v+64;if(v>=2){var n=Math.floor(v/7)+2;r-=(25*n-10)*n-55;if(v>=7)r-=36}return r}
  function dataCw(v){return Math.floor(raw(v)/8)-ECC[v]*BLK[v]}
  function mul(x,y){var z=0;for(var i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x}return z&255}
  function div(d){var r=[];for(var i=0;i<d-1;i++)r.push(0);r.push(1);var root=1;for(i=0;i<d;i++){for(var j=0;j<r.length;j++){r[j]=mul(r[j],root);if(j+1<r.length)r[j]^=r[j+1]}root=mul(root,2)}return r}
  function rem(data,dv){var r=dv.map(function(){return 0});data.forEach(function(b){var f=b^r.shift();r.push(0);dv.forEach(function(c,i){r[i]^=mul(c,f)})});return r}
  function utf8(s){var o=[],e=unescape(encodeURIComponent(s));for(var i=0;i<e.length;i++)o.push(e.charCodeAt(i));return o}
  function make(text){
    var bytes=utf8(text),v,cap;
    for(v=1;v<=10;v++){cap=dataCw(v)*8;if(4+(v<10?8:16)+bytes.length*8<=cap)break}
    if(v>10)throw new Error('too long');
    var bits=[],push=function(val,n){for(var i=n-1;i>=0;i--)bits.push((val>>>i)&1)};
    push(4,4);push(bytes.length,v<10?8:16);bytes.forEach(function(b){push(b,8)});
    push(0,Math.min(4,cap-bits.length));while(bits.length%8)bits.push(0);
    for(var p=0xEC;bits.length<cap;p^=0xEC^0x11)push(p,8);
    var data=[];for(var i=0;i<bits.length;i+=8){var b=0;for(var j=0;j<8;j++)b=(b<<1)|bits[i+j];data.push(b)}
    // 誤り訂正とインターリーブ
    var nb=BLK[v],el=ECC[v],rc=Math.floor(raw(v)/8),ns=nb-rc%nb,sl=Math.floor(rc/nb),dv=div(el),blocks=[],k=0;
    for(i=0;i<nb;i++){var d=data.slice(k,k+sl-el+(i<ns?0:1));k+=d.length;var ec=rem(d,dv);if(i<ns)d.push(0);blocks.push(d.concat(ec))}
    var all=[];for(i=0;i<blocks[0].length;i++)for(j=0;j<nb;j++)if(i!==sl-el||j>=ns)all.push(blocks[j][i]);
    var size=v*4+17,M=[],F=[];for(i=0;i<size;i++){M.push([]);F.push([]);for(j=0;j<size;j++){M[i].push(false);F[i].push(false)}}
    var set=function(x,y,dk){M[y][x]=dk;F[y][x]=true};
    for(i=0;i<size;i++){set(6,i,i%2===0);set(i,6,i%2===0)}
    [[3,3],[size-4,3],[3,size-4]].forEach(function(c){for(var dy=-4;dy<=4;dy++)for(var dx=-4;dx<=4;dx++){var x=c[0]+dx,y=c[1]+dy,dd=Math.max(Math.abs(dx),Math.abs(dy));if(x>=0&&x<size&&y>=0&&y<size)set(x,y,dd!==2&&dd!==4)}});
    if(v>1){var na=Math.floor(v/7)+2,step=Math.ceil((v*4+4)/(na*2-2))*2,pos=[6];for(var q=size-7;pos.length<na;q-=step)pos.splice(1,0,q);
      for(i=0;i<na;i++)for(j=0;j<na;j++){if((i===0&&j===0)||(i===0&&j===na-1)||(i===na-1&&j===0))continue;for(var ay=-2;ay<=2;ay++)for(var ax=-2;ax<=2;ax++)set(pos[i]+ax,pos[j]+ay,Math.max(Math.abs(ax),Math.abs(ay))!==1)}}
    var fmt=function(mask){var dd=(0<<3)|mask,r=dd;for(var t=0;t<10;t++)r=(r<<1)^((r>>>9)*0x537);var b=((dd<<10)|r)^0x5412,g=function(n){return ((b>>>n)&1)!==0};
      for(var t2=0;t2<=5;t2++)set(8,t2,g(t2));set(8,7,g(6));set(8,8,g(7));set(7,8,g(8));for(t2=9;t2<15;t2++)set(14-t2,8,g(t2));
      for(t2=0;t2<8;t2++)set(size-1-t2,8,g(t2));for(t2=8;t2<15;t2++)set(8,size-15+t2,g(t2));set(8,size-8,true)};
    fmt(0);
    if(v>=7){var r7=v;for(i=0;i<12;i++)r7=(r7<<1)^((r7>>>11)*0x1F25);var vb=(v<<12)|r7;for(i=0;i<18;i++){var bt=((vb>>>i)&1)!==0,a=size-11+i%3,c2=Math.floor(i/3);set(a,c2,bt);set(c2,a,bt)}}
    var n=0;for(var right=size-1;right>=1;right-=2){if(right===6)right=5;for(var vt=0;vt<size;vt++)for(j=0;j<2;j++){var x=right-j,up=((right+1)&2)===0,y=up?size-1-vt:vt;if(!F[y][x]&&n<all.length*8){M[y][x]=((all[n>>>3]>>>(7-(n&7)))&1)!==0;n++}}}
    var cond=function(m,x,y){switch(m){case 0:return (x+y)%2===0;case 1:return y%2===0;case 2:return x%3===0;case 3:return (x+y)%3===0;case 4:return (Math.floor(x/3)+Math.floor(y/2))%2===0;case 5:return x*y%2+x*y%3===0;case 6:return (x*y%2+x*y%3)%2===0;default:return ((x+y)%2+x*y%3)%2===0}};
    var apply=function(m){for(var y=0;y<size;y++)for(var x=0;x<size;x++)if(!F[y][x]&&cond(m,x,y))M[y][x]=!M[y][x]};
    var pen=function(){var s=0,dark=0,x,y,run,c;
      for(y=0;y<size;y++){run=1;for(x=1;x<size;x++){if(M[y][x]===M[y][x-1]){run++;if(run===5)s+=3;else if(run>5)s++}else run=1}}
      for(x=0;x<size;x++){run=1;for(y=1;y<size;y++){if(M[y][x]===M[y-1][x]){run++;if(run===5)s+=3;else if(run>5)s++}else run=1}}
      for(y=0;y<size-1;y++)for(x=0;x<size-1;x++){c=M[y][x];if(c===M[y][x+1]&&c===M[y+1][x]&&c===M[y+1][x+1])s+=3}
      for(y=0;y<size;y++)for(x=0;x<size;x++)if(M[y][x])dark++;
      s+=Math.floor(Math.abs(dark*20-size*size*10)/(size*size))*10;return s};
    var best=0,bp=1e9;for(var m=0;m<8;m++){apply(m);fmt(m);var pp=pen();if(pp<bp){bp=pp;best=m}apply(m)}
    apply(best);fmt(best);
    return M;
  }
  // 画像（PNGのdata URL）にする。長押しで保存できるように <img> で表示する
  function dataURL(text,scale){
    var M=make(text),s=scale||6,q=4,n=M.length,cv=document.createElement('canvas'),cx;
    cv.width=cv.height=(n+q*2)*s;cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);cx.fillStyle='#000';
    for(var y=0;y<n;y++)for(var x=0;x<n;x++)if(M[y][x])cx.fillRect((x+q)*s,(y+q)*s,s,s);
    return cv.toDataURL('image/png');
  }
  return {make:make,dataURL:dataURL};
})();
