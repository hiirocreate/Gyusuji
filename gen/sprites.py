"""BEEF HUNTER オリジナルキャラ スプライト生成器 v3
原作（牛すじハンター／コーラムバイン）の画風を参考にした「プリレンダ・ローポリ」調。
- 曲面は面ごとに陰影を分けるファセット表現（角のあるローポリ感）
- 人型は2.4頭身・首なし・関節を見せない。顔は丸い単色の目だけ
- 髪や兜は「一つの塊から顔の窓と前髪の切れ込みを削り出す」方式で、後付け感をなくす
使い方: python3 sprites3.py <出力dir> [キャラID ...]
"""
import sys, os, math
import numpy as np
from PIL import Image, ImageFilter

FRAME=64; SS=4; PITCH=math.radians(40)

def hexc(h): h=h.lstrip('#'); return np.array([int(h[i:i+2],16)/255 for i in (0,2,4)])
def rot(ax,a):
    c,s=math.cos(a),math.sin(a)
    if ax=='x': return np.array([[1,0,0],[0,c,-s],[0,s,c]])
    if ax=='y': return np.array([[c,0,s],[0,1,0],[-s,0,c]])
    return np.array([[c,-s,0],[s,c,0],[0,0,1]])
def look(a,b):
    d=np.array(b,float)-np.array(a,float); L=np.linalg.norm(d); y=d/L
    x=np.cross(y,[0,0,1.0])
    if np.linalg.norm(x)<1e-6: x=np.cross(y,[1.0,0,0])
    x/=np.linalg.norm(x); z=np.cross(x,y); return np.stack([x,y,z],1),L
V3=lambda *a: np.array(a,float)

class S:
    """SDFプリミティブ。op: add / blend（滑らかにつなぐ）/ sub（削る）。facet: 面分割数（0で滑らか）"""
    def __init__(me,kind,c,col,R=None,op='add',k=0.0,spec=0.2,emit=0.0,facet=(7,12),**a):
        me.kind=kind; me.c=np.array(c,float); me.R=np.eye(3) if R is None else np.array(R,float)
        me.col=hexc(col) if isinstance(col,str) else np.array(col,float)
        me.op=op; me.bk=k; me.spec=spec; me.emit=emit; me.facet=facet; me.a=a
        if kind in ('box','oct'): me.facet=0
    def d(me,p):
        if me.kind=='grp': return scene(me.a['ch'],p)
        q=(p-me.c)@me.R; a=me.a; sc=a.get('sc')
        if sc is not None: return me._d(q/np.array(sc))*min(sc)
        return me._d(q)
    def _d(me,q):
        a=me.a
        if me.kind=='sph': return np.linalg.norm(q,axis=1)-a['r']
        if me.kind=='ell':
            r=np.array(a['r']); k0=np.linalg.norm(q/r,axis=1); k1=np.linalg.norm(q/(r*r),axis=1); return k0*(k0-1)/np.maximum(k1,1e-9)
        if me.kind=='box':
            b=np.array(a['b']); rr=a.get('rr',0.0); qq=np.abs(q)-b+rr
            return np.linalg.norm(np.maximum(qq,0),axis=1)+np.minimum(qq.max(1),0)-rr
        if me.kind=='cap':
            y=np.clip(q[:,1],0,a['h']); return np.linalg.norm(q-np.stack([0*y,y,0*y],1),axis=1)-a['r']
        if me.kind=='cone':
            h=a['h']/2; r1,r2=a['ra'],a['rb']; qx=np.linalg.norm(q[:,[0,2]],axis=1); qy=q[:,1]-h
            k1=np.array([r2,h]); k2=np.array([r2-r1,2*h])
            ca=np.stack([qx-np.minimum(qx,np.where(qy<0,r1,r2)),np.abs(qy)-h],1)
            qv=np.stack([qx,qy],1); t=np.clip(((k1-qv)@k2)/(k2@k2),0,1); cb=qv-k1+k2*t[:,None]
            sg=np.where((cb[:,0]<0)&(ca[:,1]<0),-1.0,1.0)
            return sg*np.sqrt(np.minimum((ca*ca).sum(1),(cb*cb).sum(1)))-a.get('rr',0.0)
        if me.kind=='oct': return (np.abs(q).sum(1)-a['sz'])*0.57735-a.get('rr',0.0)
        if me.kind=='tor':
            qx=np.linalg.norm(q[:,[0,2]],axis=1)-a['r1']; return np.sqrt(qx*qx+q[:,1]**2)-a['r2']
        raise ValueError(me.kind)

