"""BEEF HUNTER 素材生成器（エフェクト・ダイス・数字・アイテムアイコン・マップ物・NPC・地形タイル）
すべて本作オリジナル。原作の演出構成（ダイス転がり→結果、爆発、回復、召喚、ひよこ、呪い等）に合わせた種類とコマ数で作る。
使い方: python3 effects.py <出力ルート>   例) packages/client/public/assets/img
"""
import sys, os, math, json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sprites as K
from sprites import S, V3, rot, look, hexc

FONT='/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf'
OUT=sys.argv[1] if len(sys.argv)>1 else 'assets_out'

def save_strip(frames,path):
    w,h=frames[0].size; W=Image.new('RGBA',(w*len(frames),h))
    for i,f in enumerate(frames): W.alpha_composite(f,(i*w,0))
    os.makedirs(os.path.dirname(path),exist_ok=True); W.save(path); return W

def r3d(prims,px,view,cy,yaw=0.0,pitch=None,ow=None):
    """3D小物のレンダリング（キャラと同じローポリ調）"""
    old=K.PITCH
    if pitch is not None: K.PITCH=pitch
    img=K.render(K.turn(prims,yaw),px*4,view=view,cy=cy); K.PITCH=old
    return K.post(img,px,ow=3 if ow is None else ow)

# ---------- 2D描画ヘルパ（4倍で描いて縮小） ----------
def canvas(px): return Image.new('RGBA',(px*4,px*4),(0,0,0,0))
def down(im,px): return im.resize((px,px),Image.LANCZOS)
def glow(im,rad=6):
    g=im.filter(ImageFilter.GaussianBlur(rad)); return Image.alpha_composite(g,im)
def star(d,cx,cy,r,col,pts=4,inner=0.35,rot0=0.0):
    P=[]
    for i in range(pts*2):
        a=rot0+i*math.pi/pts; rr=r if i%2==0 else r*inner; P.append((cx+math.cos(a)*rr,cy+math.sin(a)*rr))
    d.polygon(P,fill=col)
def poly(d,cx,cy,r,n,col,rot0=0.0,outline=None,width=1):
    P=[(cx+math.cos(rot0+i*2*math.pi/n)*r,cy+math.sin(rot0+i*2*math.pi/n)*r) for i in range(n)]
    d.polygon(P,fill=col,outline=outline,width=width)

rng=np.random.default_rng(20261014)

# ================= エフェクト =================
def fx_explosion(px=64,n=8):
    """爆発（宝箱の爆発・戦闘撃破）：白→黄→橙→赤の多角形火球が広がり、黒煙で消える"""
    fr=[]; parts=[(rng.uniform(0,6.28),rng.uniform(0.3,1.0),rng.integers(5,8)) for _ in range(9)]
    for i in range(n):
        t=i/(n-1); im=canvas(px); d=ImageDraw.Draw(im); c=px*2
        R=px*4*(0.15+0.33*min(1,t*1.6))
        cols=[(255,255,230),(255,230,80),(255,140,30),(220,50,20),(70,55,60)]
        k=min(4,int(t*5))
        for (a,s,m) in parts:
            rr=R*s*0.55; x=c+math.cos(a)*R*0.45*s; y=c+math.sin(a)*R*0.45*s-t*px*0.6
            poly(d,x,y,rr,int(m),cols[min(4,k+(1 if s<0.6 else 0))]+(int(255*(1-max(0,t-0.6)/0.4)),),rot0=a)
        if t<0.5: poly(d,c,c,R*0.5*(1-t),7,(255,255,240,255),rot0=t*3)
        fr.append(down(glow(im,4),px))
    return fr

def fx_hit(px=64,n=6):
    """打撃（攻撃が当たった瞬間）：白い十字閃光と破片"""
    fr=[]
    for i in range(n):
        t=i/(n-1); im=canvas(px); d=ImageDraw.Draw(im); c=px*2; a=int(255*(1-t))
        star(d,c,c,px*4*(0.2+0.25*t),(255,255,255,a),pts=4,inner=0.18,rot0=math.pi/4)
        star(d,c,c,px*4*(0.12+0.15*t),(255,236,120,a),pts=4,inner=0.25)
        for k in range(6):
            ang=k*1.047+0.3; rr=px*4*(0.1+0.32*t)
            poly(d,c+math.cos(ang)*rr,c+math.sin(ang)*rr,px*0.35*(1-t)+2,3,(255,255,255,a),rot0=ang)
        fr.append(down(glow(im,3),px))
    return fr

def fx_heal(px=64,n=8):
    """回復（りんご・恩恵・宿屋）：足元の光の輪から緑と白の菱形の粒が立ちのぼる"""
    fr=[]; P=[(rng.uniform(-0.35,0.35),rng.uniform(0,1),rng.uniform(0.6,1.2)) for _ in range(14)]
    for i in range(n):
        t=i/n; im=canvas(px); d=ImageDraw.Draw(im); W=px*4
        d.ellipse((W*0.18,W*0.74,W*0.82,W*0.94),outline=(150,255,170,int(200*(1-t))),width=int(W*0.025))
        for (x,y0,s) in P:
            y=(y0+t*s)%1.0; a=int(255*math.sin(math.pi*y))
            cx=W*(0.5+x); cy=W*(0.88-0.75*y); r=W*0.045*s
            poly(d,cx,cy,r,4,(120,255,150,a) if s>0.9 else (240,255,240,a))
        fr.append(down(glow(im,5),px))
    return fr

def fx_fire(px=64,n=8):
    """焦火：しずく形の炎が重なってゆらめく"""
    fr=[]
    for i in range(n):
        t=i/n; im=canvas(px); d=ImageDraw.Draw(im); W=px*4
        for k,(col,sc) in enumerate((((230,60,20),1.0),((255,150,30),0.72),((255,240,140),0.42))):
            for j in range(3):
                ph=t*2*math.pi+j*2.1+k
                cx=W*(0.5+0.17*(j-1)*sc); h=W*0.62*sc*(0.85+0.15*math.sin(ph)); w=W*0.22*sc
                base=W*0.9; tip=(cx+W*0.04*math.sin(ph*1.3),base-h)
                d.polygon([(cx-w,base-w*0.6),tip,(cx+w,base-w*0.6),(cx+w*0.6,base),(cx-w*0.6,base)],fill=col+(235,))
        fr.append(down(glow(im,5),px))
    return fr

