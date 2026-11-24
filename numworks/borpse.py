# Borpse Bry Sisters - NumWorks
# Arrows move, OK headbutt, EXE charge
from kandinsky import fill_rect as R,draw_string as S
from ion import keydown as K
from ion import KEY_LEFT,KEY_RIGHT,KEY_UP,KEY_DOWN,KEY_OK,KEY_EXE,KEY_ONE,KEY_TWO,KEY_THREE,KEY_FOUR
from time import monotonic as T,sleep
from random import randint as RI
W=320;H=222;TOP=20
G=(96,168,72);INK=(40,28,20);PAPER=(250,240,220)
def bx(x,y,s,c):R(int(x)-s//2,int(y)-s//2,s,s,c)
def dd(x,y,u,v):return((x-u)**2+(y-v)**2)**.5
def key(k):
 if not K(k):return 0
 while K(k):sleep(.01)
 return 1
def wait(*ks):
 while 1:
  for i in range(len(ks)):
   if key(ks[i]):return i
  sleep(.02)
def scr(lines,y=40):
 R(0,0,W,H,PAPER)
 for l in lines:
  S(l,max(0,160-len(l)*5),y,INK,PAPER);y+=22
CROPS=((40,60),(270,60),(30,150),(280,150),(110,200),(210,200))
def new():
 global mhp,dmg,spd,truf,c,crops,lv
 mhp=100;dmg=7;spd=3.0;truf=0;c=1;lv=[0,0,0]
 crops=[[x,y,10] for x,y in CROPS]
def farm():return sum(k[2] for k in crops)*100//60
def shop():
 while 1:
  co=[8+5*lv[0],10+6*lv[1],8+5*lv[2]]
  scr(["BETWEEN COURSES","Truffles: "+str(truf)+"  Farm "+str(farm())+"%",
   "1 Slop +25 HP     ("+str(co[0])+")","2 Tusks +4 DMG    ("+str(co[1])+")",
   "3 Trotters +SPD   ("+str(co[2])+")","4 Replant farm    (6)","OK: ring the bell"],20)
  i=wait(KEY_ONE,KEY_TWO,KEY_THREE,KEY_FOUR,KEY_OK)
  if i==4:return
  buy(i,co)
def buy(i,co):
 global truf,mhp,dmg,spd
 p=6 if i==3 else co[i]
 if truf<p or(i==2 and lv[2]>=4):return
 truf-=p
 if i==3:
  for k in crops:k[2]=min(10,k[2]+3)
  return
 lv[i]+=1
 if i==0:mhp+=25
 elif i==1:dmg+=4
 else:spd+=.5
def course():
 global truf
 # pig
 px,py=160.,130.;fx,fy=0,-1;hp=mhp;atk=0;cd=0;dash=0;inv=0;hitA=0;ok=1
 # Allen
 ax,ay=160.,TOP+12;amhp=300+150*c;ahp=amhp;st='c';at=40;hung=0;stag=0;adx=ady=0;tc=-1;asp=1.1+.25*c;adm=10+3*c
 # Earwhen (last course)
 E=[160.,TOP+14,300,0] if c==5 else None
 bots=[];trs=[];cream=[];spawn=90;fr=0;hud='';won=0
 R(0,0,W,H,G);R(0,0,W,TOP,INK)
 while 1:
  t0=T();fr+=1
  # erase
  bx(px,py,16,G);bx(ax,ay,24,G)
  for b in bots:bx(b[0],b[1],10,G)
  for k in cream:bx(k[0],k[1],6,G)
  if E:bx(E[0],E[1],20,G)
  # pig
  mx=K(KEY_RIGHT)-K(KEY_LEFT);my=K(KEY_DOWN)-K(KEY_UP)
  if dash>0:
   dash-=1;px+=fx*7;py+=fy*7;inv=2
  else:
   if mx or my:
    fx,fy=mx,my;s=spd*(.7 if mx and my else 1);px+=mx*s;py+=my*s
   if K(KEY_EXE)and cd<=0:dash=8;cd=70;hitA=0
   o=K(KEY_OK);tap=o and not ok;ok=o
   if tap and atk<=0:
    atk=5;hx=px+fx*12;hy=py+fy*12
    if ahp>0 and dd(hx,hy,ax,ay)<17:
     ahp-=dmg*(2 if st=='x'else 1);stag+=1;ax+=fx*5;ay+=fy*5
     if stag>=6 and st in'cr':st='x';at=45;stag=0
    for b in bots:
     if dd(hx,hy,b[0],b[1])<13:b[2]-=dmg;b[0]+=fx*8;b[1]+=fy*8
    if E and dd(hx,hy,E[0],E[1])<18:E[2]-=dmg
  px=min(W-8,max(8,px));py=min(H-8,max(TOP+8,py))
  atk-=1;cd-=1;inv-=1
  if dash>0:
   if ahp>0 and not hitA and dd(px,py,ax,ay)<18:ahp-=dmg*3;hitA=1;stag+=2
   for b in bots:
    if dd(px,py,b[0],b[1])<12:b[2]-=dmg*2
   if E and dd(px,py,E[0],E[1])<18 and not hitA:E[2]-=dmg*3;hitA=1
  # Allen
  if ahp>0:
   at-=1;d=dd(px,py,ax,ay)
   if st=='c':
    hung+=1
    if tc<0 and hung>220:
     a=[i for i in range(6)if crops[i][2]>0]
     m=999
     for i in a:
      g=dd(ax,ay,crops[i][0],crops[i][1])
      if g<m:m=g;tc=i
    if d<(18 if tc>=0 else 28)and at<=0:st='w';at=12
    elif tc<0 and d<120 and at<=0 and RI(0,70)==0:st='v';at=16;adx=(px-ax)/d;ady=(py-ay)/d
    else:
     gx,gy=(crops[tc][0],crops[tc][1])if tc>=0 else(px,py)
     g=dd(ax,ay,gx,gy)
     if tc>=0 and g<12:st='e';at=40
     elif g>1:ax+=(gx-ax)/g*asp;ay+=(gy-ay)/g*asp
   elif st=='w'and at<=0:
    if d<32 and inv<=0:hp-=adm;inv=15;px+=(px-ax)/(d+1)*14;py+=(py-ay)/(d+1)*14
    st='r';at=14
   elif st=='v'and at<=0:st='d';at=14
   elif st=='d':
    ax+=adx*6;ay+=ady*6
    if d<16 and inv<=0:hp-=adm;inv=15
    if ax<10 or ax>W-10 or ay<TOP+12 or ay>H-10:st='x';at=60
    elif at<=0:st='r';at=12
    ax=min(W-10,max(10,ax));ay=min(H-10,max(TOP+12,ay))
   elif st=='e':
    k=crops[tc]
    if at%10==0 and k[2]>0:k[2]-=1
    if at<=0 or k[2]<=0:st='r';at=10;tc=-1;hung=0
   elif st in'rx'and at<=0:st='c'
   ax=min(W-12,max(12,ax));ay=min(H-12,max(TOP+12,ay))
  # kitchen bots
  spawn-=1
  if spawn<=0 and len(bots)<2+c:
   bots.append([RI(20,W-20),TOP+6.,10+4*c,0]);spawn=max(70,200-25*c)
  for b in bots:
   g=dd(px,py,b[0],b[1])+.1;b[0]+=(px-b[0])/g*1.6;b[1]+=(py-b[1])/g*1.6;b[3]-=1
   if g<9 and b[3]<=0 and inv<=0:hp-=3+c;b[3]=25
  for b in bots:
   if b[2]<=0:trs.append((b[0],b[1]));bx(b[0],b[1],10,G)
  bots=[b for b in bots if b[2]>0]
  # Earwhen and his cream
  if E:
   E[3]+=1;E[0]+=2*(1 if(E[3]//60)%2 else -1);E[0]=min(W-14,max(14,E[0]))
   if E[3]%36==0:
    g=dd(px,py,E[0],E[1])+.1;cream.append([E[0],E[1],(px-E[0])/g*3.5,(py-E[1])/g*3.5])
   if E[2]<=0:bx(E[0],E[1],20,G);E=None;truf+=25
  for k in cream:
   k[0]+=k[2];k[1]+=k[3]
   if dd(px,py,k[0],k[1])<8 and inv<=0:hp-=6;inv=10;k[1]=999
  cream=[k for k in cream if 0<k[0]<W and TOP<k[1]<H]
  # truffles
  n=[]
  for q in trs:
   if dd(px,py,q[0],q[1])<10:truf+=3;bx(q[0],q[1],6,G)
   else:n.append(q)
  trs=n
  # draw
  for k in crops:bx(k[0],k[1],16,(40,130,40)if k[2]>5 else(140,150,50)if k[2]>0 else(110,80,50))
  for q in trs:bx(q[0],q[1],5,(110,70,30))
  for b in bots:bx(b[0],b[1],9,(45,45,55))
  for k in cream:bx(k[0],k[1],5,(255,255,255))
  if E:bx(E[0],E[1],18,(235,235,225));bx(E[0],E[1]-3,6,(240,200,120))
  if ahp>0:
   bx(ax,ay,20,(255,60,40)if st in'wv'else(150,150,150)if st=='x'else(230,130,50))
   bx(ax,ay-4,8,(250,220,190))
  bx(px,py,12,(255,255,255)if inv>0 and fr%2 else(247,168,184));bx(px+fx*6,py+fy*6,4,(200,90,110))
  s="C"+str(c)+" HP"+str(max(0,hp))+" A"+str(max(0,ahp))+(" E"+str(E[2])if E else"")+" T"+str(truf)+" F"+str(farm())+"%"
  if s!=hud:hud=s;R(0,0,W,TOP,INK);S(s,4,1,PAPER,INK)
  if hp<=0 or farm()<=0:return 0
  if ahp<=0 and not E:truf+=10+5*c;return 1
  if ahp<=0 and not won:won=1;hp=min(mhp,hp+30);bx(ax,ay,24,G)
  sleep(max(0,.04-(T()-t0)))
def main():
 while 1:
  new()
  scr(["THE BORPSE BRY SISTERS","Allen is at the gate.","Arrows: move","OK: headbutt","EXE: charge (dodges too)","Press OK"])
  wait(KEY_OK)
  global c
  while 1:
   scr(["COURSE "+str(c)+(" - EARWHEN!"if c==5 else""),"Stop Allen eating the farm!","Press OK"],70);wait(KEY_OK)
   if not course():scr(["THE FARM FELL","Allen ate well tonight.","OK: try again"],70);wait(KEY_OK);break
   if c==5:scr(["THE FARM IS SAVED!","Allen and Earwhen flee.","OK: play again"],70);wait(KEY_OK);break
   c+=1;shop()
main()