def scene(prims,p,want_idx=False):
    D=np.full(len(p),1e9); idx=np.full(len(p),-1); best=np.full(len(p),1e9)
    for i,pr in enumerate(prims):
        di=pr.d(p)
        if pr.op=='sub': D=np.maximum(D,-di) if pr.bk==0 else _smax(D,-di,pr.bk); continue
        if pr.op=='blend' and pr.bk>0:
            h=np.clip(0.5+0.5*(D-di)/pr.bk,0,1); D=D*(1-h)+di*h-pr.bk*h*(1-h)
        else: D=np.minimum(D,di)
        if want_idx: b=di<best; best=np.where(b,di,best); idx=np.where(b,i,idx)
    return (D,idx) if want_idx else D
def _smax(a,b,k):
    h=np.clip(0.5+0.5*(b-a)/k,0,1); return a*(1-h)+b*h+k*h*(1-h)

def facetize(N,pr):
    """法線を面ごとに量子化してローポリ調の面を作る"""
    nlat,nlon=pr.facet; R=pr.R
    n=N@R; th=np.arccos(np.clip(n[:,1],-1,1)); ph=np.arctan2(n[:,2],n[:,0])
    ti=np.floor(th/(math.pi/nlat)); thq=(ti+0.5)*math.pi/nlat
    off=(ti%2)*0.5; phq=(np.floor(ph/(2*math.pi/nlon)+off)-off+0.5)*2*math.pi/nlon
    nq=np.stack([np.sin(thq)*np.cos(phq),np.cos(thq),np.sin(thq)*np.sin(phq)],1)
    return nq@R.T

def render(prims,n,view=1.4,cy=0.55):
    cam=rot('x',-PITCH); right=cam@[1,0,0.]; up=cam@[0,1,0.]; fwd=cam@[0,0,-1.]
    ys,xs=np.mgrid[0:n,0:n]; u=((xs-n/2+.5)/n*view).ravel(); v=(-(ys-n/2+.5)/n*view).ravel()
    O=u[:,None]*right+v[:,None]*up+V3(0,cy,0)-fwd*3
    t=np.zeros(len(O)); act=np.arange(len(O)); hit=np.zeros(len(O),bool)
    for _ in range(150):
        if not len(act): break
        d=scene(prims,O[act]+fwd*t[act,None]); t[act]+=d*0.8
        h=d<0.0005; hit[act[h]]=True; act=act[(~h)&(t[act]<6)]
    img=np.zeros((n*n,4)); hi=np.where(hit)[0]
    if len(hi):
        P=O[hi]+fwd*t[hi,None]; e=0.001
        N=np.stack([scene(prims,P+np.eye(3)[i]*e)-scene(prims,P-np.eye(3)[i]*e) for i in range(3)],1)
        N/=np.linalg.norm(N,axis=1,keepdims=True)+1e-9
        _,idx=scene(prims,P,True); idx=np.maximum(idx,0)
        for i,pr in enumerate(prims):
            m=(idx==i)
            if m.any() and pr.facet: N[m]=facetize(N[m],pr)
        col=np.array([p.col for p in prims])[idx]; sp=np.array([p.spec for p in prims])[idx]; em=np.array([p.emit for p in prims])[idx]
        L=V3(-0.5,0.75,0.45); L/=np.linalg.norm(L)
        nd=np.clip(N@L,0,1)
        fill=np.clip(N@(-fwd),0,1)
        dif=0.38+0.5*nd+0.3*fill
        H=L-fwd; H/=np.linalg.norm(H); spec=np.clip(N@H,0,1)**24*sp
        c=col*dif[:,None]+spec[:,None]+em[:,None]*col*0.6
        img[hi,:3]=np.clip(c,0,1); img[hi,3]=1
    return img.reshape(n,n,4)

def post(img,out,ow,shadow=None):
    n=img.shape[0]; a=Image.fromarray((img[...,3]*255).astype(np.uint8))
    dil=np.array(a.filter(ImageFilter.MaxFilter(ow*2+1)))>0
    base=np.zeros_like(img)
    if shadow is not None:
        ys,xs=np.mgrid[0:n,0:n]; e=((xs-n/2)/(n*0.19))**2+((ys-shadow)/(n*0.06))**2<1; base[e]=[0,0,0,0.25]
    base[dil]=[0.12,0.09,0.12,1.0]; m=img[...,3]>0; base[m]=img[m]
    return Image.fromarray((np.clip(base,0,1)*255).astype(np.uint8),'RGBA').resize((out,out),Image.LANCZOS)

def turn(prims,yaw):
    R=rot('y',yaw)
    for p in prims:
        p.c=R@p.c; p.R=R@p.R
        if p.kind=='grp': turn(p.a['ch'],yaw)
    return prims