def fx_summon_circle(px=96,n=8):
    """召喚陣：二重円と回転する六芒星、外周のルーン点"""
    fr=[]
    for i in range(n):
        t=i/n; im=canvas(px); d=ImageDraw.Draw(im); W=px*4; c=W/2; a=int(255*min(1,(i+1)/3))
        col=(150,255,190,a); w=int(W*0.012)
        d.ellipse((W*0.06,W*0.06,W*0.94,W*0.94),outline=col,width=w)
        d.ellipse((W*0.14,W*0.14,W*0.86,W*0.86),outline=col,width=w)
        for s in (0,1):
            P=[(c+math.cos(t*2.09+s*math.pi/3+k*2.094)*W*0.36,c+math.sin(t*2.09+s*math.pi/3+k*2.094)*W*0.36) for k in range(3)]
            d.polygon(P,outline=col,width=w)
        for k in range(12):
            ang=-t*1.0+k*0.5236; poly(d,c+math.cos(ang)*W*0.40,c+math.sin(ang)*W*0.40,W*0.018,4,(220,255,230,a))
        im=im.transform(im.size,Image.AFFINE,(1,0,0,0,2.2,-W*0.6),resample=Image.BICUBIC)   # 地面に寝かせる
        fr.append(down(glow(im,6),px))
    return fr

def summon_meteor():
    """召喚獣：巨大な種の実（落下させて使う。演出側でY移動）"""
    P=[S('ell',(0,0.45,0),'#5fbf3a',r=(0.42,0.46,0.42),facet=(6,12),spec=0.6)]
    for a in np.linspace(0,2*math.pi,8,endpoint=False):
        P.append(S('ell',V3(math.cos(a)*0.35,0.45,math.sin(a)*0.35),'#2e7d32',r=(0.05,0.44,0.05),R=rot('y',-a)))
    P.append(S('cone',(0,0.88,0),'#6d4c41',R=rot('z',0.3),h=0.16,ra=0.04,rb=0.02,facet=(2,6)))
    P.append(S('oct',(0.12,0.98,0),'#66bb6a',R=rot('z',-0.9),sz=0.12,sc=(1,0.35,0.6)))
    K.eyes(P,V3(0,0.45,0),0.42,size=0.11,y=0.05,gap=0.3)
    return r3d(P,128,1.4,0.55)

def fx_piyo(px=64,n=8):
    """ひよこ（行動停止）：頭上をひよこ3羽が回る（3Dのひよこを各コマに配置）"""
    chick=[S('sph',(0,0.2,0),'#ffe14d',r=0.2,facet=(5,9)),S('sph',(0,0.42,0.05),'#ffe14d',r=0.14,op='blend',k=0.04,facet=(5,9)),
           S('cone',(0,0.42,0.18),'#ff9800',R=rot('x',math.pi/2),h=0.08,ra=0.05,rb=0.004,facet=(2,4))]
    K.eyes(chick,V3(0,0.42,0.05),0.14,size=0.16,y=0.1,gap=0.45)
    ch=r3d(chick,22,0.9,0.3,pitch=math.radians(25),ow=2)
    fr=[]
    for i in range(n):
        im=Image.new('RGBA',(px,px)); t=i/n
        L=[]
        for k in range(3):
            a=t*2*math.pi+k*2.094; L.append((math.sin(a),a))
        for z,a in sorted(L):
            x=px/2+math.cos(a)*px*0.32-11; y=px*0.42+math.sin(a)*px*0.12-11
            im.alpha_composite(ch.transpose(Image.FLIP_LEFT_RIGHT) if math.cos(a+math.pi/2)<0 else ch,(int(x),int(y)))
        d=ImageDraw.Draw(im)
        for k in range(3): star(d,px/2+math.cos(t*6.28*2+k*2)*px*0.18,px*0.3,2.5,(255,255,180,255),pts=4,inner=0.3)
        fr.append(im)
    return fr

def fx_curse(px=64,n=8):
    """ノロイ（呪い）：紫の魂がらせん状にまとわりつき、頭上にドクロ形の印"""
    fr=[]
    for i in range(n):
        t=i/n; im=canvas(px); d=ImageDraw.Draw(im); W=px*4
        for k in range(5):
            a=t*2*math.pi+k*1.2566; y=W*(0.85-0.12*k-0.1*t); x=W/2+math.cos(a)*W*0.3
            r=W*0.06; d.ellipse((x-r,y-r,x+r,y+r),fill=(170,60,230,200))
            d.polygon([(x-r*0.8,y),(x,y+r*2.6),(x+r*0.8,y)],fill=(170,60,230,140))
        cx,cy=W/2,W*0.16+W*0.02*math.sin(t*6.28)
        d.ellipse((cx-W*0.09,cy-W*0.08,cx+W*0.09,cy+W*0.08),fill=(230,210,255,255))
        d.rectangle((cx-W*0.05,cy+W*0.04,cx+W*0.05,cy+W*0.1),fill=(230,210,255,255))
        for s in (-1,1): d.ellipse((cx+s*W*0.045-W*0.025,cy-W*0.02,cx+s*W*0.045+W*0.025,cy+W*0.03),fill=(60,0,90,255))
        fr.append(down(glow(im,5),px))
    return fr

def fx_cursor(px=48,n=8):
    """手番カーソル：頭上で上下する角ばった下向き矢印＋回転する菱形"""
    fr=[]
    for i in range(n):
        t=i/n; im=canvas(px); d=ImageDraw.Draw(im); W=px*4; y=W*(0.18+0.08*math.sin(t*6.28))
        d.polygon([(W*0.3,y),(W*0.7,y),(W*0.5,y+W*0.32)],fill=(255,215,64,255),outline=(120,70,0,255),width=8)
        d.polygon([(W*0.5,y+W*0.04),(W*0.62,y+W*0.04),(W*0.5,y+W*0.26)],fill=(255,245,180,255))
        sx=abs(math.cos(t*6.28)); poly(d,W*0.5,W*0.82,W*0.12,4,(255,235,120,200)) if sx<0.2 else d.polygon([(W*0.5-W*0.12*sx,W*0.82),(W*0.5,W*0.7),(W*0.5+W*0.12*sx,W*0.82),(W*0.5,W*0.94)],fill=(255,235,120,200))
        fr.append(down(im,px))
    return fr

def fx_gold(px=64,n=8):
    """お金獲得：八角形のコインが跳ねて光る"""
    coin=r3d([S('cap',(0,0.0,0),'#ffc107',R=rot('x',math.pi/2),r=0.3,h=0.06,facet=(2,8),spec=0.9),
              S('box',(0,0.0,0.06),'#ffe082',b=(0.04,0.14,0.01),rr=0.01)],24,0.9,0.0,pitch=0.2,ow=2)
    fr=[]
    for i in range(n):
        t=i/n; im=Image.new('RGBA',(px,px)); d=ImageDraw.Draw(im)
        for k in range(4):
            ph=(t+k*0.25)%1; x=px*(0.2+0.2*k); y=px*0.75-math.sin(ph*math.pi)*px*0.45
            c=coin.resize((max(4,int(24*abs(math.cos(ph*6.28)))),24)); im.alpha_composite(c,(int(x-c.width/2),int(y-12)))
        star(d,px*0.5,px*0.25,6*abs(math.sin(t*6.28))+1,(255,255,220,255),pts=4,inner=0.25)
        fr.append(im)
    return fr

def fx_paru(px=96,n=10,kiwami=False):
    """ぱるぷん玉：虹色の多角形が放射して画面をはじく。<極>は金と白の二重放射＋王冠形の閃光"""
    fr=[]
    cols=[(255,80,80),(255,180,40),(255,240,60),(80,220,100),(70,170,255),(170,90,255)]
    if kiwami: cols=[(255,215,0),(255,255,255),(255,236,140),(255,190,40)]
    for i in range(n):
        t=i/(n-1); im=canvas(px); d=ImageDraw.Draw(im); W=px*4; c=W/2
        for k in range(18):
            a=k*0.349+t*1.5; r0=W*0.08+W*0.4*t; r1=r0+W*0.12
            d.polygon([(c+math.cos(a)*r0,c+math.sin(a)*r0),(c+math.cos(a+0.12)*r1,c+math.sin(a+0.12)*r1),(c+math.cos(a-0.12)*r1,c+math.sin(a-0.12)*r1)],fill=cols[k%len(cols)]+(int(255*(1-t)),))
        poly(d,c,c,W*0.16*(1-t*0.7),8,(255,255,255,int(255*(1-t))),rot0=t*2)
        if kiwami and t>0.2:
            a=int(255*(1-abs(t-0.6)/0.4)) if t<1 else 0
            P=[(c-W*0.22,c+W*0.08),(c-W*0.22,c-W*0.12),(c-W*0.11,c-W*0.02),(c,c-W*0.2),(c+W*0.11,c-W*0.02),(c+W*0.22,c-W*0.12),(c+W*0.22,c+W*0.08)]
            d.polygon(P,fill=(255,215,0,max(0,a)),outline=(255,255,255,max(0,a)),width=10)
        fr.append(down(glow(im,8),px))
    return fr

def fx_swap(px=64,n=8):
    """位置入れ替え：上下に回り込む2本の角ばった矢印"""
    fr=[]
    for i in range(n):
        t=i/n; im=canvas(px); d=ImageDraw.Draw(im); W=px*4; c=W/2
        for s,col in ((0,(100,200,255,255)),(math.pi,(255,120,200,255))):
            a=t*2*math.pi+s; P=[]
            for k in range(10):
                aa=a+k*0.22; P.append((c+math.cos(aa)*W*0.33,c+math.sin(aa)*W*0.33))
            d.line(P,fill=col,width=int(W*0.05))
            aa=a+9*0.22; tip=(c+math.cos(aa+0.25)*W*0.33,c+math.sin(aa+0.25)*W*0.33)
            nrm=(math.cos(aa),math.sin(aa))
            d.polygon([tip,(P[-1][0]+nrm[0]*W*0.08,P[-1][1]+nrm[1]*W*0.08),(P[-1][0]-nrm[0]*W*0.08,P[-1][1]-nrm[1]*W*0.08)],fill=col)
        fr.append(down(glow(im,3),px))
    return fr

def fx_absorb(px=64,n=8):
    """吸収玉（奪取）：対象から粒が渦を巻いて吸い込まれる"""
    fr=[]; P=[(rng.uniform(0,6.28),rng.uniform(0.6,1.0)) for _ in range(16)]
    for i in range(n):
        t=i/n; im=canvas(px); d=ImageDraw.Draw(im); W=px*4; c=W/2
        for a,r0 in P:
            r=W*0.45*r0*(1-t); aa=a+t*4; x=c+math.cos(aa)*r; y=c+math.sin(aa)*r
            poly(d,x,y,W*0.03,4,(120,240,255,230),rot0=aa)
        poly(d,c,c,W*(0.06+0.06*t),6,(220,255,255,255),rot0=t*3)
        fr.append(down(glow(im,4),px))
    return fr