# ---------------- 共通パーツ ----------------
SKIN='#ffe6d6'
def eyes(P,hc,hr,col='#1c1420',size=0.12,gap=0.34,y=-0.06):
    """丸い単色の目（ハイライト・鼻・口なし）"""
    for s in (-1,1):
        n=V3(gap*s,y,0); n[2]=math.sqrt(1-n[0]**2-n[1]**2)
        P.append(S('sph',hc+n*hr*0.955,col,r=size*hr,facet=0,spec=0.0))

def frame3(y,n):
    y=y/np.linalg.norm(y); z=n-y*(n@y); z/=np.linalg.norm(z); x=np.cross(y,z); return np.stack([x,y,z],1)

def mass(hc,hr,col,window=(0.7,0.62,0.5),wy=-0.3,bangs=((-0.42,0.5),(-0.14,0.58),(0.16,0.56),(0.44,0.48)),extra=(),r=(1.07,1.0,1.06),lift=0.1,back=0.07,facet=(6,10),spec=0.25,bulge=True,cut=None,subs=()):
    """髪・兜の塊：一つの塊から『顔の窓』を削り、額へ流れ落ちる前髪を同じ塊に溶け込ませる（一体成形）"""
    ch=[S('ell',hc+V3(0,lift,-back)*hr,col,r=tuple(x*hr for x in r))]
    if bulge:   # 毛束のふくらみで球体感を崩す
        for (x,y,z) in ((-0.62,0.35,-0.45),(0.62,0.35,-0.45),(0,0.55,-0.6),(-0.75,-0.25,-0.3),(0.75,-0.25,-0.3)):
            ch.append(S('sph',hc+V3(x,y,z)*hr,col,op='blend',k=0.04,r=0.5*hr))
    for e in extra: ch.append(e)
    if cut is not None:   # 帽子の下で髪を切りそろえ、帽子を突き抜けないようにする
        ch.append(S('box',hc+V3(0,cut+2.0,0)*hr,col,op='sub',k=0.01,b=(3*hr,2*hr,3*hr)))
    for s_ in subs: ch.append(s_)
    ch.append(S('ell',hc+V3(0,wy,0.92)*hr,col,op='sub',k=0.015,r=tuple(w*hr for w in window)))
    top=wy+window[1]
    for x,ln in bangs:   # 前髪：塊から下向きにとがって伸び、額にそう
        n0=V3(x,top+0.12,0); n0[2]=math.sqrt(max(1-n0[0]**2-n0[1]**2,0.05)); base=hc+n0*hr*1.02
        n1=V3(x*1.05,top+0.12-ln,0); n1[2]=math.sqrt(max(1-n1[0]**2-n1[1]**2,0.05)); tip=hc+n1*hr*1.03
        ch.append(S('cone',base,col,op='blend',k=0.02,R=frame3(tip-base,(n0+n1)/2),h=np.linalg.norm(tip-base),ra=0.2*hr,rb=0.004,sc=(1,1,0.45)))
    return S('grp',(0,0,0),col,ch=ch,facet=facet,spec=spec)

def spike(base,dirv,ln,rad,col,op='blend',k=0.03):
    R,_=look(base,np.array(base)+np.array(dirv)); return S('cone',base,col,R=R,op=op,k=k,h=ln,ra=rad,rb=0.004,facet=(3,6))

def body(ph,cloth,pants,boots,mitten=SKIN,hr=0.255,stout=1.0,robe=None,belt=None):
    """2.4頭身の一体成形ボディ。短い脚、台形の胴、肩から一本の袖＋ミトン、首なし"""
    sw=math.sin(ph); bob=abs(math.cos(ph))*0.02; P=[]
    for s in (-1,1):
        z=0.07*sw*s
        P.append(S('cap',(0.07*s*stout,0.06+bob,z),pants,r=0.062*stout,h=0.17,facet=(4,8)))
        P.append(S('box',(0.07*s*stout,0.045+bob,z+0.022),boots,b=(0.066*stout,0.048,0.085),rr=0.03))
    if robe: P.append(S('cone',(0,0.03+bob,0),robe,h=0.46,ra=0.21*stout,rb=0.12*stout,rr=0.03,facet=(4,10)))
    P.append(S('cone',(0,0.17+bob,0),cloth,h=0.36,ra=0.155*stout,rb=0.115*stout,rr=0.04,op='blend',k=0.02,facet=(4,10)))
    if belt: P.append(S('tor',(0,0.2+bob,0),belt,r1=0.15*stout,r2=0.022,facet=(4,10)))
    hands=[]
    for s in (-1,1):
        a=V3(0.11*s*stout,0.47+bob,0); b=a+V3(0.07*s,-0.2,-0.07*sw*s)
        R,L=look(a,b); P.append(S('cap',a,cloth,R=R,r=0.052*stout,h=L,op='blend',k=0.07,facet=(4,8)))
        P.append(S('sph',b+V3(0,-0.02,0),mitten,r=0.058*stout,op='blend',k=0.02,facet=(4,8))); hands.append(b+V3(0,-0.02,0))
    hc=V3(0,0.53+hr*0.92+bob,0.01)
    P.append(S('sph',hc,SKIN,r=hr,op='blend',k=0.03,facet=0,spec=0.05))
    return P,hands,hc,hr