def fx_warp(px=64,n=8):
    """ワープ・復活：光の柱が立ち、角柱の破片が昇る"""
    fr=[]
    for i in range(n):
        t=i/n; im=canvas(px); d=ImageDraw.Draw(im); W=px*4; a=int(255*math.sin(math.pi*(i+0.5)/n))
        d.rectangle((W*0.34,0,W*0.66,W*0.9),fill=(200,240,255,int(a*0.5)))
        d.rectangle((W*0.43,0,W*0.57,W*0.9),fill=(255,255,255,a))
        d.ellipse((W*0.2,W*0.8,W*0.8,W*0.97),outline=(160,220,255,a),width=10)
        for k in range(6):
            y=W*(0.9-((t+k/6)%1)*0.9); x=W*(0.3+0.4*((k*37)%10)/10)
            d.rectangle((x-6,y-14,x+6,y+14),fill=(220,250,255,a))
        fr.append(down(glow(im,6),px))
    return fr

def fx_encount(px=128,n=6):
    """エンカウント：画面中央から割れる角ばった衝撃波（全画面に拡大して使う）"""
    fr=[]
    for i in range(n):
        t=i/(n-1); im=canvas(px); d=ImageDraw.Draw(im); W=px*4; c=W/2
        for k in range(12):
            a=k*0.5236+0.2; r0=W*0.05+W*0.55*t
            d.polygon([(c,c),(c+math.cos(a)*r0,c+math.sin(a)*r0),(c+math.cos(a+0.18)*r0*0.7,c+math.sin(a+0.18)*r0*0.7)],fill=(255,255,255,int(230*(1-t*0.6))))
        fr.append(down(im,px))
    return fr

# ================= ダイス =================
PIPS={1:[(0,0)],2:[(-1,-1),(1,1)],3:[(-1,-1),(0,0),(1,1)],4:[(-1,-1),(1,-1),(-1,1),(1,1)],5:[(-1,-1),(1,-1),(0,0),(-1,1),(1,1)],6:[(-1,-1),(1,-1),(-1,0),(1,0),(-1,1),(1,1)]}
def die(face_up, yaw=0.3, tilt=0.0, ichi=False):
    """角を落とした立方体＋凹んだ目。face_up が上面"""
    body='#f5f1e6' if not ichi else '#ffca28'
    P=[S('box',(0,0,0),body,b=(0.3,0.3,0.3),rr=0.07,spec=0.5)]
    faces={1:V3(0,1,0),6:V3(0,-1,0),2:V3(0,0,1),5:V3(0,0,-1),3:V3(1,0,0),4:V3(-1,0,0)}
    # 上面が face_up になるよう回転
    n=faces[face_up]; Rf=look(V3(0,0,0),n)[0].T if face_up not in (1,) else np.eye(3)
    if face_up==6: Rf=rot('x',math.pi)
    for f,nv in faces.items():
        val=1 if ichi else f
        ax=np.cross(nv,[0,1,0] if abs(nv[1])<0.9 else [1,0,0]); ax/=np.linalg.norm(ax); ay=np.cross(nv,ax)
        for (u,v) in PIPS[val]:
            c=nv*0.3+ax*u*0.15+ay*v*0.15
            col='#d32f2f' if (val==1 or ichi) else '#263238'
            P.append(S('sph',c,col,r=0.07 if val==1 else 0.055,op='sub',k=0.01))
            P.append(S('sph',c-nv*0.02,col,r=0.05 if val==1 else 0.04,facet=0,spec=0.2))
    for p in P: p.c=Rf@p.c; p.R=Rf@p.R
    R=rot('y',yaw)@rot('x',tilt)
    for p in P: p.c=R@p.c+V3(0,0.35,0); p.R=R@p.R
    return P

def dice_sheets(px=48):
    faces=[r3d(die(f,yaw=0.55),px,1.0,0.4) for f in range(1,7)]
    rolls=[r3d(die(int(rng.integers(1,7)),yaw=rng.uniform(0,6.28),tilt=rng.uniform(-0.9,0.9)),px,1.0,0.4) for _ in range(8)]
    ichi=[r3d(die(1,yaw=0.55+k*0.8,ichi=True),px,1.0,0.4) for k in range(2)]
    return faces,rolls,ichi

# ================= 数字 =================
def digits(fill,stroke,w=22,h=30):
    f=ImageFont.truetype(FONT,int(h*4*0.95)); out=[]
    for ch in '0123456789':
        im=Image.new('RGBA',(w*4,h*4)); d=ImageDraw.Draw(im)
        d.text((w*2,h*2+4),ch,font=f,anchor='mm',fill=fill,stroke_width=10,stroke_fill=stroke)
        out.append(im.resize((w,h),Image.LANCZOS))
    return out

# ================= アイテムアイコン（32px、3D） =================
def icon(prims,yaw=0.5,view=1.0,cy=0.35): return r3d(prims,32,view,cy,yaw=yaw,pitch=math.radians(35),ow=3)
def sword(col_blade,col_hilt,length,gem=None):
    P=[S('box',(0,0.38,0),col_blade,b=(0.045,length/2,0.015),rr=0.006,spec=0.9),
       S('oct',(0,0.38+length/2,0),col_blade,sz=0.045,sc=(1,1.6,0.33)),
       S('box',(0,0.38-length/2,0),col_hilt,b=(0.13,0.025,0.03),rr=0.01),S('cap',(0,0.04,0),'#6d4c41',r=0.03,h=0.24-length/2+0.1,facet=(2,6))]
    if gem: P.append(S('oct',(0,0.38-length/2,0.035),gem,sz=0.035,spec=0.9))
    for p in P: p.R=rot('z',-0.75)@p.R; p.c=rot('z',-0.75)@(p.c-V3(0,0.35,0))+V3(0,0.35,0)
    return P
def shield(col,trim,emb=None):
    P=[S('box',(0,0.38,0),col,b=(0.24,0.26,0.03),rr=0.05,spec=0.5),S('oct',(0,0.14,0),col,sz=0.22,sc=(1.05,0.8,0.13)),
       S('tor',(0,0.38,0.0),trim,R=rot('x',math.pi/2),r1=0.24,r2=0.025,facet=(2,10),spec=0.8)]
    if emb: P.append(S('oct',(0,0.36,0.04),emb,sz=0.08,sc=(1,1,0.4),spec=0.8))
    return P
def boot(col,wing=False):
    P=[S('box',(0,0.18,0),col,b=(0.11,0.17,0.12),rr=0.05),S('box',(0,0.06,0.1),col,b=(0.11,0.06,0.18),rr=0.05),S('box',(0,0.02,0.04),'#5d4037',b=(0.12,0.025,0.23),rr=0.01)]
    if wing:
        for k in range(3): P.append(S('cone',(0.1,0.25-0.04*k,-0.02),'#ffffff',R=rot('z',-1.3+0.25*k),h=0.2-0.04*k,ra=0.04,rb=0.004,sc=(1,1,0.35),facet=0))
    else: P.append(S('box',(0,0.07,0.24),'#90a4ae',b=(0.1,0.05,0.04),rr=0.02,spec=0.8))
    return P
def orb(col,inner=None):
    P=[S('sph',(0,0.35,0),col,r=0.25,facet=(6,10),spec=0.9)]
    if inner: P.append(S('oct',(0,0.35,0.2),inner,sz=0.09,sc=(1,1,0.4),emit=0.5))
    return P
def scroll(col):
    return [S('cap',(-0.25,0.35,0),'#fff3e0',R=rot('z',math.pi/2),r=0.1,h=0.5,facet=(3,8)),S('box',(0,0.35,0.06),col,b=(0.04,0.11,0.06),rr=0.01)]

def item_icons():
    I=[]
    # 1 りんご
    I.append(icon([S('sph',(0,0.33,0),'#e53935',r=0.26,facet=(5,9),spec=0.7),S('cap',(0,0.55,0),'#5d4037',R=rot('z',0.3),r=0.025,h=0.12,facet=(2,5)),S('oct',(0.09,0.64,0),'#43a047',R=rot('z',-0.7),sz=0.1,sc=(1,0.35,0.6))]))
    # 2 エリクサー（小瓶）
    I.append(icon([S('sph',(0,0.28,0),'#e1bee7',r=0.22,facet=(5,9),spec=1),S('sph',(0,0.25,0),'#ab47bc',r=0.18,facet=(5,9),emit=0.3),S('cap',(0,0.45,0),'#e1bee7',r=0.07,h=0.12,facet=(2,8)),S('box',(0,0.63,0),'#8d6e63',b=(0.07,0.04,0.07),rr=0.02)]))
    # 3 アミュレット
    I.append(icon([S('tor',(0,0.5,0),'#ffca28',R=rot('x',math.pi/2),r1=0.18,r2=0.02,facet=(2,10),spec=0.9),S('oct',(0,0.28,0.02),'#29b6f6',sz=0.16,sc=(1,1.3,0.45),spec=1,emit=0.2),S('tor',(0,0.28,0),'#ffca28',R=rot('x',math.pi/2),r1=0.13,r2=0.025,facet=(2,8),spec=0.9)]))
    # 4 さいころ / 5 いちころ
    I.append(r3d(die(5,yaw=0.55),32,1.0,0.4,ow=3)); I.append(r3d(die(1,yaw=0.55,ichi=True),32,1.0,0.4,ow=3))
    # 6-8 剣
    I.append(icon(sword('#cfd8dc','#8d6e63',0.32))); I.append(icon(sword('#b0bec5','#607d8b',0.44))); I.append(icon(sword('#e3f2fd','#ffca28',0.48,gem='#e53935')))
    # 9-11 盾
    I.append(icon(shield('#a1673a','#6d4c41'))); I.append(icon(shield('#90a4ae','#546e7a'))); I.append(icon(shield('#1e63c8','#ffca28','#ffffff')))
    # 12 運動靴 13 安全靴
    I.append(icon(boot('#26a69a',wing=True),yaw=1.2)); I.append(icon(boot('#ff8f00'),yaw=1.2))
    # 14 恩恵 15 焦火 16 幸運 17 召喚 （魔法は書物＋紋章）
    def book(cover,mark,emit=0.0):
        return [S('box',(0,0.3,0),cover,b=(0.22,0.28,0.07),rr=0.02),S('box',(0.02,0.3,0),'#fff8e1',b=(0.2,0.26,0.055),rr=0.01),S('oct',(0,0.32,0.08),mark,sz=0.1,sc=(1,1,0.3),emit=emit,spec=0.8)]
    I.append(icon(book('#43a047','#b9f6ca',0.4),yaw=0.3)); I.append(icon(book('#c62828','#ffab40',0.6),yaw=0.3))
    I.append(icon(book('#ffb300','#fff59d',0.4),yaw=0.3)); I.append(icon(book('#6a1b9a','#a7ffeb',0.6),yaw=0.3))
    # 18 剣玉（攻撃+1：剣の紋が入った玉）
    I.append(icon(orb('#ef5350','#ffffff')))
    # 19 ぱるぷん玉（虹のファセット玉）
    P=[S('sph',(0,0.35,0),'#ffffff',r=0.26,facet=(5,8),spec=1)]
    for k,c in enumerate(('#ef5350','#ffb300','#fdd835','#66bb6a','#42a5f5','#ab47bc')):
        a=k*1.047; P.append(S('oct',V3(math.cos(a)*0.17,0.35+0.1*math.sin(a*2),math.sin(a)*0.17),c,sz=0.11))
    I.append(icon(P))
    # 20 ひよこ
    ck=[S('sph',(0,0.22,0),'#ffe14d',r=0.22,facet=(5,9)),S('sph',(0,0.46,0.04),'#ffe14d',r=0.16,op='blend',k=0.04,facet=(5,9)),S('cone',(0,0.46,0.18),'#ff9800',R=rot('x',math.pi/2),h=0.09,ra=0.055,rb=0.004,facet=(2,4))]
    K.eyes(ck,V3(0,0.46,0.04),0.16,size=0.14,y=0.1,gap=0.45); I.append(icon(ck,yaw=0.0))
    # 21 吸収玉 22 ノロイ
    I.append(icon(orb('#26c6da','#e0f7fa'))); I.append(icon(orb('#6a1b9a','#ce93d8')))
    # 23 竜鱗の鎧 24 ワープの書 25 身代わり人形
    I.append(icon([S('cone',(0,0.05,0),'#2e7d32',h=0.5,ra=0.24,rb=0.2,rr=0.03,facet=(3,8)),S('box',(0,0.5,0),'#2e7d32',b=(0.3,0.06,0.18),rr=0.04)]+[S('oct',(x,y,0.2),'#81c784',sz=0.05,sc=(1,1,0.3)) for x in (-0.1,0,0.1) for y in (0.18,0.3,0.42)]))
    I.append(icon(scroll('#1e88e5'),yaw=0.2))
    doll=[S('cone',(0,0.05,0),'#d7ccc8',h=0.3,ra=0.17,rb=0.1,rr=0.02,facet=(3,8)),S('sph',(0,0.48,0),'#efebe9',r=0.15,facet=(5,8))]
    K.eyes(doll,V3(0,0.48,0),0.15,size=0.12,gap=0.38); doll.append(S('box',(0,0.25,0.12),'#e57373',b=(0.08,0.02,0.01),rr=0.01))
    I.append(icon(doll,yaw=0.0))
    return I