# ---------------- 主人公（本作オリジナル） ----------------
def summoner(ph):
    """召喚士：どんぐり帽の若葉の術師。葉のポンチョ、八面体の種結晶の杖"""
    P,h,hc,hr=body(ph,'#43a047','#4e342e','#6d4c41',belt='#8d6e63')
    P.append(mass(hc,hr,'#a1673a',cut=0.42))
    P.append(S('ell',hc+V3(0,0.48,-0.04)*hr,'#7a4a24',r=(1.18*hr,0.6*hr,1.18*hr),facet=(4,9),spec=0.1))   # どんぐり帽
    P.append(S('tor',hc+V3(0,0.22,-0.04)*hr,'#5d3a1a',r1=1.0*hr,r2=0.1*hr,facet=(3,12)))
    P.append(S('cone',hc+V3(0,1.0,-0.04)*hr,'#5d3a1a',R=rot('z',0.25),h=0.3*hr,ra=0.08*hr,rb=0.03*hr,facet=(2,6)))
    eyes(P,hc,hr)
    P.append(S('cone',(0,0.3,0),'#66bb6a',h=0.2,ra=0.19,rb=0.12,rr=0.01,facet=(3,8)))                    # 葉のポンチョ
    for a_ in np.linspace(-2.6,2.6,8):
        P.append(S('oct',V3(math.sin(a_)*0.18,0.29,math.cos(a_)*0.18),'#81c784',R=rot('y',a_)@rot('x',0.35),sz=0.06,sc=(1,1.3,0.35)))
    st=h[1]; R,L=look(st+V3(0,-0.3,0),st+V3(0,0.45,0.04))
    P.append(S('cap',st+V3(0,-0.3,0),'#8d5a2b',R=R,r=0.018,h=L,facet=(2,6)))
    for s in (-1,1): P.append(S('cone',st+V3(0,0.4,0.03),'#8d5a2b',R=rot('z',-0.7*s),h=0.1,ra=0.016,rb=0.003,facet=(2,5)))
    P.append(S('oct',st+V3(0,0.52,0.04),'#a7ffeb',R=rot('y',0.5),sz=0.07,sc=(1,1.4,1),emit=0.6,spec=0.8))
    return P

def courier(ph):
    """俊足：角ばったつばのキャップのはしり屋。うしろにはねた髪、なびくマフラー、羽根つき靴"""
    P,h,hc,hr=body(ph*1.25,'#ffa000','#37474f','#fafafa',stout=0.95,belt='#5d4037')
    ex=[spike(hc+V3(sx,-0.1,-0.75)*hr,V3(sx*0.6,0.15,-1),0.4*hr,0.28*hr,'#5d4037') for sx in (-0.55,0,0.55)]
    ex+=[spike(hc+V3(sx,-0.2,-0.2)*hr,V3(sx,-0.1,-0.3),0.35*hr,0.25*hr,'#5d4037') for sx in (-0.95,0.95)]
    P.append(mass(hc,hr,'#5d4037',extra=ex,cut=0.45))
    P.append(S('ell',hc+V3(0,0.52,-0.05)*hr,'#26a69a',r=(1.12*hr,0.6*hr,1.12*hr),facet=(4,10),spec=0.35))
    P.append(S('box',hc+V3(0,0.5,0.98)*hr,'#00796b',R=rot('x',-0.2),b=(0.62*hr,0.018,0.42*hr),rr=0.008))
    P.append(S('oct',hc+V3(0,0.9,0.5)*hr,'#ffeb3b',sz=0.035,sc=(1,1,0.4),spec=0.6))
    eyes(P,hc,hr)
    P.append(S('tor',(0,0.53,0.005),'#26a69a',r1=0.125,r2=0.045,facet=(4,10)))
    for k_ in (0,1):
        R,L=look((0.05,0.5,-0.12),(0.14+0.06*k_,0.38+0.05*math.sin(ph*2+k_),-0.42))
        P.append(S('box',(0.09+0.03*k_,0.44,-0.27),'#26a69a',R=R,b=(0.04,L/2,0.012),rr=0.006))
        P.append(S('oct',(0.15+0.06*k_,0.37+0.05*math.sin(ph*2+k_),-0.43),'#26a69a',sz=0.045,sc=(1,1.4,0.4)))
    P.append(S('box',(0.13,0.2,0.08),'#8d6e63',R=rot('y',0.6),b=(0.04,0.04,0.028),rr=0.01))
    for s in (-1,1):
        P.append(S('cone',(0.12*s,0.09,0.01+0.07*math.sin(ph*1.25)*s),'#ffffff',R=rot('z',-1.1*s)@rot('x',-0.5),h=0.13,ra=0.035,rb=0.003,sc=(1,1,0.4),facet=0))
    return P