ITEM_NAMES=['apple','elixir','amulet','dice','ichi','dagger','iron_sword','hero_sword','wood_shield','iron_shield','hero_shield','run_shoes','safe_shoes',
            'mag_heal','mag_fire','mag_luck','mag_summon','sword_orb','paru','piyo','absorb','curse','dragon_mail','warp_scroll','dummy_doll']

# ================= マップ物・NPC =================
def chest(open_=False):
    P=[S('box',(0,0.17,0),'#a1673a',b=(0.3,0.16,0.21),rr=0.03),S('box',(0,0.17,0.215),'#ffca28',b=(0.04,0.06,0.01),rr=0.01,spec=0.9)]
    for x in (-0.22,0.22): P.append(S('box',(x,0.2,0),'#6d4c41',b=(0.03,0.19,0.225),rr=0.01))
    if open_:
        P.append(S('cap',(-0.3,0.38,-0.21),'#a1673a',R=rot('z',-math.pi/2)@rot('x',-0.0),r=0.08,h=0.6,facet=(2,8)))
        P.append(S('box',(0,0.32,0),'#ffe082',b=(0.26,0.02,0.18),rr=0.01,emit=0.6))
    else:
        P.append(S('cap',(-0.3,0.33,0),'#a1673a',R=rot('z',-math.pi/2),r=0.2,h=0.6,facet=(2,8),sc=(1,0.55,1)))
    return P
def qbox():
    P=[S('box',(0,0.25,0),'#7e57c2',b=(0.24,0.24,0.24),rr=0.04,spec=0.5)]
    for nv in (V3(0,0,1),V3(1,0,0),V3(0,1,0)):
        c=V3(0,0.25,0)+nv*0.245
        P.append(S('box',c,'#ffca28',R=look(V3(0,0,0),nv)[0]@rot('x',math.pi/2) if nv[1]==0 else rot('x',math.pi/2),b=(0.06,0.11,0.01),rr=0.02,emit=0.2))
    return P
def tack(big=False):
    s=1.4 if big else 1.0; col='#cfd8dc' if not big else '#ef5350'
    P=[S('cap',(0,0.03,0),col,R=rot('x',math.pi/2),r=0.13*s,h=0.03,facet=(2,8),spec=0.8),S('cone',(0,0.05,0),'#eceff1',h=0.28*s,ra=0.035*s,rb=0.003,facet=(2,6),spec=0.9)]
    if big:
        for a in (0,2.09,4.19): P.append(S('cone',(0,0.05,0),'#eceff1',R=rot('y',a)@rot('z',0.9),h=0.22,ra=0.03,rb=0.003,facet=(2,6),spec=0.9))
    return P
def gold(large=False):
    if large:
        P=[S('sph',(0,0.2,0),'#c8a165',r=0.22,facet=(5,8)),S('cone',(0,0.36,0),'#c8a165',h=0.12,ra=0.12,rb=0.06,facet=(2,8)),S('tor',(0,0.4,0),'#6d4c41',r1=0.07,r2=0.02,facet=(2,8)),
           S('oct',(0,0.2,0.21),'#ffca28',sz=0.08,sc=(1,1,0.3),spec=0.9)]
        for (x,z) in ((0.2,0.15),(-0.18,0.18)): P.append(S('cap',(x,0.03,z),'#ffc107',R=rot('x',math.pi/2.4),r=0.07,h=0.02,facet=(2,8),spec=0.9))
        return P
    return [S('cap',(x,0.02+0.03*k,z),'#ffc107',R=rot('x',math.pi/2),r=0.08,h=0.02,facet=(2,8),spec=0.9) for k,(x,z) in enumerate(((0,0),(0.12,0.05),(-0.1,0.08),(0.03,-0.1)))]

def npc(kind,ph=0.0):
    """NPC（人型は主人公と同じ骨格）"""
    if kind=='priest':
        P,h,hc,hr=K.body(ph,'#283593','#1a237e','#3e2723',robe='#303f9f')
        P.append(K.mass(hc,hr,'#9e9e9e',bangs=((-0.2,0.3),(0.2,0.3)),cut=0.55))
        P.append(S('ell',hc+V3(0,0.6,-0.04)*hr,'#283593',r=(1.0*hr,0.25*hr,0.98*hr),facet=(3,10)))
        P.append(S('box',(0,0.4,0.15),'#ffca28',b=(0.02,0.09,0.01),rr=0.005,spec=0.9)); P.append(S('box',(0,0.43,0.15),'#ffca28',b=(0.06,0.02,0.01),rr=0.005,spec=0.9))
        K.eyes(P,hc,hr); return P
    if kind=='merchant':
        P,h,hc,hr=K.body(ph,'#2e7d32','#5d4037','#4e342e',stout=1.2,belt='#ffca28')
        P.append(K.mass(hc,hr,'#4e342e',bangs=((-0.3,0.35),(0.0,0.4),(0.3,0.35)),cut=0.5))
        P.append(S('ell',hc+V3(0,0.58,-0.03)*hr,'#ffb300',r=(1.12*hr,0.55*hr,1.1*hr),facet=(4,10)))
        P.append(S('tor',hc+V3(0,0.35,-0.03)*hr,'#e65100',r1=1.0*hr,r2=0.12*hr,facet=(3,12)))
        P.append(S('box',(0.17,0.25,-0.08),'#8d6e63',b=(0.08,0.1,0.08),rr=0.02))
        K.eyes(P,hc,hr); return P
    if kind=='inn':
        P,h,hc,hr=K.body(ph,'#f06292','#6d4c41','#5d4037',robe='#ffffff')
        P.append(K.mass(hc,hr,'#ff7043',bangs=((-0.35,0.4),(-0.1,0.46),(0.15,0.46),(0.38,0.4)),
                        extra=[S('sph',hc+V3(0,0.4,-0.9)*hr,'#ff7043',op='blend',k=0.04,r=0.45*hr)]))
        P.append(S('box',hc+V3(0,0.75,0.3)*hr,'#ffffff',R=rot('x',-0.5),b=(0.55*hr,0.12*hr,0.05*hr),rr=0.02))
        K.eyes(P,hc,hr); return P
    if kind=='shoesage':
        P,h,hc,hr=K.body(ph,'#8d6e63','#5d4037','#ffffff',robe='#a1887f')
        P.append(K.mass(hc,hr,'#eeeeee',bangs=(),window=(0.72,0.6,0.5)))
        P.append(S('cone',hc+V3(0,-0.6,0.6)*hr,'#eeeeee',R=rot('x',math.pi),h=0.32,ra=0.6*hr,rb=0.01,facet=(3,8)))
        for s in (-1,1): P.append(S('box',hc+V3(0.33*s,0.15,0.9)*hr,'#eeeeee',b=(0.16*hr,0.05*hr,0.03),rr=0.01))
        st=h[1]; R,L=look(st+V3(0,-0.3,0),st+V3(0,0.4,0)); P.append(S('cap',st+V3(0,-0.3,0),'#6d4c41',R=R,r=0.02,h=L,facet=(2,6)))
        P.append(S('box',st+V3(0,0.45,0.04),'#26a69a',b=(0.05,0.05,0.07),rr=0.02))
        K.eyes(P,hc,hr,y=-0.02); return P
    if kind=='smith':
        P,h,hc,hr=K.body(ph,'#5d4037','#3e2723','#212121',mitten='#424242',stout=1.3,robe=None,belt='#212121')
        P.append(K.mass(hc,hr,'#212121',bangs=((-0.2,0.25),(0.2,0.25))))
        P.append(S('tor',hc+V3(0,0.45,-0.03)*hr,'#e53935',r1=1.0*hr,r2=0.12*hr,facet=(3,12)))
        P.append(S('box',(0,0.32,0.16),'#795548',b=(0.12,0.16,0.012),rr=0.01))
        st=h[1]; R,L=look(st+V3(0,-0.1,0),st+V3(0,0.25,0)); P.append(S('cap',st+V3(0,-0.1,0),'#6d4c41',R=R,r=0.02,h=L,facet=(2,6)))
        P.append(S('box',st+V3(0,0.27,0),'#78909c',b=(0.09,0.05,0.05),rr=0.01,spec=0.8))
        K.eyes(P,hc,hr); return P
    if kind=='dealer':
        P,h,hc,hr=K.body(ph,'#212121','#212121','#000000',belt='#c62828')
        P.append(K.mass(hc,hr,'#3949ab',bangs=((-0.35,0.45),(0.0,0.5),(0.35,0.45)),cut=0.55))
        P.append(S('cap',hc+V3(0,0.55,-0.03)*hr,'#212121',r=0.95*hr,h=0.35*hr,facet=(2,10)))
        P.append(S('cap',hc+V3(0,0.5,-0.03)*hr,'#212121',R=rot('x',0),r=1.35*hr,h=0.05*hr,facet=(2,12),sc=(1,0.3,1)))
        P.append(S('box',(0,0.45,0.13),'#ffffff',b=(0.03,0.04,0.01),rr=0.01)); P.append(S('oct',(0,0.5,0.14),'#c62828',sz=0.03,sc=(1.6,1,0.4)))
        K.eyes(P,hc,hr); return P
    raise ValueError(kind)