def priest(ph):
    """僧侶：角ばったミトラ帽の見習い神官。おかっぱ髪、台形の法衣と金の縁、菱形の鈴杖"""
    P,h,hc,hr=body(ph*0.8,'#fafafa','#eceff1','#c9a227',robe='#f5f5f5')
    P.append(mass(hc,hr,'#ffd54f',window=(0.62,0.62,0.5),r=(1.1,1.02,1.08),lift=0.05,bangs=((-0.38,0.45),(-0.13,0.52),(0.13,0.52),(0.38,0.45)),cut=0.6,
                  extra=[S('ell',hc+V3(0,-0.55,-0.1)*hr,'#ffd54f',op='blend',k=0.05,r=(1.08*hr,0.6*hr,0.95*hr))]))
    m=hc+V3(0,0.62,-0.04)*hr
    P.append(S('ell',m,'#ffffff',r=(1.0*hr,0.17*hr,0.98*hr),facet=(3,12)))                       # 帽子の鉢巻き部（髪の切り口を覆う）
    P.append(S('tor',m+V3(0,-0.05,0)*hr,'#e0b23a',r1=0.92*hr,r2=0.05*hr,facet=(3,14),spec=0.8))
    P.append(S('box',m+V3(0,0.42,0)*hr,'#ffffff',b=(0.62*hr,0.32*hr,0.48*hr),rr=0.015))
    P.append(S('oct',m+V3(0,0.85,0)*hr,'#ffffff',R=rot('y',math.pi/4),sz=0.66*hr,sc=(1,1.15,1)))
    P.append(S('box',m+V3(0,0.55,0.49)*hr,'#e0b23a',b=(0.018,0.4*hr,0.008),rr=0.005,spec=0.8))
    P.append(S('box',m+V3(0,0.6,0.49)*hr,'#e0b23a',b=(0.25*hr,0.018,0.008),rr=0.005,spec=0.8))
    eyes(P,hc,hr)
    P.append(S('tor',(0,0.05,0),'#e0b23a',r1=0.2,r2=0.02,facet=(3,12),spec=0.8))
    P.append(S('box',(0,0.34,0.14),'#e0b23a',b=(0.022,0.14,0.01),rr=0.006,spec=0.8))
    P.append(S('oct',(0,0.43,0.15),'#e53950',sz=0.03,spec=0.8))
    st=h[1]; R,L=look(st+V3(0,-0.32,0),st+V3(0,0.42,0))
    P.append(S('cap',st+V3(0,-0.32,0),'#e0b23a',R=R,r=0.016,h=L,facet=(2,6),spec=0.8))
    P.append(S('oct',st+V3(0,0.5,0),'#ffe082',R=rot('y',0.4),sz=0.075,sc=(1,1.3,1),spec=0.8))
    P.append(S('sph',st+V3(0,0.41,0),'#ffca28',r=0.033,facet=(3,6),spec=0.8))
    return P

def warrior(ph):
    """戦士：顔の窓を削り出した角兜のちびっこ重戦士。四角い肩当て、ちょこんと髭、両刃斧"""
    P,h,hc,hr=body(ph,'#c77d3a','#5d4037','#4e342e',mitten='#8d6e63',stout=1.25,belt='#4e342e')
    horns=[]
    for s in (-1,1):
        b0=hc+V3(0.85*s,0.45,0)*hr; m1=b0+V3(0.12*s,0.05,0); tip=m1+V3(0.03*s,0.13,0)
        horns+=[spike(b0,m1-b0,np.linalg.norm(m1-b0)*1.1,0.05,'#fff3e0',k=0.02)]
    P.append(mass(hc,hr,'#b0bec5',window=(0.72,0.6,0.5),wy=-0.36,r=(1.12,1.0,1.1),facet=(5,10),spec=0.6,bangs=(),bulge=False))
    for s in (-1,1):
        b0=hc+V3(0.85*s,0.45,0)*hr; m1=b0+V3(0.12*s,0.05,0); tip=m1+V3(0.03*s,0.14,0)
        R,L=look(b0,m1); P.append(S('cone',b0,'#fff3e0',R=R,h=L,ra=0.05,rb=0.034,facet=(2,6)))
        R,L=look(m1,tip); P.append(S('cone',m1,'#fff3e0',R=R,h=L,ra=0.034,rb=0.003,facet=(2,6)))
        P.append(S('box',(0.19*s,0.52,0),'#b0bec5',R=rot('z',-0.28*s),b=(0.085,0.04,0.09),rr=0.012,spec=0.6))
    P.append(S('box',hc+V3(0,0.28,0.98)*hr,'#90a4ae',b=(0.72*hr,0.03,0.025),rr=0.01,spec=0.6))
    P.append(S('box',hc+V3(0,0.65,0.62)*hr,'#ffb74d',R=rot('x',-0.75),b=(0.05,0.12*hr,0.02),rr=0.008))
    eyes(P,hc,hr,y=-0.08)
    P.append(S('oct',hc+V3(0,-0.72,0.66)*hr,'#d84315',sz=0.2*hr,sc=(1.1,1,0.5)))
    P.append(S('oct',(0,0.34,0.17),'#ffb74d',sz=0.045,sc=(1,1,0.4),spec=0.6))
    st=h[1]; R,L=look(st+V3(0,-0.26,0),st+V3(0,0.38,0))
    P.append(S('cap',st+V3(0,-0.26,0),'#6d4c41',R=R,r=0.02,h=L,facet=(2,6)))
    for s in (-1,1):
        P.append(S('box',st+V3(0.07*s,0.33,0),'#cfd8dc',b=(0.062,0.075,0.011),rr=0.004,spec=0.9))
        P.append(S('cone',st+V3(0.125*s,0.33,0),'#cfd8dc',R=rot('z',-math.pi/2*s),h=0.04,ra=0.08,rb=0.01,sc=(1,1,0.14),facet=0,spec=0.9))
    return P

def spellknight(ph):
    """魔法剣士：はね上がる銀髪の騎士。角ばった胸当て、裾のとがった青マント、炎の剣"""
    P,h,hc,hr=body(ph,'#cfd8dc','#37474f','#78909c',mitten='#90a4ae')
    ex=[spike(hc+V3(x,y,z)*hr,V3(x,y+0.5,z),ln*hr,0.3*hr,'#e0e6f0') for (x,y,z,ln) in
        ((0,0.85,0.25,0.55),(-0.55,0.7,0.1,0.5),(0.55,0.7,0.1,0.5),(-0.9,0.25,-0.2,0.45),(0.9,0.25,-0.2,0.45),(0,0.55,-0.8,0.5),(-0.55,0.4,-0.7,0.45),(0.55,0.4,-0.7,0.45))]
    P.append(mass(hc,hr,'#e0e6f0',extra=ex,spec=0.4,bulge=False))
    eyes(P,hc,hr)
    P.append(S('box',(0,0.4,0.03),'#eceff1',b=(0.13,0.09,0.12),rr=0.025,spec=0.7))
    P.append(S('oct',(0,0.4,0.155),'#ff7043',sz=0.036,emit=0.5,spec=0.8))
    for s in (-1,1): P.append(S('box',(0.16*s,0.52,0),'#eceff1',R=rot('z',-0.3*s),b=(0.068,0.035,0.078),rr=0.01,spec=0.7))
    for x in (-0.11,0,0.11):
        P.append(S('box',(x,0.32,-0.14),'#1e63c8',R=rot('x',0.12+0.04*math.sin(ph)),b=(0.06,0.17,0.011),rr=0.006))
        P.append(S('oct',(x,0.13,-0.165),'#1e63c8',R=rot('x',0.1),sz=0.055,sc=(1,1,0.3)))
    st=h[1]; P.append(S('box',st+V3(0,0.0,0.05),'#ffca28',b=(0.06,0.012,0.012),rr=0.005,spec=0.8))
    R,L=look(st,st+V3(0,0.12,0.42))
    P.append(S('box',st+V3(0,0.06,0.25),'#ff8a50',R=R,b=(0.024,0.2,0.008),rr=0.004,emit=0.8,spec=0.8))
    P.append(S('oct',st+V3(0,0.13,0.47),'#ffcc80',R=R,sz=0.03,emit=1.0))
    return P

HEROES={'hero_summoner':summoner,'hero_courier':courier,'hero_priest':priest,'hero_warrior':warrior,'hero_spellknight':spellknight}

# ---------------- 敵（本作オリジナル。原作同様に頭身にとらわれない造形） ----------------
def slime(ph):
    s=1+0.06*math.sin(ph); hc=V3(0,0.18/s,0)
    P=[S('sph',hc,'#4fc3f7',r=0.22*s,facet=(6,10),spec=0.6),S('cone',(0,0.32/s,0),'#4fc3f7',op='blend',k=0.07,h=0.15,ra=0.12,rb=0.006,facet=(3,10))]
    eyes(P,hc,0.22*s,size=0.11,y=0.15); return P