# ================= 地形タイル（40px、上から見下ろし） =================
def tiles(px=40):
    T={}
    def base(col,noise=10,seed=0):
        r=np.random.default_rng(seed); a=np.zeros((px,px,4),np.uint8); a[...,:3]=hexc(col)*255; a[...,3]=255
        n=r.integers(-noise,noise,(px//4,px//4,1)).repeat(4,0).repeat(4,1); a[...,:3]=np.clip(a[...,:3].astype(int)+n,0,255)
        return Image.fromarray(a,'RGBA')
    T['grass']=base('#6abf45',10,1); d=ImageDraw.Draw(T['grass'])
    for k in range(5):
        x,y=rng.integers(4,px-4,2); d.polygon([(x,y),(x+2,y-5),(x+4,y)],fill=(80,150,50,255))
    T['sand']=base('#e8d48b',8,2)
    for i in range(2):
        im=base('#2f78d0',6,3+i); d=ImageDraw.Draw(im)
        for k in range(4):
            y=(k*10+i*5)%px; x=(k*13+i*7)%px; d.line([(x,y),(x+6,y-2),(x+12,y)],fill=(170,215,255,255),width=2)
        T[f'sea_{i}']=im
    T['forest']=T['grass'].copy()
    tree=r3d([S('cap',(0,0,0),'#6d4c41',r=0.05,h=0.2,facet=(2,6)),S('cone',(0,0.15,0),'#2e7d32',h=0.35,ra=0.28,rb=0.01,facet=(2,7)),S('cone',(0,0.38,0),'#388e3c',h=0.3,ra=0.21,rb=0.01,facet=(2,7))],px,1.0,0.38,ow=2)
    T['forest'].alpha_composite(tree)
    T['mountain']=T['grass'].copy()
    mt=r3d([S('cone',(0,0,0),'#a1887f',h=0.62,ra=0.44,rb=0.02,facet=(2,6),spec=0.0),S('cone',(0,0.42,0),'#f5f5f5',h=0.2,ra=0.15,rb=0.02,facet=(2,6))],px,1.05,0.35,yaw=0.3,ow=2)
    T['mountain'].alpha_composite(mt)
    def pad(col,edge,mark=None):
        im=T['grass'].copy(); d=ImageDraw.Draw(im); m=5
        d.rounded_rectangle((m,m,px-m,px-m),radius=6,fill=col,outline=edge,width=2)
        d.rounded_rectangle((m+3,m+3,px-m-3,px-m-3),radius=4,outline=(255,255,255,140),width=1)
        if mark: mark(d)
        return im
    T['path']=pad((255,244,196,255),(205,170,90,255))
    T['path_start']=pad((255,255,255,255),(90,160,255,255),lambda d: star(d,px/2,px/2,10,(80,150,255,255),pts=5,inner=0.45,rot0=-math.pi/2))
    T['path_branch']=pad((255,244,196,255),(205,170,90,255),lambda d:(d.polygon([(8,20),(14,14),(14,26)],fill=(60,170,90,255)),d.polygon([(32,20),(26,14),(26,26)],fill=(220,70,60,255))))
    T['path_boss']=pad((255,205,205,255),(200,60,60,255),lambda d: poly(d,px/2,px/2,8,4,(200,40,40,255)))
    T['path_lastboss']=pad((80,40,60,255),(255,200,60,255),lambda d: star(d,px/2,px/2,11,(255,200,60,255),pts=5,inner=0.45,rot0=-math.pi/2))
    T['bridge']=base('#a1673a',8,9); d=ImageDraw.Draw(T['bridge'])
    for k in range(0,px,8): d.line([(0,k),(px,k)],fill=(110,70,40,255),width=2)
    return T

# ================= 実行 =================
if __name__=='__main__':
    O=OUT; idx={}
    # エフェクト
    E={'explosion':fx_explosion(),'hit':fx_hit(),'heal':fx_heal(),'fire':fx_fire(),'summon_circle':fx_summon_circle(),'piyo':fx_piyo(),'curse':fx_curse(),
       'cursor':fx_cursor(),'gold':fx_gold(),'paru':fx_paru(),'paru_kiwami':fx_paru(kiwami=True),'swap':fx_swap(),'absorb':fx_absorb(),'warp':fx_warp(),'encount':fx_encount()}
    for k,v in E.items():
        save_strip(v,f'{O}/fx/{k}.png'); idx[f'fx/{k}']={'frame':list(v[0].size),'frames':len(v)}
    m=summon_meteor(); os.makedirs(f'{O}/fx',exist_ok=True); m.save(f'{O}/fx/summon_seed.png'); idx['fx/summon_seed']={'frame':list(m.size),'frames':1}
    faces,rolls,ichi=dice_sheets()
    save_strip(faces,f'{O}/dice/faces.png'); save_strip(rolls,f'{O}/dice/roll.png'); save_strip(ichi,f'{O}/dice/ichi.png')
    idx['dice/faces']={'frame':[48,48],'frames':6,'note':'左から1〜6'}; idx['dice/roll']={'frame':[48,48],'frames':8}; idx['dice/ichi']={'frame':[48,48],'frames':2}
    for name,(f,s) in {'damage':((255,90,70),(90,0,0)),'heal':((120,255,140),(0,80,20)),'gold':((255,220,60),(110,70,0))}.items():
        save_strip(digits(f,s),f'{O}/num/{name}.png'); idx[f'num/{name}']={'frame':[22,30],'frames':10,'note':'0〜9'}
    ic=item_icons(); save_strip(ic,f'{O}/items/icons.png'); idx['items/icons']={'frame':[32,32],'frames':len(ic),'order':ITEM_NAMES,'note':'アイテムNo1〜25の順'}
    objs={'chest':r3d(chest(),48,1.0,0.3),'chest_open':r3d(chest(True),48,1.0,0.3),'qbox':r3d(qbox(),48,1.0,0.3),'tack':r3d(tack(),48,1.0,0.3),'tack_big':r3d(tack(True),48,1.0,0.3),
          'gold_small':r3d(gold(),48,1.0,0.3),'gold_large':r3d(gold(True),48,1.0,0.3)}
    for k,v in objs.items():
        os.makedirs(f'{O}/obj',exist_ok=True); v.save(f'{O}/obj/{k}.png'); idx[f'obj/{k}']={'frame':[48,48],'frames':1}
    DIRS=[0.0,-math.pi/2,math.pi/2,math.pi]
    for kind in ('priest','merchant','inn','shoesage','smith','dealer'):
        fr=[K.post(K.render(K.turn(npc(kind),y),64*4,view=1.4,cy=1.4*0.42),64,ow=3) for y in DIRS]
        save_strip(fr,f'{O}/npc/{kind}.png'); idx[f'npc/{kind}']={'frame':[64,64],'frames':4,'note':'下・左・右・上（マップのdirに対応）'}
    T=tiles()
    for k,v in T.items():
        os.makedirs(f'{O}/tiles',exist_ok=True); v.save(f'{O}/tiles/{k}.png'); idx[f'tiles/{k}']={'frame':[40,40],'frames':1}
    json.dump(idx,open(f'{O}/assets_index.json','w'),ensure_ascii=False,indent=1)
    print('ok',len(idx))