def thornbug(ph):
    hc=V3(0,0.16,0.03); P=[S('ell',(0,0.16,0),'#e53935',r=(0.25,0.15,0.22),facet=(5,10),spec=0.5)]
    for x in (-0.12,0,0.12): P.append(S('cone',(x,0.26,-0.03),'#ffd54f',R=rot('x',-0.3),h=0.12,ra=0.04,rb=0.003,facet=(2,5)))
    for s in (-1,1):
        for z in (-0.1,0.06): P.append(S('box',(0.25*s,0.07,z),'#b71c1c',R=rot('z',0.6*s+0.15*math.sin(ph+z*9)),b=(0.07,0.02,0.02),rr=0.008))
    eyes(P,hc,0.2,size=0.12,y=0.0); return P
def flytrap(ph):
    b=0.03*math.sin(ph); hc=V3(0,0.36+b,0.02); P=[S('cap',(0,0,0),'#43a047',r=0.05,h=0.25,facet=(3,6))]
    for a in np.linspace(0,2*math.pi,6,endpoint=False): P.append(S('cone',hc+V3(0,0,-0.05),'#f48fb1',R=rot('y',a)@rot('z',1.35),h=0.25,ra=0.07,rb=0.004,sc=(1,1,0.4),facet=0))
    P.append(S('sph',hc,'#ec407a',r=0.18,facet=(6,10),spec=0.4))
    for a in np.linspace(0,2*math.pi,4,endpoint=False): P.append(S('oct',V3(0.2*math.cos(a),0.03,0.2*math.sin(a)),'#66bb6a',R=rot('y',a),sz=0.11,sc=(1,0.4,0.6)))
    eyes(P,hc,0.18); return P
def golem(ph):
    P=[S('box',(0,0.28,0),'#9e9e9e',b=(0.22,0.2,0.16),rr=0.03),S('box',(0,0.55,0.02),'#bdbdbd',b=(0.16,0.12,0.14),rr=0.025)]
    for s in (-1,1):
        P.append(S('box',(0.3*s,0.26+0.02*math.sin(ph+s),0.03),'#8d8d8d',b=(0.08,0.15,0.08),rr=0.025))
        P.append(S('box',(0.11*s,0.06,0),'#7a7a7a',b=(0.08,0.07,0.08),rr=0.02))
        P.append(S('sph',(0.06*s,0.57,0.165),'#80deea',r=0.026,facet=0,emit=1.0))
    P.append(S('oct',(0,0.3,0.165),'#80deea',sz=0.06,emit=0.9)); return P
def shadow(ph):
    P=spellknight(ph)
    def dk(L):
        for p in L:
            p.col=p.col*0.32+V3(0.16,0.06,0.26)
            if p.emit>0: p.col=hexc('#ff4081')
            if p.kind=='grp': dk(p.a['ch'])
    dk(P); return P
def beast(ph):
    hc=V3(0,0.5,0.25); P=[S('ell',(0,0.3,-0.05),'#7e57c2',r=(0.32,0.24,0.36),facet=(5,10)),S('sph',hc,'#9575cd',op='blend',k=0.05,r=0.24,facet=(6,10))]
    for s in (-1,1):
        P.append(S('cone',(0.15*s,0.68,0.25),'#fff8e1',R=rot('z',-0.5*s),h=0.2,ra=0.05,rb=0.004,facet=(2,6)))
        P.append(S('cone',(0.2*s,0.62,0.2),'#7e57c2',R=rot('z',-1.2*s),h=0.12,ra=0.06,rb=0.006,sc=(1,1,0.5),facet=0))
        for z in (-0.25,0.15): P.append(S('box',(0.2*s,0.08,z+0.04*math.sin(ph+z*5)),'#5e35b1',b=(0.07,0.09,0.07),rr=0.025))
    eyes(P,hc,0.24); return P
def demon(ph):
    hc=V3(0,0.64,0.02); P=[S('cone',(0,0.08,0),'#512da8',h=0.38,ra=0.2,rb=0.13,rr=0.03,facet=(3,10)),S('sph',hc,'#673ab7',op='blend',k=0.04,r=0.25,facet=(6,10))]
    for s in (-1,1):
        for k_ in range(3):
            P.append(S('cone',(0.14*s,0.45,-0.1),'#311b92',R=rot('z',-(0.9+0.4*k_)*s+0.08*math.sin(ph))@rot('x',-0.3),h=0.4-0.08*k_,ra=0.07,rb=0.004,sc=(1,1,0.35),facet=0))
        P.append(S('cone',(0.15*s,0.82,0),'#fff8e1',R=rot('z',-0.45*s),h=0.15,ra=0.045,rb=0.003,facet=(2,6)))
    eyes(P,hc,0.25,col='#ff1744'); return P
def dragon(ph):
    hc=V3(0,0.6,0.1); P=[S('ell',(0,0.28,-0.05),'#43a047',r=(0.28,0.25,0.3),facet=(5,10)),S('sph',hc,'#4caf50',op='blend',k=0.05,r=0.25,facet=(6,10))]
    P.append(S('ell',(0,0.52,0.3),'#81c784',r=(0.14,0.09,0.12),facet=(4,8)))
    for s in (-1,1):
        P.append(S('cone',(0.12*s,0.8,0.0),'#fff8e1',R=rot('z',-0.35*s)@rot('x',-0.5),h=0.17,ra=0.045,rb=0.003,facet=(2,6)))
        for k_ in range(3): P.append(S('cone',(0.2*s,0.48,-0.15),'#ffb300',R=rot('z',-(1.0+0.35*k_)*s+0.1*math.sin(ph))@rot('x',-0.4),h=0.38-0.07*k_,ra=0.06,rb=0.003,sc=(1,1,0.35),facet=0))
    for k_ in range(4): P.append(S('cone',(0,0.5-0.08*k_,-0.28-0.03*k_),'#ffb300',R=rot('x',-0.8),h=0.08,ra=0.04,rb=0.003,sc=(0.4,1,1),facet=0))
    eyes(P,hc,0.25); return P
def overlord(ph):
    hc=V3(0,0.65,0.03); P=[S('box',(0,0.27,0),'#37474f',b=(0.26,0.21,0.19),rr=0.06),S('sph',hc,'#8d6e63',op='blend',k=0.04,r=0.27,facet=(6,10))]
    for s in (-1,1):
        b0=V3(0.22*s,0.76,0.0); m1=b0+V3(0.14*s,0.03,0); tip=m1+V3(0.03*s,0.14,0)
        R,L=look(b0,m1); P.append(S('cone',b0,'#fff3e0',R=R,h=L,ra=0.06,rb=0.04,facet=(2,6)))
        R,L=look(m1,tip); P.append(S('cone',m1,'#fff3e0',R=R,h=L,ra=0.04,rb=0.003,facet=(2,6)))
        P.append(S('box',(0.29*s,0.44,0),'#455a64',R=rot('z',-0.3*s),b=(0.1,0.055,0.11),rr=0.02,spec=0.7))
    for k_ in range(5): P.append(S('cone',(0.09*math.cos(k_*1.2566),0.9,0.09*math.sin(k_*1.2566)),'#ffca28',h=0.1,ra=0.04,rb=0.003,facet=(2,4),spec=0.8))
    P.append(S('tor',(0,0.9,0),'#ffca28',r1=0.095,r2=0.024,facet=(3,10),spec=0.8))
    P.append(S('box',(0,0.12,0.19),'#c62828',b=(0.21,0.1,0.01),rr=0.006))
    eyes(P,hc,0.27,col='#ff6d00')
    return P

ENEMIES={'enemy_slime':(slime,1.0),'enemy_thornbug':(thornbug,1.0),'enemy_flytrap':(flytrap,1.0),'enemy_golem':(golem,1.0),'enemy_shadow':(shadow,1.2),
         'boss_beast':(beast,1.15),'boss_demon':(demon,1.2),'boss_dragon':(dragon,1.2),'boss_overlord':(overlord,1.2)}
DIRS=[0.0,-math.pi/2,math.pi/2,math.pi]

def ground_row(n,view,cy):
    up=rot('x',-PITCH)@[0,1,0.]; return n/2-((V3(0,0,0)-V3(0,cy,0))@up)/view*n
def frame(fn,ph,yaw,view):
    n=FRAME*SS; cy=view*0.42; img=render(turn(fn(ph),yaw),n,view=view,cy=cy)
    return post(img,FRAME,ow=SS-1,shadow=ground_row(n,view,cy))
def art(fn,view,n=1024):
    cy=view*0.42; img=render(turn(fn(0.0),0.45),n,view=view,cy=cy)
    return post(img,n,ow=max(3,n//110))

if __name__=='__main__':
    out=sys.argv[1]; only=set(sys.argv[2:]); os.makedirs(out+'/art',exist_ok=True)
    jobs=[(k,f,4,DIRS,1.4) for k,f in HEROES.items()]+[(k,f,2,[0.0],1.25*sc) for k,(f,sc) in ENEMIES.items()]
    for k,f,nf,dirs,view in jobs:
        if only and k not in only: continue
        art(f,view).save(f'{out}/art/{k}.png')
        W=Image.new('RGBA',(FRAME*nf,FRAME*len(dirs)))
        for r,yaw in enumerate(dirs):
            for c in range(nf): W.alpha_composite(frame(f,2*math.pi*c/nf,yaw,view),(c*FRAME,r*FRAME))
        W.save(f'{out}/{k}.png'); print(k,flush=True)
